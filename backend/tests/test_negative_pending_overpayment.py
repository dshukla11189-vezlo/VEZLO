"""
Tests for negative pending_amount (overpayment) behavior in procurement payments.
Covers:
- Backend allows pending_amount to be negative when paid > total.
- Payment update (PUT) allows negative pending.
- Payment delete recomputes pending correctly.
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def token():
    # login uses identifier field
    for payload in (
        {"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    ):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=30)
        if r.status_code == 200:
            data = r.json()
            return data.get("access_token") or data.get("token")
    pytest.skip(f"Login failed: {r.status_code} {r.text}")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def farmer(headers):
    # Get an existing farmer or create one
    r = requests.get(f"{BASE_URL}/api/farmers", headers=headers, timeout=30)
    assert r.status_code == 200
    farmers = r.json()
    if farmers:
        return farmers[0]
    # Create test farmer
    payload = {"name": f"TEST_Farmer_{uuid.uuid4().hex[:6]}", "contact": "9999999999", "address": "Test"}
    r = requests.post(f"{BASE_URL}/api/farmers", headers=headers, json=payload, timeout=30)
    assert r.status_code in (200, 201)
    return r.json()


@pytest.fixture(scope="module")
def product(headers):
    r = requests.get(f"{BASE_URL}/api/products?include_images=false", headers=headers, timeout=30)
    assert r.status_code == 200
    prods = r.json()
    assert prods, "No products found"
    return prods[0]


@pytest.fixture
def procurement(headers, farmer, product):
    """Create a fresh procurement with total=1000, no payment."""
    payload = {
        "date": datetime.now(timezone.utc).isoformat(),
        "farmer_id": farmer["id"],
        "farmer_name": farmer["name"],
        "products": [{
            "product_id": product["id"],
            "product_name": product["name"],
            "quantity": 10,
            "unit": product.get("unit", "Kg"),
            "unit_size": "",
            "rate": 100,
            "total": 1000,
        }],
        "total_amount": 1000,
        "paid_amount": 0,
        "pending_amount": 1000,
        "payment_status": "pending",
        "status": "completed",
        "remark": "TEST_overpay",
    }
    r = requests.post(f"{BASE_URL}/api/procurement", headers=headers, json=payload, timeout=30)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
    proc = r.json()
    yield proc
    # Teardown
    requests.delete(f"{BASE_URL}/api/procurement/{proc['id']}", headers=headers, timeout=30)


def _get_procurement(headers, proc_id):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    r = requests.get(f"{BASE_URL}/api/procurement?from_date={today}&to_date={today}", headers=headers, timeout=30)
    assert r.status_code == 200
    for p in r.json():
        if p["id"] == proc_id:
            return p
    return None


def test_overpayment_creates_negative_pending(headers, procurement):
    """POST /api/procurement/{id}/payments with amount > total_amount should yield negative pending."""
    proc_id = procurement["id"]
    # Pay 1500 for a 1000 procurement -> overpaid by 500
    payload = {
        "amount": 1500,
        "payment_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "payment_mode": "cash",
        "paid_by_type": "company",
    }
    r = requests.post(f"{BASE_URL}/api/procurement/{proc_id}/payments", headers=headers, json=payload, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"

    proc = _get_procurement(headers, proc_id)
    assert proc is not None
    assert proc["paid_amount"] == 1500
    assert proc["pending_amount"] == -500, f"Expected -500, got {proc['pending_amount']}"
    assert proc["payment_status"] == "paid"


def test_payment_update_allows_negative_pending(headers, procurement):
    proc_id = procurement["id"]
    # Create a payment of 500
    r = requests.post(
        f"{BASE_URL}/api/procurement/{proc_id}/payments",
        headers=headers,
        json={"amount": 500, "payment_mode": "cash", "paid_by_type": "company"},
        timeout=30,
    )
    assert r.status_code in (200, 201)
    payment_id = r.json()["id"]

    # Update payment amount to 1800 (overpay)
    r = requests.put(
        f"{BASE_URL}/api/procurement-payments/{payment_id}",
        headers=headers,
        json={"amount": 1800, "payment_mode": "cash", "paid_by_type": "company"},
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text}"

    proc = _get_procurement(headers, proc_id)
    assert proc["paid_amount"] == 1800
    assert proc["pending_amount"] == -800
    assert proc["payment_status"] == "paid"


def test_payment_delete_recomputes_pending(headers, procurement):
    proc_id = procurement["id"]
    # Create 2 payments: 700 and 800 (overpaid by 500)
    r1 = requests.post(f"{BASE_URL}/api/procurement/{proc_id}/payments", headers=headers,
                       json={"amount": 700, "payment_mode": "cash", "paid_by_type": "company"}, timeout=30)
    r2 = requests.post(f"{BASE_URL}/api/procurement/{proc_id}/payments", headers=headers,
                       json={"amount": 800, "payment_mode": "cash", "paid_by_type": "company"}, timeout=30)
    assert r1.status_code in (200, 201) and r2.status_code in (200, 201)

    proc = _get_procurement(headers, proc_id)
    assert proc["pending_amount"] == -500

    # Delete one payment (800), pending should become 300 (positive)
    p2_id = r2.json()["id"]
    r = requests.delete(f"{BASE_URL}/api/procurement-payments/{p2_id}", headers=headers, timeout=30)
    assert r.status_code == 200

    proc = _get_procurement(headers, proc_id)
    assert proc["paid_amount"] == 700
    assert proc["pending_amount"] == 300
    assert proc["payment_status"] == "partial"
