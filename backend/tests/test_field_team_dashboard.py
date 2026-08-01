"""Field Team Dashboard API tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://harvest-hub-384.preview.emergentagent.com').rstrip('/')

FIELD_TEAM_EMAIL = "adb@gmail.com"
FIELD_TEAM_PASSWORD = "fieldteam123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "identifier": FIELD_TEAM_EMAIL,
        "password": FIELD_TEAM_PASSWORD
    })
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


class TestFieldTeamAuth:
    def test_login_returns_field_team_role(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={
            "identifier": FIELD_TEAM_EMAIL, "password": FIELD_TEAM_PASSWORD
        })
        assert r.status_code == 200
        data = r.json()
        user = data.get("user", {})
        assert user.get("role") == "field_team", f"Expected role field_team, got {user.get('role')}"


class TestAssignedRetailers:
    def test_get_assigned_retailers(self, headers):
        r = requests.get(f"{BASE_URL}/api/field-team/assigned-retailers", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "retailers" in data
        assert "assigned_count" in data
        assert data["assigned_count"] >= 2, f"Expected at least 2 retailers, got {data['assigned_count']}"
        # Verify no _id leak
        for retailer in data["retailers"]:
            assert "_id" not in retailer
            assert "password" not in retailer

    def test_unauthenticated_rejected(self):
        r = requests.get(f"{BASE_URL}/api/field-team/assigned-retailers")
        assert r.status_code in (401, 403)


class TestPortfolioSummary:
    def test_portfolio_summary(self, headers):
        r = requests.get(f"{BASE_URL}/api/field-team/portfolio-summary", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "total_retailers" in data
        assert "summary" in data
        assert "retailer_summaries" in data
        assert data["total_retailers"] >= 2
        summary = data["summary"]
        for key in ("total_outstanding", "immediately_payable", "overdue", "pending_indents",
                    "today_dispatches", "today_dispatch_value"):
            assert key in summary
        # Each retailer summary should have required fields
        for rs in data["retailer_summaries"]:
            for key in ("retailer_id", "retailer_name", "upfront_percentage",
                        "commission_percentage", "outstanding", "immediately_payable", "overdue"):
                assert key in rs, f"missing {key} in retailer_summary"


class TestRetailerDashboard:
    @pytest.fixture(scope="class")
    def retailer_id(self, headers):
        r = requests.get(f"{BASE_URL}/api/field-team/assigned-retailers", headers=headers)
        retailers = r.json().get("retailers", [])
        # prefer Tamanna Mart which has data
        for ret in retailers:
            name = (ret.get("company_name") or ret.get("name") or "").lower()
            if "tamanna" in name:
                return ret["id"]
        return retailers[0]["id"]

    def test_retailer_dashboard(self, headers, retailer_id):
        r = requests.get(f"{BASE_URL}/api/field-team/retailer/{retailer_id}/dashboard", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "retailer" in data
        assert "summary" in data
        assert "counts" in data
        for key in ("indents", "dispatches", "invoices", "rejections", "payments", "credit_notes"):
            assert key in data["counts"]
        for key in ("total_outstanding", "immediately_payable", "overdue", "net_sales", "rejection_percentage"):
            assert key in data["summary"]

    def test_retailer_payment_details(self, headers, retailer_id):
        r = requests.get(f"{BASE_URL}/api/field-team/retailer/{retailer_id}/payment-details", headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "totals" in data
        assert "dates" in data
        assert isinstance(data["dates"], list)

    def test_unauthorized_retailer_returns_404(self, headers):
        r = requests.get(f"{BASE_URL}/api/field-team/retailer/nonexistent-id/dashboard", headers=headers)
        assert r.status_code == 404


class TestCreateIndent:
    @pytest.fixture(scope="class")
    def retailer_id(self, headers):
        r = requests.get(f"{BASE_URL}/api/field-team/assigned-retailers", headers=headers)
        retailers = r.json().get("retailers", [])
        for ret in retailers:
            name = (ret.get("company_name") or ret.get("name") or "").lower()
            if "tamanna" in name:
                return ret["id"]
        return retailers[0]["id"]

    def test_create_indent(self, headers, retailer_id):
        # get a product
        pr = requests.get(f"{BASE_URL}/api/products", headers=headers)
        assert pr.status_code == 200
        products = pr.json()
        assert len(products) > 0
        product = products[0]
        # date tomorrow
        from datetime import date, timedelta
        indent_date = (date.today() + timedelta(days=1)).isoformat()
        payload = {
            "indent_date": indent_date,
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "variant_id": "",
                "variant_name": "Kg",
                "quantity": 1.0,
                "status": "pending"
            }],
            "remarks": "TEST_field_team_indent"
        }
        r = requests.post(f"{BASE_URL}/api/field-team/retailer/{retailer_id}/indent",
                          headers=headers, json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "id" in data
