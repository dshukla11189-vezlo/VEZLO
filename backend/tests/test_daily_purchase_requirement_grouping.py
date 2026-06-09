"""
Test Daily Purchase Requirement grouping & dozens calculation
- /api/retailer-daily-requirement/calculate endpoint
- Products grouped by product_id with variants combined
- Banana qty_dozens calculated correctly (1 Dozen = 1.0, Half Dozen = 0.5)
- Multi-variant products appear as SINGLE rows
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TEST_DATE = "2026-06-10"


@pytest.fixture(scope="module")
def auth_session():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    resp = session.post(f"{BASE_URL}/api/auth/login", json={
        "identifier": "admin@freshflow.com",
        "password": "admin123"
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed: {resp.status_code} {resp.text[:200]}")
    token = resp.json().get("token") or resp.json().get("access_token")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


@pytest.fixture(scope="module")
def calc_response(auth_session):
    resp = auth_session.get(
        f"{BASE_URL}/api/retailer-daily-requirement/calculate",
        params={"target_date": TEST_DATE}
    )
    assert resp.status_code == 200, f"Unexpected status: {resp.status_code} - {resp.text[:300]}"
    return resp.json()


class TestDailyPurchaseRequirementGrouping:

    def test_response_top_level_shape(self, calc_response):
        d = calc_response
        assert d.get("success") is True
        assert d.get("target_date") == TEST_DATE
        assert "items" in d and isinstance(d["items"], list)
        assert len(d["items"]) > 0, "Expected at least some items for 2026-06-10"

    def test_no_duplicate_products(self, calc_response):
        items = calc_response["items"]
        pids = [it["product_id"] for it in items]
        assert len(pids) == len(set(pids)), \
            f"Duplicate product_ids found: {[p for p in pids if pids.count(p) > 1]}"

    def test_total_items_equal_unique_count(self, calc_response):
        items = calc_response["items"]
        unique_count = len({it["product_id"] for it in items})
        assert len(items) == unique_count

    def test_item_fields_present(self, calc_response):
        required = {"product_id", "product_name", "variants", "qty_units",
                    "qty_dozens", "purchase_unit", "qty_kg", "requirement_kg"}
        for it in calc_response["items"]:
            missing = required - set(it.keys())
            assert not missing, f"Missing fields {missing} in item {it.get('product_name')}"

    def test_banana_combined_variants_and_dozens(self, calc_response):
        banana = next((i for i in calc_response["items"]
                       if i["product_name"].strip().lower() == "banana"), None)
        assert banana is not None, "Banana product not found"

        variants = banana["variants"]
        assert "1 Dozen" in variants and "Half Dozen" in variants, \
            f"Banana variants should include both '1 Dozen' & 'Half Dozen', got: {variants}"

        assert banana["purchase_unit"] == "Dozen", \
            f"Banana purchase_unit should be Dozen, got {banana['purchase_unit']}"

        # qty_units=12, dozens=9.0 (6x1 + 6x0.5) per current indents
        assert banana["qty_units"] == 12.0, f"qty_units mismatch: {banana['qty_units']}"
        assert banana["qty_dozens"] == 9.0, \
            f"qty_dozens expected 9.0 (6x1 Dozen + 6x Half Dozen), got {banana['qty_dozens']}"

    def test_elaichi_banana_half_dozen_calculation(self, calc_response):
        eb = next((i for i in calc_response["items"]
                   if i["product_name"].strip().lower() == "elaichi banana"), None)
        assert eb is not None
        assert eb["purchase_unit"] == "Dozen"
        # 7 units of Half Dozen -> 3.5 dozens
        assert eb["qty_dozens"] == 3.5, \
            f"Elaichi Banana dozens expected 3.5 (7 x 0.5), got {eb['qty_dozens']}"

    @pytest.mark.parametrize("product_keyword,expected_variant_tokens", [
        ("onion", ["500+ gm", "1000+ gm"]),
        ("tomato hybrid", ["500+ gm", "1000+ gm"]),
        ("jamun", ["250+ gm", "200+ gm"]),
        ("bottle gourd", ["500+ gm", "Pieces"]),
    ])
    def test_multi_variant_products_single_row(self, calc_response,
                                               product_keyword, expected_variant_tokens):
        matches = [i for i in calc_response["items"]
                   if i["product_name"].strip().lower() == product_keyword]
        assert len(matches) == 1, \
            f"Expected exactly 1 row for '{product_keyword}', got {len(matches)}"
        v = matches[0]["variants"]
        for token in expected_variant_tokens:
            assert token in v, f"Variant '{token}' missing in {product_keyword} variants='{v}'"

    def test_non_banana_dozens_is_zero(self, calc_response):
        """Products with non-Dozen purchase_unit should have qty_dozens = 0"""
        for it in calc_response["items"]:
            if it["purchase_unit"] != "Dozen":
                assert it["qty_dozens"] == 0, \
                    f"{it['product_name']} (unit={it['purchase_unit']}) has dozens={it['qty_dozens']}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
