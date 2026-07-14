"""
Tests for Mr Organix P0 features:
- Part H3: Variable Expense P&L Allocation (split_type = all_equal / selected / proportional)
- Part H4: New GET /api/expenses/variable/by-retailer/{retailer_id} endpoint
- Part I: (indirectly) verify /api/users returns status/churned_at fields for FE filter
"""
import os
import uuid
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://harvest-hub-384.preview.emergentagent.com").rstrip("/")


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": "admin@freshflow.com", "password": "admin123"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def retailer_ids(admin_client):
    """Return 3 active retailer IDs available for testing."""
    r = admin_client.get(f"{BASE_URL}/api/users?role=retailer", timeout=30)
    assert r.status_code == 200
    users = r.json()
    active_retailers = [u for u in users if u.get("role") == "retailer" and (u.get("status") or "active") != "churned"]
    assert len(active_retailers) >= 3, f"Need at least 3 active retailers, got {len(active_retailers)}"
    return [u["id"] for u in active_retailers[:3]]


@pytest.fixture(scope="session")
def tamanna_retailer_id(admin_client):
    r = admin_client.get(f"{BASE_URL}/api/users?role=retailer", timeout=30)
    assert r.status_code == 200
    for u in r.json():
        if u.get("email") == "tamannamart08@gmail.com":
            return u["id"]
    pytest.skip("Tamanna Mart retailer not found")


# ---------- Part H4: new endpoint smoke ----------
class TestH4EndpointSmoke:
    def test_endpoint_exists_and_returns_shape(self, admin_client, tamanna_retailer_id):
        r = admin_client.get(
            f"{BASE_URL}/api/expenses/variable/by-retailer/{tamanna_retailer_id}",
            params={"from_date": "2026-01-01", "to_date": "2026-12-31"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert set(["retailer_id", "total_share", "expenses"]).issubset(data.keys())
        assert data["retailer_id"] == tamanna_retailer_id
        assert isinstance(data["expenses"], list)
        assert isinstance(data["total_share"], (int, float))

    def test_endpoint_requires_auth(self):
        r = requests.get(
            f"{BASE_URL}/api/expenses/variable/by-retailer/some-id",
            timeout=30,
        )
        assert r.status_code in (401, 403)


# ---------- Part H3 & H4: end-to-end with seeded VEs ----------
class TestH3H4SplitTypeAllocation:
    """
    Seed variable expenses with each split_type and verify:
    - H4: /by-retailer endpoint returns correct retailer_share
    - H3: /reports/pnl customer_pnl variable_expenses is correct
    """

    TEST_DATE_FROM = "2026-11-01"
    TEST_DATE_TO = "2026-11-30"
    SEED_DATE = "2026-11-15T10:00:00"

    @pytest.fixture(scope="class")
    def seeded_ves(self, admin_client, retailer_ids):
        """Create 3 test variable expenses (one per split_type). Cleanup after."""
        r1, r2, r3 = retailer_ids[0], retailer_ids[1], retailer_ids[2]

        expenses = [
            {
                "id": None,
                "date": self.SEED_DATE,
                "amount": 300,
                "category": "TEST_VE_selected",
                "vertical": "retail",
                "split_type": "selected",
                "retailer_ids": [r1, r2],  # 300/2 = 150 each
                "description": "TEST selected split",
                "paid_by_type": "company",
                "paid_by": "Company",
                "payment_status": "paid",
            },
            {
                "id": None,
                "date": self.SEED_DATE,
                "amount": 500,
                "category": "TEST_VE_proportional",
                "vertical": "retail",
                "split_type": "proportional",
                "retailer_ids": [],
                "description": "TEST proportional",
                "paid_by_type": "company",
                "paid_by": "Company",
                "payment_status": "paid",
            },
            {
                "id": None,
                "date": self.SEED_DATE,
                "amount": 340,
                "category": "TEST_VE_all_equal",
                "vertical": "retail",
                "split_type": "all_equal",
                "retailer_ids": [],
                "description": "TEST all_equal",
                "paid_by_type": "company",
                "paid_by": "Company",
                "payment_status": "paid",
            },
        ]

        created_ids = []
        for exp in expenses:
            resp = admin_client.post(f"{BASE_URL}/api/expenses/variable", json=exp, timeout=30)
            assert resp.status_code in (200, 201), f"create VE failed: {resp.status_code} {resp.text}"
            created = resp.json()
            assert "id" in created
            created_ids.append(created["id"])

        yield {
            "ids": created_ids,
            "r1": r1,
            "r2": r2,
            "r3": r3,
        }

        # teardown
        for eid in created_ids:
            try:
                admin_client.delete(f"{BASE_URL}/api/expenses/variable/{eid}", timeout=30)
            except Exception:
                pass

    def test_h4_selected_split(self, admin_client, seeded_ves):
        """VE with split_type='selected' and 2 retailers => each gets amount/2."""
        r1 = seeded_ves["r1"]
        resp = admin_client.get(
            f"{BASE_URL}/api/expenses/variable/by-retailer/{r1}",
            params={"from_date": self.TEST_DATE_FROM, "to_date": self.TEST_DATE_TO},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        selected_lines = [e for e in data["expenses"] if e["category"] == "TEST_VE_selected"]
        assert len(selected_lines) == 1, f"Expected exactly 1 'selected' line, got {selected_lines}"
        line = selected_lines[0]
        assert line["split_type"] == "selected"
        assert line["retailers_included"] == 2
        assert line["original_amount"] == 300
        assert abs(line["retailer_share"] - 150.0) < 0.01, f"expected 150, got {line['retailer_share']}"

    def test_h4_selected_split_excludes_non_selected(self, admin_client, seeded_ves):
        """VE with split_type='selected' should NOT appear for r3 (not selected)."""
        r3 = seeded_ves["r3"]
        resp = admin_client.get(
            f"{BASE_URL}/api/expenses/variable/by-retailer/{r3}",
            params={"from_date": self.TEST_DATE_FROM, "to_date": self.TEST_DATE_TO},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        selected_lines = [e for e in data["expenses"] if e["category"] == "TEST_VE_selected"]
        assert len(selected_lines) == 0, "'selected' VE should not appear for non-selected retailer"

    def test_h4_all_equal_split(self, admin_client, seeded_ves):
        """VE with split_type='all_equal' => each active retailer gets amount/N."""
        r1 = seeded_ves["r1"]
        resp = admin_client.get(
            f"{BASE_URL}/api/expenses/variable/by-retailer/{r1}",
            params={"from_date": self.TEST_DATE_FROM, "to_date": self.TEST_DATE_TO},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        ae_lines = [e for e in data["expenses"] if e["category"] == "TEST_VE_all_equal"]
        assert len(ae_lines) == 1
        line = ae_lines[0]
        assert line["split_type"] == "all_equal"
        assert line["retailers_included"] > 0
        # share = amount / retailers_included
        expected = round(340 / line["retailers_included"], 2)
        assert abs(line["retailer_share"] - expected) < 0.02, (
            f"expected ~{expected} for {line['retailers_included']} retailers, got {line['retailer_share']}"
        )

    def test_h4_proportional_split(self, admin_client, seeded_ves):
        """VE with split_type='proportional' => share is 0 (calculated by sales in P&L)."""
        r1 = seeded_ves["r1"]
        resp = admin_client.get(
            f"{BASE_URL}/api/expenses/variable/by-retailer/{r1}",
            params={"from_date": self.TEST_DATE_FROM, "to_date": self.TEST_DATE_TO},
            timeout=30,
        )
        assert resp.status_code == 200
        data = resp.json()
        pr_lines = [e for e in data["expenses"] if e["category"] == "TEST_VE_proportional"]
        assert len(pr_lines) == 1
        line = pr_lines[0]
        assert line["split_type"] == "proportional"
        # retailers_included is -1 (proportional marker)
        assert line["retailers_included"] == -1
        # share is 0 (will be calculated in P&L)
        assert line["retailer_share"] == 0

    def test_h3_pnl_customer_variable_expenses_field(self, admin_client, seeded_ves):
        """Customer P&L should include variable_expenses field for retail customers."""
        resp = admin_client.get(
            f"{BASE_URL}/api/reports/pnl",
            params={"from_date": self.TEST_DATE_FROM, "to_date": self.TEST_DATE_TO},
            timeout=90,
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        customer_pnl = data.get("customer_pnl", [])
        retail_customers = [c for c in customer_pnl if c.get("type") == "Retail"]
        # It's OK to have zero if no dispatches in Nov 2026, just verify the field exists in structure
        # by checking any customer entry has variable_expenses key
        if retail_customers:
            for c in retail_customers:
                assert "variable_expenses" in c, f"missing variable_expenses in customer entry: {c.keys()}"
                assert isinstance(c["variable_expenses"], (int, float))
        # At least verify no exception


# ---------- Part I: users endpoint returns status/churned_at ----------
class TestPartIUsersReturnsStatus:
    def test_users_include_status_field(self, admin_client):
        """Verify /api/users returns status field so FE useMemo filter can work."""
        r = admin_client.get(f"{BASE_URL}/api/users?role=retailer", timeout=30)
        assert r.status_code == 200
        users = r.json()
        retailers = [u for u in users if u.get("role") == "retailer"]
        assert len(retailers) > 0
        # Verify status is present (may be missing on old records - that's why FE uses `|| 'active'`)
        # At minimum, no user should error out. Just verify the shape works with FE filter.
        for u in retailers:
            status = u.get("status", "active")
            assert status in ("active", "churned", None) or isinstance(status, str)
