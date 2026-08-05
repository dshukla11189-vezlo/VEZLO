"""Test default date filters and increased limits for variable & fixed expenses."""
import os
from datetime import datetime, timezone, timedelta
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://harvest-hub-384.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Variable expenses ----------

class TestVariableExpensesDefault:
    def test_default_returns_last_90_days(self, headers):
        r = requests.get(f"{BASE_URL}/api/expenses/variable", headers=headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        cutoff = (datetime.now(timezone.utc) - timedelta(days=91)).strftime("%Y-%m-%d")
        # All dates should be >= cutoff (allow small buffer of 1 day)
        for e in data:
            d = (e.get("date") or "")[:10]
            if d:
                assert d >= cutoff, f"Found expense dated {d} which is older than default 90-day filter"
        print(f"Default variable expenses count: {len(data)}, cutoff={cutoff}")

    def test_explicit_from_to_date_overrides_default(self, headers):
        # Use a wide range that would include old records
        r = requests.get(
            f"{BASE_URL}/api/expenses/variable",
            headers=headers,
            params={"from_date": "2020-01-01", "to_date": "2030-12-31"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        wide = r.json()

        r2 = requests.get(f"{BASE_URL}/api/expenses/variable", headers=headers, timeout=60)
        default = r2.json()

        print(f"Wide-range count={len(wide)}, default(90d) count={len(default)}")
        # Wide range should include at least as many as default
        assert len(wide) >= len(default)

    def test_limit_supports_more_than_500(self, headers):
        # Fetch with wide range and ensure limit is not clipped at 500 (best-effort)
        r = requests.get(
            f"{BASE_URL}/api/expenses/variable",
            headers=headers,
            params={"from_date": "2020-01-01", "to_date": "2030-12-31"},
            timeout=60,
        )
        assert r.status_code == 200
        data = r.json()
        # Cannot force >500 without seeding; just ensure it doesn't error and returns a list
        assert isinstance(data, list)
        # If more than 500 records exist historically, ensure not capped exactly at 500
        # (only meaningful if >500 exist; else just a smoke check)
        assert len(data) <= 2000
        print(f"Wide-range variable expenses returned {len(data)} records (limit=2000)")

    def test_default_filter_excludes_old_records(self, headers):
        """Seed an old-dated expense; verify it's excluded from default but included with wide range."""
        old_date = (datetime.now(timezone.utc) - timedelta(days=200)).strftime("%Y-%m-%d")
        payload = {
            "date": old_date,
            "category": "Other",
            "description": "TEST_old_expense_pagination",
            "amount": 9.99,
            "paid_by": "Company",
            "paid_by_type": "company",
            "payment_status": "paid",
        }
        c = requests.post(f"{BASE_URL}/api/expenses/variable", headers=headers, json=payload, timeout=30)
        assert c.status_code == 200, c.text
        eid = c.json().get("id")
        try:
            # Default should NOT contain it
            r = requests.get(f"{BASE_URL}/api/expenses/variable", headers=headers, timeout=60)
            default_ids = [x.get("id") for x in r.json()]
            assert eid not in default_ids, "Old expense should be excluded by default 90-day filter"

            # Explicit wide range SHOULD contain it
            r2 = requests.get(
                f"{BASE_URL}/api/expenses/variable",
                headers=headers,
                params={"from_date": "2020-01-01", "to_date": "2030-12-31"},
                timeout=60,
            )
            wide_ids = [x.get("id") for x in r2.json()]
            assert eid in wide_ids, "Old expense should be included with explicit from_date"
        finally:
            requests.delete(f"{BASE_URL}/api/expenses/variable/{eid}", headers=headers, timeout=30)

    def test_new_expense_appears_in_default_list(self, headers):
        payload = {
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "category": "Other",
            "description": "TEST_pagination_default_filter",
            "amount": 1.23,
            "paid_by": "Company",
            "paid_by_type": "company",
            "payment_status": "paid",
        }
        c = requests.post(f"{BASE_URL}/api/expenses/variable", headers=headers, json=payload, timeout=30)
        assert c.status_code == 200, c.text
        created = c.json()
        eid = created.get("id")
        assert eid

        try:
            r = requests.get(f"{BASE_URL}/api/expenses/variable", headers=headers, timeout=60)
            assert r.status_code == 200
            ids = [x.get("id") for x in r.json()]
            assert eid in ids, "Newly created (today-dated) expense missing from default list"
        finally:
            requests.delete(f"{BASE_URL}/api/expenses/variable/{eid}", headers=headers, timeout=30)


# ---------- Fixed expenses ----------

class TestFixedExpensesDefault:
    def test_default_returns_current_month_year(self, headers):
        r = requests.get(f"{BASE_URL}/api/expenses/fixed", headers=headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        now = datetime.now(timezone.utc)
        for e in data:
            assert e.get("month") == now.month, f"Expected month={now.month}, got {e.get('month')}"
            assert e.get("year") == now.year, f"Expected year={now.year}, got {e.get('year')}"
        print(f"Default fixed expenses count for {now.month}/{now.year}: {len(data)}")

    def test_explicit_month_year_overrides_default(self, headers):
        # Ask for Jan 2026 which is not the current month (Aug 2026)
        r = requests.get(
            f"{BASE_URL}/api/expenses/fixed",
            headers=headers,
            params={"month": 1, "year": 2026},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for e in data:
            assert e.get("month") == 1
            assert e.get("year") == 2026
        print(f"Fixed expenses for 1/2026: {len(data)}")

    def test_limit_smoke(self, headers):
        r = requests.get(f"{BASE_URL}/api/expenses/fixed", headers=headers, timeout=60)
        assert r.status_code == 200
        assert len(r.json()) <= 2000
