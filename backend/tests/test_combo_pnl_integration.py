"""
Integration tests for combo product support in the Datewise Daily P&L.

Verifies:
- Auth login works (admin@freshflow.com / admin123 via 'identifier' field)
- /api/reports/pnl returns line items with is_combo / combo_cogs_breakdown when
  combo products exist in dispatch data
- combo_utils functions are wired correctly end-to-end
"""
import os
import requests
import pytest
import sys

sys.path.insert(0, '/app/backend')

from routes.combo_utils import (
    is_combo_product,
    parse_combo_product,
    calculate_combo_cogs,
    normalize_ingredient_name,
    KNOWN_COMBO_PRODUCTS,
)

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://harvest-hub-384.preview.emergentagent.com').rstrip('/')

ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_token(api_client):
    """Login via 'identifier' field per app convention."""
    r = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Admin auth failed ({r.status_code}): {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        pytest.skip(f"No token in auth response: {data}")
    return token


@pytest.fixture(scope="module")
def authed(api_client, auth_token):
    api_client.headers.update({"Authorization": f"Bearer {auth_token}"})
    return api_client


# ---------- Module: combo detection ----------

class TestComboDetection:
    def test_detects_all_known_combos(self):
        for combo in KNOWN_COMBO_PRODUCTS:
            assert is_combo_product(combo), f"Should detect combo: {combo}"

    def test_does_not_detect_regular_products(self):
        for p in ["Tomato", "Onion 1 kg", "Coriander 250g", "Palak Leaves"]:
            assert not is_combo_product(p)


# ---------- Module: combo parsing (all 5 combos) ----------

class TestParseAllFiveCombos:
    def test_parse_coriander_mint(self):
        r = parse_combo_product(KNOWN_COMBO_PRODUCTS[0])
        assert r is not None
        assert r["name"] == "Coriander and mint leaves"
        assert r["total_weight_gm"] == 220
        assert r["location"] == "FK"
        assert len(r["ingredients"]) == 2
        names = {i["name"] for i in r["ingredients"]}
        assert "Coriander" in names
        assert "Fresh Mint Leaves" in names

    def test_parse_curry_coriander(self):
        r = parse_combo_product(KNOWN_COMBO_PRODUCTS[1])
        assert r is not None
        assert r["name"].lower().startswith("curry leaves and coriander")
        assert r["total_weight_gm"] == 220
        assert len(r["ingredients"]) == 2
        ing = {i["name"]: i["weight_gm"] for i in r["ingredients"]}
        assert ing.get("Curry Leaves") == 100
        assert ing.get("Coriander") == 120

    def test_parse_herbs_mix(self):
        r = parse_combo_product(KNOWN_COMBO_PRODUCTS[2])
        assert r is not None
        assert r["name"] == "Herbs mix"
        assert r["total_weight_gm"] == 280
        assert len(r["ingredients"]) == 3

    def test_parse_fresh_spices_mix(self):
        r = parse_combo_product(KNOWN_COMBO_PRODUCTS[3])
        assert r is not None
        assert r["name"] == "fresh spices mix"
        assert r["total_weight_gm"] == 620
        assert len(r["ingredients"]) == 4
        ing = {i["name"]: i["weight_gm"] for i in r["ingredients"]}
        assert ing.get("Green Chilli") == 100
        assert ing.get("Coriander") == 120
        assert ing.get("Garlic") == 200
        assert ing.get("Ginger") == 200

    def test_parse_spinach_coriander_typo(self):
        """Palak, 300 gm (comma typo) must still parse correctly."""
        r = parse_combo_product(KNOWN_COMBO_PRODUCTS[4])
        assert r is not None
        assert r["name"] == "Spinach and Coriander leaves"
        assert r["total_weight_gm"] == 420
        assert len(r["ingredients"]) == 2
        ing = {i["name"]: i["weight_gm"] for i in r["ingredients"]}
        assert ing.get("Palak") == 300
        assert ing.get("Coriander") == 120


# ---------- Module: ingredient normalization ----------

class TestNormalization:
    def test_mint_variants(self):
        assert normalize_ingredient_name("Mint") == "Fresh Mint Leaves"
        assert normalize_ingredient_name("mint leaves") == "Fresh Mint Leaves"

    def test_curry_variants(self):
        assert normalize_ingredient_name("Curry") == "Curry Leaves"
        assert normalize_ingredient_name("curry leaves") == "Curry Leaves"

    def test_spinach_to_palak(self):
        assert normalize_ingredient_name("spinach") == "Palak"
        assert normalize_ingredient_name("Palak") == "Palak"

    def test_green_chilli_variants(self):
        assert normalize_ingredient_name("Green chill") == "Green Chilli"
        assert normalize_ingredient_name("green chilli") == "Green Chilli"


# ---------- Module: combo COGS math ----------

class TestComboCogsMath:
    def test_herbs_mix_cogs(self):
        info = parse_combo_product(KNOWN_COMBO_PRODUCTS[2])  # Herbs mix
        daily = {
            ("Curry Leaves", "2026-06-21"): 150,
            ("Coriander", "2026-06-21"): 80,
            ("Fresh Mint Leaves", "2026-06-21"): 200,
        }
        out = calculate_combo_cogs(info, daily, "2026-06-21")
        # 0.06*150 + 0.12*80 + 0.10*200 = 9 + 9.6 + 20 = 38.6
        assert out["total_cogs_per_pack"] == 38.6
        # cogs_per_kg = 38.6 / 0.28 = 137.857...
        assert abs(out["cogs_per_kg"] - 137.86) < 0.05
        assert len(out["ingredients_breakdown"]) == 3

    def test_missing_cogs_returns_zero(self):
        info = parse_combo_product(KNOWN_COMBO_PRODUCTS[0])
        out = calculate_combo_cogs(info, {}, "2026-06-21")
        assert out["total_cogs_per_pack"] == 0
        assert out["cogs_per_kg"] == 0

    def test_fuzzy_ingredient_match(self):
        """daily_cogs_map keyed with slightly different naming should still match."""
        info = parse_combo_product(KNOWN_COMBO_PRODUCTS[0])  # Coriander + Mint
        daily = {
            ("Coriander Leaves", "2026-06-21"): 100,   # partial match -> Coriander
            ("Fresh Mint Leaves", "2026-06-21"): 200,
        }
        out = calculate_combo_cogs(info, daily, "2026-06-21")
        # 0.12 * 100 + 0.10 * 200 = 12 + 20 = 32.0
        assert out["total_cogs_per_pack"] == 32.0


# ---------- Module: P&L endpoint integration ----------

class TestPnlComboIntegration:
    def test_pnl_endpoint_reachable(self, authed):
        r = authed.get(f"{BASE_URL}/api/reports/pnl", timeout=120)
        assert r.status_code == 200, f"P&L failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert "daily_pnl" in data
        assert isinstance(data["daily_pnl"], list)

    def test_pnl_combo_line_items_have_combo_flags(self, authed):
        """If combo products were dispatched, line_items should include is_combo=true.
        If not present, that's acceptable per agent context note."""
        # Use a wide range likely to include any combo dispatch
        r = authed.get(
            f"{BASE_URL}/api/reports/pnl",
            params={"from_date": "2025-01-01", "to_date": "2026-12-31"},
            timeout=180,
        )
        assert r.status_code == 200
        data = r.json()
        daily = data.get("daily_pnl", [])

        total_line_items = 0
        combo_line_items = []
        for day in daily:
            for li in day.get("line_items", []) or []:
                total_line_items += 1
                if li.get("is_combo"):
                    combo_line_items.append(li)

        print(f"\n[INFO] Daily P&L days: {len(daily)}, total line_items: {total_line_items}, combo line_items: {len(combo_line_items)}")

        # CRITICAL CHECK: The P&L response aggregates line_items_by_date into
        # detailed_line_items (lines ~1285-1305 of dashboard_analytics.py). During
        # that aggregation, the `is_combo` and `combo_cogs_breakdown` fields set
        # on the inner line items (lines 700-701) are NOT propagated. This means
        # the API never surfaces combo metadata to the frontend.
        sample_keys = set()
        for day in daily[:5]:
            for li in day.get("line_items", []) or []:
                sample_keys.update(li.keys())
                break
            if sample_keys:
                break
        print(f"[INFO] Sample line_item keys: {sorted(sample_keys)}")
        # This assertion is expected to FAIL with current code → flags the bug.
        assert "is_combo" in sample_keys, (
            "BUG: P&L /reports/pnl response line_items are missing 'is_combo'. "
            "Combo metadata is populated in line_items_by_date but dropped during "
            "aggregation into detailed_line_items (dashboard_analytics.py ~L1285)."
        )

        # Validate structure of any combo line items present
        for li in combo_line_items[:5]:
            assert li["is_combo"] is True
            assert li["combo_cogs_breakdown"] is not None
            assert isinstance(li["combo_cogs_breakdown"], list)
            for ing in li["combo_cogs_breakdown"]:
                for k in ("name", "weight_gm", "weight_kg", "cogs_rate_per_kg", "cogs_amount"):
                    assert k in ing, f"missing key {k} in combo breakdown"

    def test_pnl_unauthenticated_rejected(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/reports/pnl", timeout=30,
                           headers={"Authorization": ""})
        assert r.status_code in (401, 403)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
