"""Backend regression tests for the dual-key MRP fix in GET /api/retailer-catalogue/mrp.

Bug fixed: the endpoint previously returned MRP entries only under the key
"{product_id}_{variant_id}". For products with display_unit='Piece' or 'Packet'
the frontend looks up MRP with key "{product_id}_unit_piece" / "{product_id}_unit_packet".
The endpoint now inserts an additional dual-key entry for such products so
Piece/Packet based products correctly display an MRP.
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://harvest-hub-384.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"

# Product IDs supplied by the reporter (all Piece-based)
EXPECTED_PIECE_PRODUCTS = {
    "281b85f6-7fd6-49b8-ae0a-b05241f9c6ad_unit_piece": ("Cabbage", 35),
    "9ec93854-0cd5-40ed-84ff-57154cde3376_unit_piece": ("Cauliflower", 45),
    "79eb2b80-0adf-4bb6-89cb-5f0e18148939_unit_piece": ("Bottle Gourd", 35),
}


@pytest.fixture(scope="module")
def admin_token():
    """Login as admin and return the JWT token."""
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed ({resp.status_code}): {resp.text[:200]}")
    body = resp.json()
    token = body.get("access_token") or body.get("token")
    if not token:
        pytest.skip(f"Login response missing token: {body}")
    return token


@pytest.fixture(scope="module")
def mrp_response(admin_token):
    resp = requests.get(
        f"{BASE_URL}/api/retailer-catalogue/mrp",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=60,
    )
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
    return resp.json()


# ---- API structure ---------------------------------------------------------

class TestMrpResponseStructure:
    def test_response_has_mrp_data(self, mrp_response):
        assert "mrp_data" in mrp_response
        assert isinstance(mrp_response["mrp_data"], dict)
        assert len(mrp_response["mrp_data"]) > 0

    def test_response_has_piece_products_count(self, mrp_response):
        assert "piece_products_count" in mrp_response, (
            "Field 'piece_products_count' missing from MRP response"
        )
        assert isinstance(mrp_response["piece_products_count"], int)
        assert mrp_response["piece_products_count"] > 0, (
            "piece_products_count is 0 — dual-key fix will not fire for any product"
        )

    def test_response_has_date_fields(self, mrp_response):
        for key in ("today", "yesterday", "today_count", "yesterday_count", "dispatch_fallback_count"):
            assert key in mrp_response, f"Field '{key}' missing"


# ---- Dual-key insertion ----------------------------------------------------

class TestDualKeyInsertion:
    def test_piece_products_count_reasonable(self, mrp_response):
        """Preview env is expected to have ~20 Piece/Packet catalogue rows."""
        count = mrp_response["piece_products_count"]
        assert count >= 3, f"Expected at least 3 Piece/Packet products, got {count}"

    @pytest.mark.parametrize("piece_key,expected", list(EXPECTED_PIECE_PRODUCTS.items()))
    def test_specific_piece_product_present(self, mrp_response, piece_key, expected):
        product_name, expected_mrp = expected
        mrp_data = mrp_response["mrp_data"]
        assert piece_key in mrp_data, (
            f"Piece dual-key '{piece_key}' ({product_name}) not present in mrp_data. "
            f"Total keys: {len(mrp_data)}"
        )
        entry = mrp_data[piece_key]
        assert isinstance(entry, dict), f"Entry for {piece_key} is not a dict: {entry!r}"
        assert "mrp" in entry
        assert entry["mrp"] == expected_mrp, (
            f"{product_name} ({piece_key}) MRP mismatch: expected {expected_mrp}, got {entry['mrp']}"
        )

    def test_dual_keys_look_like_unit_piece_or_packet(self, mrp_response):
        """At least a handful of keys should be of the dual-key form."""
        piece_keys = [k for k in mrp_response["mrp_data"] if k.endswith("_unit_piece") or k.endswith("_unit_packet")]
        assert len(piece_keys) >= 3, (
            f"Expected >=3 dual-key entries ending with _unit_piece/_unit_packet, got {len(piece_keys)}"
        )

    def test_dual_key_entries_have_positive_mrp(self, mrp_response):
        """All dual-key entries must carry a positive numeric MRP."""
        bad = []
        for key, entry in mrp_response["mrp_data"].items():
            if key.endswith("_unit_piece") or key.endswith("_unit_packet"):
                mrp = entry.get("mrp", 0)
                if not isinstance(mrp, (int, float)) or mrp <= 0:
                    bad.append((key, mrp))
        assert not bad, f"Dual-key entries with non-positive MRP: {bad[:5]}"
