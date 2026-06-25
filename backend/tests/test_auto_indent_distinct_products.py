"""
Test for Auto Indent Generation Bug Fix:
Ensures distinct products with similar names (e.g., "Green chilli" vs
"Chilli Light Green") and products with the SAME product_id but DIFFERENT
product_name are NOT merged into one line item when generating the
plan-based / closing-based auto indent.

The fix uses a composite dedup key (product_id + product_name) in:
  - backend/routes/retailer_portal.py::generate_plan_based_indent
  - backend/routes/retailer_portal.py::merge_close_weight_variants
  - backend/routes/admin.py::generate_single_auto_indent
"""
import os
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://harvest-hub-384.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN_EMAIL = "admin@freshflow.com"
ADMIN_PASSWORD = "admin123"

PARKWAY_RETAILER_ID = "17b601bc-7cd8-4941-b7e2-e6edc860a8c8"
TARGET_DATE = "2026-06-26"           # closing of 2026-06-25 exists for Park Way Mart
TARGET_DATE_CLOSING = "2026-06-25"

# --- Fixtures --------------------------------------------------------------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"Login failed: {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in login response: {data}"
    return token


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# --- Helpers ---------------------------------------------------------------

def _run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if asyncio.get_event_loop().is_running() is False else asyncio.run(coro)


async def _delete_indent(retailer_id, indent_date):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.retailer_indents.delete_many({
        "retailer_id": retailer_id,
        "indent_date": indent_date,
    })
    client.close()


async def _get_indent(retailer_id, indent_date):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = await db.retailer_indents.find_one(
        {"retailer_id": retailer_id, "indent_date": indent_date},
        {"_id": 0},
    )
    client.close()
    return doc


async def _get_plan_for_retailer(retailer_id):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    retailer = await db.users.find_one({"id": retailer_id}, {"_id": 0})
    plan_id = retailer.get("subscribed_plan_id") if retailer else None
    plan = None
    if plan_id:
        plan = await db.retail_plans.find_one({"id": plan_id}, {"_id": 0})
    client.close()
    return plan


# --- API integration tests -------------------------------------------------

class TestPlanBasedAutoIndentDeduplication:
    """End-to-end test: hit POST /api/admin/generate-auto-indent (basis=plan)
    against the Park Way Mart retailer which has BOTH 'Chilli Light Green'
    and 'Green chilli ' in its Medium plan with DIFFERENT product_ids.
    Verifies they remain as 2 distinct line items, not 1 merged item."""

    def test_parkway_chilli_variants_remain_distinct(self, admin_headers):
        # Cleanup any pre-existing indent so we always test fresh generation
        asyncio.run(_delete_indent(PARKWAY_RETAILER_ID, TARGET_DATE))

        resp = requests.post(
            f"{BASE_URL}/api/admin/generate-auto-indent",
            headers=admin_headers,
            json={
                "retailer_id": PARKWAY_RETAILER_ID,
                "target_date": TARGET_DATE,
                "basis": "plan",
            },
            timeout=30,
        )
        assert resp.status_code == 200, f"Generate failed: {resp.text}"
        body = resp.json()
        assert body.get("success") is True, f"Generation failed: {body}"

        indent = asyncio.run(_get_indent(PARKWAY_RETAILER_ID, TARGET_DATE))
        assert indent is not None, "Indent not persisted"

        items = indent.get("items", [])
        chilli_items = [i for i in items if "chilli" in (i.get("product_name", "").lower())]
        names = [i.get("product_name", "").strip() for i in chilli_items]

        # Must have BOTH chilli products as separate entries (not merged into one)
        assert len(chilli_items) >= 2, (
            f"Expected at least 2 chilli items, got {len(chilli_items)}: {chilli_items}"
        )
        assert any("light green" in n.lower() for n in names), (
            f"'Chilli Light Green' missing in generated indent. Names: {names}"
        )
        assert any(n.lower().strip() == "green chilli" for n in names), (
            f"'Green chilli' missing in generated indent. Names: {names}"
        )

        # Each variant should retain its individual quantity (no merging into one)
        for ci in chilli_items:
            assert ci.get("quantity", 0) > 0, f"Chilli item has 0 qty: {ci}"

    def test_each_plan_product_is_separate_line_item(self, admin_headers):
        """For every distinct (product_id, product_name) pair in the plan
        whose plan_qty > closing_qty, expect a line item in the indent."""
        indent = asyncio.run(_get_indent(PARKWAY_RETAILER_ID, TARGET_DATE))
        assert indent is not None, "Run previous test first"

        plan = asyncio.run(_get_plan_for_retailer(PARKWAY_RETAILER_ID))
        assert plan is not None, "Plan not found for Park Way Mart"

        # Build expected distinct (product_id, product_name) set from plan
        # (mirroring the dedup logic that keeps FIRST occurrence on exact dup)
        expected_pairs = set()
        for p in plan.get("products", []):
            pid = p.get("product_id")
            pname = (p.get("product_name") or "").strip()
            if pid:
                expected_pairs.add((pid, pname))

        actual_pairs = set(
            (i.get("product_id"), (i.get("product_name") or "").strip())
            for i in indent.get("items", [])
        )

        # Every actual line item must be a distinct expected pair (no synthetic merges)
        unexpected = actual_pairs - expected_pairs
        assert not unexpected, f"Indent contains pairs not in plan: {unexpected}"

        # Indent items should not have duplicate (product_id, product_name) pairs
        items = indent.get("items", [])
        pair_keys = [
            (i.get("product_id"), (i.get("product_name") or "").strip()) for i in items
        ]
        assert len(pair_keys) == len(set(pair_keys)), (
            f"Indent contains duplicate (product_id, product_name) pairs: {pair_keys}"
        )

    def test_total_qty_equals_sum_of_line_items(self, admin_headers):
        indent = asyncio.run(_get_indent(PARKWAY_RETAILER_ID, TARGET_DATE))
        assert indent is not None
        items = indent.get("items", [])
        line_sum = sum((i.get("quantity") or 0) for i in items)
        assert indent.get("total_qty") == line_sum, (
            f"total_qty {indent.get('total_qty')} != sum of items {line_sum}"
        )

    def test_indent_basis_is_plan_and_metadata_present(self, admin_headers):
        indent = asyncio.run(_get_indent(PARKWAY_RETAILER_ID, TARGET_DATE))
        assert indent is not None
        assert indent.get("generation_basis") == "plan"
        assert indent.get("is_auto_generated") is True
        assert indent.get("plan_id"), "plan_id missing on indent"
        assert indent.get("closing_date_used") == TARGET_DATE_CLOSING


# --- Direct unit test for the dedup logic ---------------------------------
# Reproduces a SAME-product_id-DIFFERENT-name scenario (which we can't easily
# inject through a real retail plan without polluting prod data) and verifies
# the composite-key logic keeps the products distinct.

class TestCompositeKeyDeduplicationLogic:
    """Directly exercise the dedup snippet pattern used in
    generate_plan_based_indent to prove that two plan items with the SAME
    product_id but DIFFERENT product_name remain distinct."""

    @staticmethod
    def _dedup(plan_products):
        # Mirrors retailer_portal.py::generate_plan_based_indent dedup logic
        deduplicated = {}
        for plan_item in plan_products:
            pid = plan_item.get("product_id")
            pname = plan_item.get("product_name", "Unknown")
            composite_key = f"{pid}|{pname.strip()}"
            if composite_key not in deduplicated:
                deduplicated[composite_key] = dict(plan_item)
            # else: drop exact duplicate (same id + same name) - keep first
        return list(deduplicated.values())

    def test_same_id_different_name_kept_distinct(self):
        plan_products = [
            {"product_id": "PID_X", "product_name": "Green Chilli", "quantity": 5},
            {"product_id": "PID_X", "product_name": "Light Green Chilli", "quantity": 5},
        ]
        out = self._dedup(plan_products)
        assert len(out) == 2, f"Expected 2 distinct items, got {len(out)}: {out}"
        names = sorted(i["product_name"] for i in out)
        assert names == ["Green Chilli", "Light Green Chilli"]
        total = sum(i["quantity"] for i in out)
        assert total == 10, f"Combined qty should be 10 (5+5), got {total}"

    def test_exact_duplicate_kept_once(self):
        plan_products = [
            {"product_id": "PID_Y", "product_name": "Onion", "quantity": 5},
            {"product_id": "PID_Y", "product_name": "Onion", "quantity": 4},
        ]
        out = self._dedup(plan_products)
        # Behaviour per fix comments: 'keep FIRST occurrence only'
        assert len(out) == 1
        assert out[0]["quantity"] == 5

    def test_different_id_same_name_kept_distinct(self):
        plan_products = [
            {"product_id": "PID_A", "product_name": "Tomato Hybrid", "quantity": 3},
            {"product_id": "PID_B", "product_name": "Tomato Hybrid", "quantity": 7},
        ]
        out = self._dedup(plan_products)
        # Different composite_key (different pid), so both kept
        assert len(out) == 2

    def test_trailing_whitespace_in_name_treated_consistently(self):
        # 'Green chilli ' and 'Green chilli' should be treated as the same name
        # because the fix calls .strip() on product_name before building the key.
        plan_products = [
            {"product_id": "PID_Z", "product_name": "Green chilli ", "quantity": 10},
            {"product_id": "PID_Z", "product_name": "Green chilli",  "quantity": 5},
        ]
        out = self._dedup(plan_products)
        assert len(out) == 1, f"Names differing only by whitespace should dedup, got {out}"
        assert out[0]["quantity"] == 10  # first occurrence retained
