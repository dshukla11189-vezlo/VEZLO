"""
Backend tests for backdated invoice deletion & regeneration (Rules #1-#7).

Endpoints tested:
- DELETE /api/retailer-invoices/{id}
- POST   /api/retailer-invoices/{id}/regenerate
- GET    /api/retailer-payments/orphans
- POST   /api/retailer-payments/{id}/relink

Test data is created directly in MongoDB with a "TEST_" prefix so that
production/user data is never mutated.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://harvest-hub-384.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN = {"identifier": "admin@freshflow.com", "password": "admin123"}
STAFF = {"identifier": "vanitachopade99@gmail.com", "password": "staff123"}


# ---------- helpers ----------
def login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="session")
def admin_auth():
    t, u = login(ADMIN)
    return {"token": t, "user": u, "headers": {"Authorization": f"Bearer {t}"}}


@pytest.fixture(scope="session")
def staff_auth():
    t, u = login(STAFF)
    return {"token": t, "user": u, "headers": {"Authorization": f"Bearer {t}"}}


@pytest.fixture(scope="session")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------- data factories ----------
async def _pick_retailer(db):
    r = await db.users.find_one({"role": "retailer"}, {"_id": 0, "id": 1, "name": 1, "company_name": 1, "commission_percentage": 1, "upfront_collection_percentage": 1})
    return r


async def create_test_invoice(db, backdated=True, with_payment=False, paid_amount=0.0, with_credit_note=False):
    """Insert a synthetic invoice (+ optional payment/CN) directly into MongoDB."""
    retailer = await _pick_retailer(db)
    assert retailer, "No retailer found in DB to build test invoice"
    inv_id = str(uuid.uuid4())
    inv_number = f"TEST-INV-{uuid.uuid4().hex[:8].upper()}"
    inv_date = (datetime.now(timezone.utc) - timedelta(days=5)) if backdated else datetime.now(timezone.utc)
    net_payable = 500.0
    invoice_doc = {
        "id": inv_id,
        "invoice_number": inv_number,
        "retailer_id": retailer["id"],
        "retailer_name": retailer.get("company_name") or retailer.get("name"),
        "invoice_date": inv_date.isoformat(),
        "dispatch_ids": [],
        "items": [{"product_id": "test-p", "product_name": "TestProd", "quantity": 1,
                    "supplied_qty": 1, "rejected_qty": 0, "mrp": 500.0, "total_value": 500.0}],
        "total_mrp_value": 500.0,
        "commission_percentage": 0,
        "commission_amount": 0,
        "net_payable": net_payable,
        "final_payable": net_payable,
        "paid_amount": paid_amount,
        "remaining_amount": max(0, net_payable - paid_amount),
        "status": "paid" if paid_amount >= net_payable else ("partial" if paid_amount > 0 else "pending"),
        "payment_status": "paid" if paid_amount >= net_payable else ("partial" if paid_amount > 0 else "pending"),
        "credit_note_adjustments": [],
        "total_credit_adjusted": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "_test_marker": "TEST_backdated_delete",
    }

    cn_id = None
    if with_credit_note:
        cn_id = str(uuid.uuid4())
        cn_doc = {
            "id": cn_id,
            "credit_note_number": f"TEST-CN-{uuid.uuid4().hex[:6].upper()}",
            "retailer_id": retailer["id"],
            "amount": 200.0,
            "adjusted_amount": 200.0,
            "pending_amount": 0.0,
            "status": "adjusted",
            "source": "rejection",
            "adjusted_in_invoices": [{"invoice_id": inv_id, "invoice_number": inv_number, "adjusted_amount": 200.0}],
            "adjusted_against_invoices": [{"invoice_id": inv_id, "invoice_number": inv_number}],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": "TEST_backdated_delete",
        }
        await db.retailer_credit_notes.insert_one(cn_doc)
        invoice_doc["credit_note_adjustments"] = [{
            "credit_note_id": cn_id,
            "credit_note_number": cn_doc["credit_note_number"],
            "adjusted_amount": 200.0,
        }]
        invoice_doc["total_credit_adjusted"] = 200.0
        invoice_doc["final_payable"] = 300.0

    await db.retailer_invoices.insert_one(invoice_doc)

    pay_id = None
    if with_payment:
        pay_id = str(uuid.uuid4())
        pay_doc = {
            "id": pay_id,
            "retailer_id": retailer["id"],
            "invoice_id": inv_id,
            "invoice_number": inv_number,
            "amount": paid_amount or 100.0,
            "payment_date": datetime.now(timezone.utc).isoformat(),
            "payment_method": "cash",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": "TEST_backdated_delete",
        }
        await db.retailer_payments.insert_one(pay_doc)

    return {"invoice_id": inv_id, "invoice_number": inv_number, "retailer_id": retailer["id"],
            "cn_id": cn_id, "payment_id": pay_id}


async def cleanup_test_docs(db):
    await db.retailer_invoices.delete_many({"_test_marker": "TEST_backdated_delete"})
    await db.retailer_credit_notes.delete_many({"_test_marker": "TEST_backdated_delete"})
    await db.retailer_payments.delete_many({"_test_marker": "TEST_backdated_delete"})
    await db.deleted_invoices_audit.delete_many({"deleted_invoice_number": {"$regex": "^TEST-INV-"}})


@pytest.fixture(scope="module", autouse=True)
def _cleanup_at_end(db):
    yield
    run(cleanup_test_docs(db))


# ---------- tests ----------
class TestAuth:
    def test_admin_login(self, admin_auth):
        assert admin_auth["user"]["role"] == "admin"

    def test_staff_login(self, staff_auth):
        assert staff_auth["user"]["role"] == "staff"


class TestOrphansEndpointShape:
    def test_orphans_response_has_both_arrays(self, admin_auth):
        r = requests.get(f"{BASE_URL}/api/retailer-payments/orphans",
                         headers=admin_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # must expose both arrays per Rule #2 + relink flow
        for key in ("orphan_payments", "needs_relinking", "orphan_count", "needs_relinking_count", "total_payments"):
            assert key in d, f"missing key {key} in orphans response"
        assert isinstance(d["orphan_payments"], list)
        assert isinstance(d["needs_relinking"], list)

    def test_orphans_forbidden_for_staff(self, staff_auth):
        r = requests.get(f"{BASE_URL}/api/retailer-payments/orphans",
                         headers=staff_auth["headers"], timeout=30)
        assert r.status_code == 403


class TestBackdatedDeleteRBAC:
    """Rule #6: staff 403 on backdated delete, admin succeeds."""

    def test_staff_cannot_delete_backdated_invoice(self, db, staff_auth):
        data = run(create_test_invoice(db, backdated=True))
        try:
            r = requests.delete(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}",
                                headers=staff_auth["headers"], timeout=30)
            assert r.status_code == 403, f"expected 403 for staff, got {r.status_code}: {r.text}"
            # invoice should still exist
            still = run(db.retailer_invoices.find_one({"id": data["invoice_id"]}))
            assert still is not None
        finally:
            run(db.retailer_invoices.delete_one({"id": data["invoice_id"]}))

    def test_admin_can_delete_backdated_invoice(self, db, admin_auth):
        data = run(create_test_invoice(db, backdated=True, with_payment=True, paid_amount=100.0,
                                       with_credit_note=True))
        r = requests.delete(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}",
                            headers=admin_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Response fields per Rule #2 & #7
        assert body.get("credit_notes_reset") == 1, body
        assert body.get("payments_unlinked") == 1, body
        assert "deletion_audit_id" in body

        # invoice actually gone
        gone = run(db.retailer_invoices.find_one({"id": data["invoice_id"]}))
        assert gone is None

        # payment unlinked & flagged
        pay = run(db.retailer_payments.find_one({"id": data["payment_id"]}, {"_id": 0}))
        assert pay is not None, "payment must not be deleted"
        assert pay.get("needs_relinking") is True
        assert pay.get("invoice_id") in (None, "")
        assert pay.get("original_invoice_id") == data["invoice_id"]

        # credit note fully reset (Rule #7)
        cn = run(db.retailer_credit_notes.find_one({"id": data["cn_id"]}, {"_id": 0}))
        assert cn is not None
        assert cn.get("adjusted_amount") == 0
        assert cn.get("pending_amount") == 200.0
        assert cn.get("status") == "pending"
        assert cn.get("adjusted_in_invoices") == []

        # audit trail
        audit = run(db.deleted_invoices_audit.find_one({"deleted_invoice_id": data["invoice_id"]}))
        assert audit is not None
        assert audit.get("payments_unlinked") == 1
        assert audit.get("credit_notes_reset") == 1


class TestOrphansAndRelink:
    """After admin delete, unlinked payment shows up in needs_relinking, and relink re-attaches it."""

    def test_needs_relinking_visible_after_delete(self, db, admin_auth):
        data = run(create_test_invoice(db, backdated=True, with_payment=True, paid_amount=100.0))
        r = requests.delete(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}",
                            headers=admin_auth["headers"], timeout=30)
        assert r.status_code == 200

        orphans = requests.get(f"{BASE_URL}/api/retailer-payments/orphans",
                               headers=admin_auth["headers"], timeout=30).json()
        ids = [p["id"] for p in orphans.get("needs_relinking", [])]
        assert data["payment_id"] in ids, "unlinked payment missing from needs_relinking list"

    def test_relink_updates_paid_amount(self, db, admin_auth):
        # Create source invoice with payment then admin-delete
        src = run(create_test_invoice(db, backdated=True, with_payment=True, paid_amount=150.0))
        assert requests.delete(f"{BASE_URL}/api/retailer-invoices/{src['invoice_id']}",
                               headers=admin_auth["headers"], timeout=30).status_code == 200

        # Create a fresh target invoice (same retailer) with paid_amount=0
        tgt_id = str(uuid.uuid4())
        tgt_num = f"TEST-INV-{uuid.uuid4().hex[:8].upper()}"
        run(db.retailer_invoices.insert_one({
            "id": tgt_id, "invoice_number": tgt_num, "retailer_id": src["retailer_id"],
            "invoice_date": datetime.now(timezone.utc).isoformat(),
            "items": [], "total_mrp_value": 500.0, "net_payable": 500.0, "final_payable": 500.0,
            "paid_amount": 0.0, "status": "pending", "payment_status": "pending",
            "_test_marker": "TEST_backdated_delete",
        }))

        r = requests.post(f"{BASE_URL}/api/retailer-payments/{src['payment_id']}/relink",
                          json={"invoice_id": tgt_id},
                          headers=admin_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text

        # verify payment linked
        pay = run(db.retailer_payments.find_one({"id": src["payment_id"]}, {"_id": 0}))
        assert pay["invoice_id"] == tgt_id
        assert pay["invoice_number"] == tgt_num
        assert "needs_relinking" not in pay

        # verify invoice paid_amount updated
        inv = run(db.retailer_invoices.find_one({"id": tgt_id}, {"_id": 0}))
        assert inv["paid_amount"] == 150.0
        assert inv["status"] in ("partial", "paid")

    def test_relink_staff_forbidden(self, db, staff_auth):
        r = requests.post(f"{BASE_URL}/api/retailer-payments/fake/relink",
                          json={"invoice_id": "x"}, headers=staff_auth["headers"], timeout=30)
        assert r.status_code == 403


class TestRegenerateEndpoint:
    def test_regenerate_forbidden_for_staff(self, db, staff_auth):
        data = run(create_test_invoice(db, backdated=True))
        try:
            r = requests.post(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}/regenerate",
                              json={}, headers=staff_auth["headers"], timeout=30)
            assert r.status_code == 403
        finally:
            run(db.retailer_invoices.delete_one({"id": data["invoice_id"]}))

    def test_regenerate_admin_restores_payments_and_stamp(self, db, admin_auth):
        data = run(create_test_invoice(db, backdated=True, with_payment=True, paid_amount=500.0,
                                       with_credit_note=False))
        r = requests.post(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}/regenerate",
                          json={}, headers=admin_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # Rule #4: same invoice number
        new_id = body.get("id") or body.get("invoice_id")
        assert body.get("invoice_number") == data["invoice_number"], body

        # new invoice exists
        new_inv = run(db.retailer_invoices.find_one({"invoice_number": data["invoice_number"]}, {"_id": 0}))
        assert new_inv is not None
        # tag as test doc so cleanup removes it
        run(db.retailer_invoices.update_one({"id": new_inv["id"]}, {"$set": {"_test_marker": "TEST_backdated_delete"}}))

        # Rule #5: revision stamp present
        assert new_inv.get("revision_stamp") or new_inv.get("revised_on") or new_inv.get("is_revised") or \
               "revised" in str(new_inv).lower(), "no revision stamp on regenerated invoice"

        # Rule #2: payment relinked to new invoice
        pay = run(db.retailer_payments.find_one({"id": data["payment_id"]}, {"_id": 0}))
        assert pay["invoice_id"] == new_inv["id"]
        assert pay["invoice_number"] == data["invoice_number"]
        assert "needs_relinking" not in pay
        assert new_inv.get("paid_amount") == 500.0
