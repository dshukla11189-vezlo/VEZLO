"""
Backend tests for Fixed Expenses enhancements:
- Date range filter mode
- Month/Year filter mode
- Corporate Employees CRUD
- Recurring Expense Templates CRUD
- Generate Recurring from templates
- Vendor / invoice_number fields on fixed expenses
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("BACKEND_URL")
if not BASE_URL:
    # Fall back to reading /app/frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].strip('"').strip("'")
                break
BASE_URL = BASE_URL.rstrip("/")

ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- Fixed Expenses Date Range / Month Modes ----------

class TestFixedExpenseFilters:
    def test_month_year_mode(self, client):
        r = client.get(f"{BASE_URL}/api/expenses/fixed?month=1&year=2026", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_date_range_mode(self, client):
        r = client.get(
            f"{BASE_URL}/api/expenses/fixed?from_date=2025-01-01&to_date=2026-12-31",
            timeout=30,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_default_current_month(self, client):
        r = client.get(f"{BASE_URL}/api/expenses/fixed", timeout=30)
        assert r.status_code == 200


class TestFixedExpenseVendorFields:
    created_id = None

    def test_create_with_vendor_and_invoice(self, client):
        payload = {
            "date": "2026-01-05",
            "month": 1,
            "year": 2026,
            "category": "TEST_Rent",
            "description": "TEST_vendor_invoice",
            "amount": 1234.56,
            "vendor": "TEST_Vendor_Inc",
            "invoice_number": "INV-TEST-001",
            "payment_mode": "bank_transfer",
            "payment_date": "2026-01-06",
            "payment_reference": "REF-TEST-777",
            "paid_by": "Company",
            "status": "Paid",
        }
        r = client.post(f"{BASE_URL}/api/expenses/fixed", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["vendor"] == "TEST_Vendor_Inc"
        assert data["invoice_number"] == "INV-TEST-001"
        assert data["payment_mode"] == "bank_transfer"
        assert "id" in data
        TestFixedExpenseVendorFields.created_id = data["id"]

    def test_get_persists_vendor_fields(self, client):
        assert TestFixedExpenseVendorFields.created_id
        r = client.get(f"{BASE_URL}/api/expenses/fixed?month=1&year=2026", timeout=30)
        assert r.status_code == 200
        rows = r.json()
        found = next((x for x in rows if x.get("id") == TestFixedExpenseVendorFields.created_id), None)
        assert found is not None, "Created expense not returned"
        assert found["vendor"] == "TEST_Vendor_Inc"
        assert found["invoice_number"] == "INV-TEST-001"
        assert found["payment_reference"] == "REF-TEST-777"

    def test_cleanup(self, client):
        if TestFixedExpenseVendorFields.created_id:
            r = client.delete(
                f"{BASE_URL}/api/expenses/fixed/{TestFixedExpenseVendorFields.created_id}",
                timeout=30,
            )
            assert r.status_code == 200


# ---------- Corporate Employees CRUD ----------

class TestCorporateEmployees:
    created_id = None

    def test_create(self, client):
        r = client.post(
            f"{BASE_URL}/api/corporate-employees",
            json={
                "name": f"TEST_Emp_{uuid.uuid4().hex[:6]}",
                "role": "Manager",
                "department": "Ops",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"].startswith("TEST_Emp_")
        assert data["role"] == "Manager"
        assert data["is_active"] is True
        TestCorporateEmployees.created_id = data["id"]

    def test_list_contains(self, client):
        r = client.get(f"{BASE_URL}/api/corporate-employees", timeout=30)
        assert r.status_code == 200
        ids = [e["id"] for e in r.json()]
        assert TestCorporateEmployees.created_id in ids

    def test_update(self, client):
        r = client.put(
            f"{BASE_URL}/api/corporate-employees/{TestCorporateEmployees.created_id}",
            json={"role": "Senior Manager"},
            timeout=30,
        )
        assert r.status_code == 200
        # verify
        r2 = client.get(f"{BASE_URL}/api/corporate-employees", timeout=30)
        me = next(e for e in r2.json() if e["id"] == TestCorporateEmployees.created_id)
        assert me["role"] == "Senior Manager"

    def test_delete_soft(self, client):
        r = client.delete(
            f"{BASE_URL}/api/corporate-employees/{TestCorporateEmployees.created_id}",
            timeout=30,
        )
        assert r.status_code == 200
        r2 = client.get(f"{BASE_URL}/api/corporate-employees", timeout=30)
        ids = [e["id"] for e in r2.json()]
        assert TestCorporateEmployees.created_id not in ids


# ---------- Recurring Expense Templates CRUD ----------

class TestRecurringTemplates:
    created_id = None

    def test_create(self, client):
        r = client.post(
            f"{BASE_URL}/api/recurring-expense-templates",
            json={
                "category": "TEST_Subscription",
                "description": f"TEST_tmpl_{uuid.uuid4().hex[:6]}",
                "amount": 999.99,
                "due_date": 5,
                "vendor": "TEST_Vendor",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["category"] == "TEST_Subscription"
        assert data["amount"] == 999.99
        assert data["due_date"] == 5
        assert data["is_active"] is True
        TestRecurringTemplates.created_id = data["id"]

    def test_missing_fields_400(self, client):
        r = client.post(
            f"{BASE_URL}/api/recurring-expense-templates",
            json={"description": "no cat"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_list_contains(self, client):
        r = client.get(f"{BASE_URL}/api/recurring-expense-templates", timeout=30)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestRecurringTemplates.created_id in ids

    def test_update(self, client):
        r = client.put(
            f"{BASE_URL}/api/recurring-expense-templates/{TestRecurringTemplates.created_id}",
            json={"amount": 1500.0},
            timeout=30,
        )
        assert r.status_code == 200
        r2 = client.get(f"{BASE_URL}/api/recurring-expense-templates", timeout=30)
        me = next(t for t in r2.json() if t["id"] == TestRecurringTemplates.created_id)
        assert me["amount"] == 1500.0


class TestGenerateRecurring:
    def test_generate_uses_templates(self, client):
        # Use a far-future month unlikely to have data
        r = client.post(
            f"{BASE_URL}/api/expenses/fixed/generate-recurring",
            json={"month": 11, "year": 2030},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "count" in data
        assert "from_templates" in data
        assert "from_prev_month" in data
        # Our created active template should have been generated
        assert data["from_templates"] >= 1

        # Verify a fixed expense referencing our template exists
        r2 = client.get(f"{BASE_URL}/api/expenses/fixed?month=11&year=2030", timeout=30)
        assert r2.status_code == 200
        rows = r2.json()
        assert any(
            e.get("template_id") == TestRecurringTemplates.created_id for e in rows
        ), "Generated expense not linked back to template"

        # Cleanup: delete generated expenses for that month
        for e in rows:
            if e.get("template_id") == TestRecurringTemplates.created_id:
                client.delete(f"{BASE_URL}/api/expenses/fixed/{e['id']}", timeout=30)

    def test_idempotent_generate(self, client):
        # Second call should NOT re-create
        r1 = client.post(
            f"{BASE_URL}/api/expenses/fixed/generate-recurring",
            json={"month": 11, "year": 2030},
            timeout=60,
        )
        assert r1.status_code == 200
        r2 = client.post(
            f"{BASE_URL}/api/expenses/fixed/generate-recurring",
            json={"month": 11, "year": 2030},
            timeout=60,
        )
        assert r2.status_code == 200
        # After first call recreates once, second should return 0 or no duplicates
        assert r2.json().get("from_templates", 1) == 0

        # cleanup
        rows = client.get(
            f"{BASE_URL}/api/expenses/fixed?month=11&year=2030", timeout=30
        ).json()
        for e in rows:
            if e.get("template_id") == TestRecurringTemplates.created_id:
                client.delete(f"{BASE_URL}/api/expenses/fixed/{e['id']}", timeout=30)


class TestRecurringTemplatesCleanup:
    def test_delete_template(self, client):
        if TestRecurringTemplates.created_id:
            r = client.delete(
                f"{BASE_URL}/api/recurring-expense-templates/{TestRecurringTemplates.created_id}",
                timeout=30,
            )
            assert r.status_code == 200
            # Verify not in listing
            r2 = client.get(f"{BASE_URL}/api/recurring-expense-templates", timeout=30)
            ids = [t["id"] for t in r2.json()]
            assert TestRecurringTemplates.created_id not in ids
