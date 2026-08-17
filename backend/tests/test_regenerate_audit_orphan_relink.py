"""
Backend tests for enhanced DELETE + regenerate flow (iteration_52).

New features under test:
1) DELETE /api/retailer-invoices/{id} stores `payment_ids_unlinked` in deleted_invoices_audit.
2) POST /api/retailer-invoices/{id}/regenerate finds orphaned payments matching
   (needs_relinking=true AND original_invoice_number matches AND retailer_id matches),
   even when the invoice_id no longer matches (i.e. after a prior delete + separate
   regenerate scenario).
3) Regenerate clears needs_relinking + original_invoice_number on relinked payments.
4) Regenerate uses credit_note_adjustments from deleted_invoices_audit when it exists
   (audit survives the delete; original_invoice.credit_note_adjustments does NOT).
5) Regenerate response includes `used_audit_record: bool`.
6) GET /api/retailer-payments/orphans returns `needs_relinking_count`.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

ADMIN = {"identifier": "admin@freshflow.com", "password": "admin123"}
MARKER = "TEST_regen_audit"


def login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    d = r.json()
    return d["token"], d["user"]


@pytest.fixture(scope="session")
def admin_headers():
    t, _ = login(ADMIN)
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="session")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


async def _pick_retailer(db):
    return await db.users.find_one(
        {"role": "retailer"},
        {"_id": 0, "id": 1, "name": 1, "company_name": 1,
         "commission_percentage": 1, "upfront_collection_percentage": 1},
    )


async def _make_invoice(db, *, with_payment=False, paid_amount=0.0,
                        with_credit_note=False, backdated=True, retailer=None):
    retailer = retailer or await _pick_retailer(db)
    assert retailer, "No retailer in DB"
    inv_id = str(uuid.uuid4())
    inv_number = f"TEST-INV-{uuid.uuid4().hex[:8].upper()}"
    inv_date = (datetime.now(timezone.utc) - timedelta(days=5)) if backdated else datetime.now(timezone.utc)

    net_payable = 500.0
    final_payable = 500.0
    cn_id = None
    cn_adjustments = []

    if with_credit_note:
        cn_id = str(uuid.uuid4())
        cn_number = f"TEST-CN-{uuid.uuid4().hex[:6].upper()}"
        cn_doc = {
            "id": cn_id,
            "credit_note_number": cn_number,
            "retailer_id": retailer["id"],
            "amount": 200.0,
            "adjusted_amount": 200.0,
            "pending_amount": 0.0,
            "status": "adjusted",
            "source": "rejection",
            "adjusted_in_invoices": [{"invoice_id": inv_id, "invoice_number": inv_number, "adjusted_amount": 200.0}],
            "adjusted_against_invoices": [{"invoice_id": inv_id, "invoice_number": inv_number}],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": MARKER,
        }
        await db.retailer_credit_notes.insert_one(cn_doc)
        cn_adjustments = [{
            "credit_note_id": cn_id,
            "credit_note_number": cn_number,
            "adjusted_amount": 200.0,
        }]
        final_payable = 300.0

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
        "final_payable": final_payable,
        "paid_amount": paid_amount,
        "remaining_amount": max(0, final_payable - paid_amount),
        "status": "paid" if paid_amount >= final_payable else ("partial" if paid_amount > 0 else "pending"),
        "payment_status": "paid" if paid_amount >= final_payable else ("partial" if paid_amount > 0 else "pending"),
        "credit_note_adjustments": cn_adjustments,
        "total_credit_adjusted": 200.0 if with_credit_note else 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "_test_marker": MARKER,
    }
    await db.retailer_invoices.insert_one(invoice_doc)

    pay_id = None
    if with_payment:
        pay_id = str(uuid.uuid4())
        await db.retailer_payments.insert_one({
            "id": pay_id,
            "retailer_id": retailer["id"],
            "invoice_id": inv_id,
            "invoice_number": inv_number,
            "amount": paid_amount or 100.0,
            "payment_date": datetime.now(timezone.utc).isoformat(),
            "payment_method": "cash",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": MARKER,
        })

    return {"invoice_id": inv_id, "invoice_number": inv_number,
            "retailer_id": retailer["id"], "cn_id": cn_id, "payment_id": pay_id}


async def _cleanup(db):
    await db.retailer_invoices.delete_many({"_test_marker": MARKER})
    await db.retailer_credit_notes.delete_many({"_test_marker": MARKER})
    await db.retailer_payments.delete_many({"_test_marker": MARKER})
    await db.deleted_invoices_audit.delete_many({"deleted_invoice_number": {"$regex": "^TEST-INV-"}})


@pytest.fixture(scope="module", autouse=True)
def _cleanup_at_end(db):
    yield
    run(_cleanup(db))


# ---------------- tests ----------------

class TestDeleteStoresPaymentIdsInAudit:
    """Feature #1: DELETE persists `payment_ids_unlinked` array in audit."""

    def test_audit_contains_payment_ids_unlinked(self, db, admin_headers):
        data = run(_make_invoice(db, with_payment=True, paid_amount=250.0))
        r = requests.delete(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}",
                            headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text

        audit = run(db.deleted_invoices_audit.find_one(
            {"deleted_invoice_id": data["invoice_id"]}
        ))
        assert audit is not None, "audit record not created"
        assert "payment_ids_unlinked" in audit, "audit missing payment_ids_unlinked field"
        assert isinstance(audit["payment_ids_unlinked"], list)
        assert data["payment_id"] in audit["payment_ids_unlinked"], \
            f"payment id not in audit list: {audit['payment_ids_unlinked']}"

    def test_audit_contains_credit_note_adjustments(self, db, admin_headers):
        data = run(_make_invoice(db, with_credit_note=True))
        r = requests.delete(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}",
                            headers=admin_headers, timeout=30)
        assert r.status_code == 200
        audit = run(db.deleted_invoices_audit.find_one(
            {"deleted_invoice_id": data["invoice_id"]}
        ))
        assert audit is not None
        adjs = audit.get("credit_note_adjustments", [])
        assert len(adjs) == 1
        assert adjs[0]["credit_note_id"] == data["cn_id"]
        assert adjs[0]["adjusted_amount"] == 200.0


class TestOrphansEndpointCounts:
    """Feature #6: GET /api/retailer-payments/orphans returns `needs_relinking_count`."""

    def test_needs_relinking_count_present_and_matches_array(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/retailer-payments/orphans",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "needs_relinking_count" in d
        assert isinstance(d["needs_relinking_count"], int)
        assert d["needs_relinking_count"] == len(d.get("needs_relinking", []))


class TestRegenerateUsesAuditRecord:
    """Features #2 #3 #4 #5:
    After DELETE + REGENERATE (via a *second* invoice that shares the same number),
    the regenerate endpoint must:
      - pull CN adjustments from deleted_invoices_audit (invoice CN field is gone),
      - find orphan payments by needs_relinking + original_invoice_number + retailer_id,
      - relink and clear the orphan flags,
      - return used_audit_record=true.

    Realistic path: delete then regenerate on same invoice id (the endpoint code
    supports both direct and orphaned payment matching).
    """

    def test_regenerate_after_delete_uses_audit_and_relinks_orphan(self, db, admin_headers):
        # Create invoice with payment + CN, then DELETE it -> orphans + audit record
        data = run(_make_invoice(db, with_payment=True, paid_amount=500.0,
                                 with_credit_note=True))
        # After delete, payment becomes orphan (needs_relinking=true) and audit stores CN adjustments
        del_r = requests.delete(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}",
                                headers=admin_headers, timeout=30)
        assert del_r.status_code == 200, del_r.text

        # Verify orphan state
        orphan = run(db.retailer_payments.find_one({"id": data["payment_id"]}, {"_id": 0}))
        assert orphan.get("needs_relinking") is True
        assert orphan.get("original_invoice_number") == data["invoice_number"]

        # Verify audit record has CN adjustments
        audit = run(db.deleted_invoices_audit.find_one(
            {"deleted_invoice_id": data["invoice_id"]}
        ))
        assert audit is not None
        assert len(audit.get("credit_note_adjustments", [])) == 1

        # Now re-create a NEW invoice with the SAME invoice_number + retailer, backdated,
        # (simulating the "re-created" invoice that admin wants to regenerate on)
        retailer = run(db.users.find_one({"id": data["retailer_id"]}, {"_id": 0}))
        new_inv_id = str(uuid.uuid4())
        new_inv_number = data["invoice_number"]  # same number to trigger audit-match
        run(db.retailer_invoices.insert_one({
            "id": new_inv_id,
            "invoice_number": new_inv_number,
            "retailer_id": data["retailer_id"],
            "retailer_name": retailer.get("company_name") or retailer.get("name"),
            "invoice_date": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
            "dispatch_ids": [],
            "items": [{"product_id": "test-p", "product_name": "TestProd", "quantity": 1,
                        "supplied_qty": 1, "rejected_qty": 0, "mrp": 500.0, "total_value": 500.0}],
            "total_mrp_value": 500.0, "commission_percentage": 0, "commission_amount": 0,
            "net_payable": 500.0, "final_payable": 500.0, "paid_amount": 0.0,
            "remaining_amount": 500.0, "status": "pending", "payment_status": "pending",
            "credit_note_adjustments": [],   # <-- IMPORTANT: empty; must be recovered from audit
            "total_credit_adjusted": 0,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "_test_marker": MARKER,
        }))

        # REGENERATE the new invoice — must find orphan payment via audit-key match,
        # and pull CN adjustments from the audit record (invoice's own CN list is empty).
        regen = requests.post(f"{BASE_URL}/api/retailer-invoices/{new_inv_id}/regenerate",
                              json={}, headers=admin_headers, timeout=60)
        assert regen.status_code == 200, regen.text
        body = regen.json()

        # Feature #5: used_audit_record boolean present + True
        assert "used_audit_record" in body, f"missing used_audit_record in response: {body}"
        assert body["used_audit_record"] is True, f"used_audit_record should be True: {body}"

        # Regenerated invoice id
        regen_id = body["id"]
        # tag for cleanup
        run(db.retailer_invoices.update_one({"id": regen_id}, {"$set": {"_test_marker": MARKER}}))

        # Feature #2: orphan payment relinked to new regenerated invoice
        pay = run(db.retailer_payments.find_one({"id": data["payment_id"]}, {"_id": 0}))
        assert pay["invoice_id"] == regen_id, f"payment not relinked to regen id: {pay}"
        assert pay["invoice_number"] == new_inv_number

        # Feature #3: orphan flags cleared
        assert "needs_relinking" not in pay, f"needs_relinking not cleared: {pay}"
        assert "original_invoice_number" not in pay, f"original_invoice_number not cleared: {pay}"
        assert "original_invoice_id" not in pay
        assert "unlinked_at" not in pay

        # Feature #4: CN adjustments restored from audit — invoice reflects credit_note_adjustments
        new_inv = run(db.retailer_invoices.find_one({"id": regen_id}, {"_id": 0}))
        assert new_inv is not None
        assert len(new_inv.get("credit_note_adjustments", [])) == 1, \
            f"CN adjustments not restored from audit: {new_inv.get('credit_note_adjustments')}"
        assert new_inv["credit_note_adjustments"][0]["credit_note_id"] == data["cn_id"]
        assert new_inv["total_credit_adjusted"] == 200.0

        # And credit_notes_restored count in response
        assert body.get("credit_notes_restored") == 1, body
        assert body.get("payments_relinked") == 1, body

    def test_regenerate_without_delete_reports_used_audit_record_false(self, db, admin_headers):
        """Regeneration on an invoice that was never previously deleted must return
        used_audit_record=False (no audit record exists)."""
        data = run(_make_invoice(db, with_payment=True, paid_amount=500.0))
        r = requests.post(f"{BASE_URL}/api/retailer-invoices/{data['invoice_id']}/regenerate",
                          json={}, headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "used_audit_record" in body
        assert body["used_audit_record"] is False, f"expected False: {body}"

        # cleanup: tag new invoice
        new_id = body["id"]
        run(db.retailer_invoices.update_one({"id": new_id}, {"$set": {"_test_marker": MARKER}}))
