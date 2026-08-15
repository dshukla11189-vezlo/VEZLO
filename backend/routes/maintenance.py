"""
Maintenance endpoint for one-time data corrections.
Protected by token, idempotent, with dry-run and backup capabilities.

USAGE:
  - Dry run (preview only): POST /api/admin/fix-chandra-deep-invoice
    Headers: X-Maintenance-Token: VEZLO-MAINT-2026-SECURE
    Body: {"confirm": false}  (or omit body)
    
  - Apply changes: POST /api/admin/fix-chandra-deep-invoice
    Headers: X-Maintenance-Token: VEZLO-MAINT-2026-SECURE
    Body: {"confirm": true}

DELETE THIS FILE AFTER USE.
"""

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import os
from dependencies import get_db, get_current_user

router = APIRouter(prefix="/admin", tags=["Maintenance"])

# Secure token - must be provided in X-Maintenance-Token header
MAINTENANCE_TOKEN = "VEZLO-MAINT-2026-SECURE"

class FixRequest(BaseModel):
    confirm: bool = False  # Default to dry-run


def verify_maintenance_token(x_maintenance_token: str = Header(None)):
    """Verify the maintenance token"""
    if x_maintenance_token != MAINTENANCE_TOKEN:
        raise HTTPException(
            status_code=403, 
            detail="Invalid or missing maintenance token. Provide X-Maintenance-Token header."
        )
    return True


@router.post("/fix-chandra-deep-invoice")
async def fix_chandra_deep_invoice(
    request: FixRequest = FixRequest(),
    token_valid: bool = Depends(verify_maintenance_token),
    db=Depends(get_db)
):
    """
    Fix Chandra Deep Market invoice CHA-INV-14AUG2026-002:
    - Remove all credit note adjustments (₹765 total)
    - Re-link ₹4,050.25 UPI payment from deleted invoice
    - Restore invoice to pre-credit amount of ₹4,050.25
    - Mark invoice as fully paid with zero balance
    
    Dry-run by default. Pass {"confirm": true} to apply changes.
    """
    
    # Target amount - the invoice should be ₹4,050.25 (pre-credit)
    TARGET_PAYABLE = 4050.25
    
    result = {
        "mode": "DRY-RUN (no changes made)" if not request.confirm else "APPLYING CHANGES",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "invoice_number": "CHA-INV-14AUG2026-002",
        "retailer": "Chandra Deep Market",
        "target_payable": TARGET_PAYABLE,
        "steps": [],
        "backup_collection": "maintenance_backups",
        "errors": [],
        "success": False
    }
    
    try:
        # ========== STEP 1: FIND THE INVOICE ==========
        invoice = await db.retailer_invoices.find_one({"invoice_number": "CHA-INV-14AUG2026-002"})
        
        if not invoice:
            result["errors"].append("Invoice CHA-INV-14AUG2026-002 not found")
            return result
        
        invoice_id = invoice.get("id")
        retailer_id = invoice.get("retailer_id")
        
        # Check if already fixed (idempotency)
        if invoice.get("_maintenance_fix_applied"):
            result["errors"].append(f"Invoice already fixed on {invoice.get('_maintenance_fix_applied')}. Skipping to maintain idempotency.")
            result["success"] = True
            return result
        
        # ========== STEP 2: ANALYZE INVOICE - CORRECT FIELD NAMES ==========
        # Read from actual schema fields
        payable_analysis = {
            # Amount fields (try multiple possible names)
            "gross_value": invoice.get("gross_value"),
            "net_payable": invoice.get("net_payable"),
            "final_payable": invoice.get("final_payable"),
            "total_amount": invoice.get("total_amount"),
            "grand_total": invoice.get("grand_total"),
            "invoice_total": invoice.get("invoice_total"),
            "subtotal": invoice.get("subtotal"),
            
            # Rejection/damage fields
            "rejection_amount": invoice.get("rejection_amount", 0),
            "damage_amount": invoice.get("damage_amount", 0),
            "total_rejections": invoice.get("total_rejections", 0),
            
            # Credit note fields - CORRECT NAMES
            "credit_note_adjustments": invoice.get("credit_note_adjustments", []),
            "total_credit_adjusted": invoice.get("total_credit_adjusted", 0),
            
            # Payment status fields
            "amount_paid": invoice.get("amount_paid", 0),
            "balance_due": invoice.get("balance_due"),
            "payment_status": invoice.get("payment_status"),
            "status": invoice.get("status"),
        }
        
        # Determine the pre-credit payable (should be ₹4,050.25)
        # Try different field names to find the original amount
        pre_credit_payable = (
            payable_analysis["gross_value"] or 
            payable_analysis["net_payable"] or 
            payable_analysis["final_payable"] or 
            payable_analysis["total_amount"] or 
            payable_analysis["grand_total"] or
            payable_analysis["invoice_total"] or
            TARGET_PAYABLE  # Fallback to known correct value
        )
        
        # Get credit note adjustments
        credit_adjustments = payable_analysis["credit_note_adjustments"]
        total_credit_adjusted = payable_analysis["total_credit_adjusted"] or sum(
            adj.get("amount", 0) for adj in credit_adjustments
        )
        
        result["steps"].append({
            "step": 1,
            "action": "ANALYZE INVOICE AMOUNTS",
            "invoice_id": invoice_id,
            "all_amount_fields": {
                "gross_value": payable_analysis["gross_value"],
                "net_payable": payable_analysis["net_payable"],
                "final_payable": payable_analysis["final_payable"],
                "total_amount": payable_analysis["total_amount"],
                "grand_total": payable_analysis["grand_total"],
                "invoice_total": payable_analysis["invoice_total"],
                "subtotal": payable_analysis["subtotal"],
            },
            "rejection_damage_fields": {
                "rejection_amount": payable_analysis["rejection_amount"],
                "damage_amount": payable_analysis["damage_amount"],
                "total_rejections": payable_analysis["total_rejections"],
            },
            "credit_fields": {
                "credit_note_adjustments_count": len(credit_adjustments),
                "total_credit_adjusted": total_credit_adjusted,
            },
            "payment_fields": {
                "amount_paid": payable_analysis["amount_paid"],
                "balance_due": payable_analysis["balance_due"],
                "payment_status": payable_analysis["payment_status"],
            },
            "determined_pre_credit_payable": pre_credit_payable,
            "target_payable": TARGET_PAYABLE,
        })
        
        # ========== STEP 3: IDENTIFY CREDIT NOTES TO REMOVE ==========
        credit_note_ids = []
        credit_note_details = []
        
        for adj in credit_adjustments:
            cn_id = adj.get("credit_note_id") or adj.get("id")
            cn_amount = adj.get("amount", 0)
            credit_note_ids.append(cn_id)
            credit_note_details.append({
                "credit_note_id": cn_id,
                "amount": cn_amount,
                "applied_at": adj.get("applied_at") or adj.get("date"),
                "description": adj.get("description") or adj.get("reason")
            })
        
        # Fetch actual credit note documents
        actual_credit_notes = []
        if credit_note_ids:
            cursor = db.retailer_credit_notes.find({"id": {"$in": credit_note_ids}})
            actual_credit_notes = await cursor.to_list(length=100)
        
        result["steps"].append({
            "step": 2,
            "action": "IDENTIFY CREDIT NOTE ADJUSTMENTS TO REMOVE",
            "credit_notes_on_invoice": len(credit_adjustments),
            "total_credit_to_remove": total_credit_adjusted,
            "expected_credit_total": 765,  # ₹765 as mentioned
            "credit_note_details": credit_note_details,
            "credit_notes_found_in_db": len(actual_credit_notes),
            "will_return_to_available": len(credit_note_ids)
        })
        
        # ========== STEP 4: FIND THE ₹4,050.25 PAYMENT ==========
        # Search for payment around ₹4,050.25 for this retailer
        payment = await db.retailer_payments.find_one({
            "retailer_id": retailer_id,
            "amount": {"$gte": 4050, "$lte": 4051}
        })
        
        if not payment:
            # Try broader search by retailer name
            payment = await db.retailer_payments.find_one({
                "retailer_name": {"$regex": "Chandra", "$options": "i"},
                "amount": {"$gte": 4050, "$lte": 4051}
            })
        
        if not payment:
            # List all payments for this retailer
            all_payments_cursor = db.retailer_payments.find({
                "$or": [
                    {"retailer_id": retailer_id},
                    {"retailer_name": {"$regex": "Chandra", "$options": "i"}}
                ]
            })
            all_payments = await all_payments_cursor.to_list(length=100)
            
            result["steps"].append({
                "step": 3,
                "action": "SEARCH FOR ₹4,050.25 PAYMENT",
                "status": "NOT FOUND with exact amount",
                "all_payments_for_retailer": [
                    {
                        "id": p.get("id"),
                        "amount": p.get("amount"),
                        "invoice_id": p.get("invoice_id"),
                        "payment_date": p.get("payment_date") or p.get("date") or p.get("created_at"),
                        "payment_mode": p.get("payment_mode"),
                        "payment_method": p.get("payment_method"),
                    } for p in all_payments
                ],
                "error": "Could not find the ₹4,050.25 payment. Please verify."
            })
            result["errors"].append("₹4,050.25 payment not found")
            return result
        
        payment_amount = payment.get("amount", 0)
        payment_current_invoice = payment.get("invoice_id")
        
        result["steps"].append({
            "step": 3,
            "action": "IDENTIFY PAYMENT TO RE-LINK",
            "payment_id": payment.get("id"),
            "payment_amount": payment_amount,
            "payment_mode": payment.get("payment_mode"),
            "payment_method": payment.get("payment_method"),
            "payment_date": payment.get("payment_date") or payment.get("date") or payment.get("created_at"),
            "currently_linked_to": payment_current_invoice,
            "will_link_to": invoice_id,
            "needs_relink": payment_current_invoice != invoice_id
        })
        
        # ========== STEP 5: CALCULATE FINAL STATE ==========
        # The invoice should be restored to ₹4,050.25 (pre-credit), fully paid
        final_payable = TARGET_PAYABLE
        final_amount_paid = payment_amount
        final_balance = max(0, final_payable - final_amount_paid)
        final_status = "paid" if final_balance == 0 else ("partial" if final_amount_paid > 0 else "pending")
        
        result["steps"].append({
            "step": 4,
            "action": "CALCULATE FINAL INVOICE STATE",
            "before": {
                "gross_value": invoice.get("gross_value"),
                "net_payable": invoice.get("net_payable"),
                "final_payable": invoice.get("final_payable"),
                "amount_paid": invoice.get("amount_paid"),
                "total_credit_adjusted": invoice.get("total_credit_adjusted"),
                "credit_note_adjustments_count": len(credit_adjustments),
                "balance_due": invoice.get("balance_due"),
                "payment_status": invoice.get("payment_status"),
            },
            "after": {
                "final_payable": final_payable,
                "net_payable": final_payable,
                "amount_paid": final_amount_paid,
                "total_credit_adjusted": 0,
                "credit_note_adjustments": [],
                "balance_due": final_balance,
                "payment_status": final_status,
            },
            "summary": {
                "removing_credit_adjustments": f"₹{total_credit_adjusted}",
                "restoring_payable_to": f"₹{final_payable}",
                "linking_payment": f"₹{payment_amount}",
                "final_balance": f"₹{final_balance}",
                "final_status": final_status,
                "is_fully_paid": final_balance == 0
            }
        })
        
        # ========== STEP 6: DRY-RUN SUMMARY OR APPLY CHANGES ==========
        if not request.confirm:
            result["steps"].append({
                "step": 5,
                "action": "DRY-RUN COMPLETE",
                "message": "No changes made. Review the above and call with {\"confirm\": true} to apply.",
                "changes_to_apply": [
                    f"1. Backup invoice, payment, and {len(actual_credit_notes)} credit notes to 'maintenance_backups' collection",
                    f"2. Remove {len(credit_adjustments)} credit note adjustments (₹{total_credit_adjusted}) from invoice",
                    f"3. Return {len(credit_note_ids)} credit notes to available/pending status",
                    f"4. Re-link payment ₹{payment_amount} to invoice {invoice_id}",
                    f"5. Update invoice: final_payable=₹{final_payable}, net_payable=₹{final_payable}, amount_paid=₹{final_amount_paid}, total_credit_adjusted=₹0, balance_due=₹{final_balance}, payment_status='{final_status}'"
                ]
            })
            result["success"] = True
            return result
        
        # ========== APPLY CHANGES ==========
        
        # 6A. Create backups
        backup_timestamp = datetime.now(timezone.utc).isoformat()
        backup_prefix = f"chandra_deep_fix_{backup_timestamp.replace(':', '-')}"
        
        # Backup invoice (remove _id to avoid duplicate key)
        invoice_backup = {**invoice, "_backup_id": f"{backup_prefix}_invoice", "_backup_at": backup_timestamp, "_backup_type": "invoice"}
        if "_id" in invoice_backup:
            del invoice_backup["_id"]
        await db.maintenance_backups.insert_one(invoice_backup)
        
        # Backup payment
        if payment:
            payment_backup = {**payment, "_backup_id": f"{backup_prefix}_payment", "_backup_at": backup_timestamp, "_backup_type": "payment"}
            if "_id" in payment_backup:
                del payment_backup["_id"]
            await db.maintenance_backups.insert_one(payment_backup)
        
        # Backup credit notes
        for i, cn in enumerate(actual_credit_notes):
            cn_backup = {**cn, "_backup_id": f"{backup_prefix}_creditnote_{i}", "_backup_at": backup_timestamp, "_backup_type": "credit_note"}
            if "_id" in cn_backup:
                del cn_backup["_id"]
            await db.maintenance_backups.insert_one(cn_backup)
        
        result["steps"].append({
            "step": 5,
            "action": "BACKUPS CREATED",
            "backup_collection": "maintenance_backups",
            "backup_prefix": backup_prefix,
            "documents_backed_up": {
                "invoice": 1,
                "payment": 1 if payment else 0,
                "credit_notes": len(actual_credit_notes)
            }
        })
        
        # 6B. Update credit notes to available/pending status
        updated_credit_notes = 0
        for cn_id in credit_note_ids:
            if cn_id:
                update_result = await db.retailer_credit_notes.update_one(
                    {"id": cn_id},
                    {
                        "$set": {
                            "status": "available",
                            "is_applied": False,
                            "applied_to_invoice": None,
                            "applied_to_invoice_id": None,
                            "applied_invoice_number": None,
                            "applied_at": None,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                            "_returned_by_maintenance": backup_timestamp
                        }
                    }
                )
                if update_result.modified_count > 0:
                    updated_credit_notes += 1
        
        result["steps"].append({
            "step": 6,
            "action": "CREDIT NOTES RETURNED TO AVAILABLE",
            "credit_notes_updated": updated_credit_notes,
            "credit_note_ids": credit_note_ids
        })
        
        # 6C. Re-link payment to this invoice
        if payment:
            payment_update = await db.retailer_payments.update_one(
                {"id": payment.get("id")},
                {
                    "$set": {
                        "invoice_id": invoice_id,
                        "invoice_number": "CHA-INV-14AUG2026-002",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "_relinked_by_maintenance": backup_timestamp
                    }
                }
            )
            result["steps"].append({
                "step": 7,
                "action": "PAYMENT RE-LINKED",
                "payment_id": payment.get("id"),
                "now_linked_to_invoice_id": invoice_id,
                "now_linked_to_invoice_number": "CHA-INV-14AUG2026-002",
                "modified": payment_update.modified_count > 0
            })
        
        # 6D. Update invoice - restore to pre-credit state, mark as paid
        invoice_update_fields = {
            # Restore payable amounts
            "final_payable": final_payable,
            "net_payable": final_payable,
            
            # Clear credit adjustments
            "credit_note_adjustments": [],
            "total_credit_adjusted": 0,
            
            # Set payment status
            "amount_paid": final_amount_paid,
            "balance_due": final_balance,
            "payment_status": final_status,
            
            # Metadata
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "_maintenance_fix_applied": backup_timestamp,
            "_maintenance_fix_description": "Removed credit note adjustments, re-linked payment, marked as paid"
        }
        
        invoice_update = await db.retailer_invoices.update_one(
            {"id": invoice_id},
            {"$set": invoice_update_fields}
        )
        
        result["steps"].append({
            "step": 8,
            "action": "INVOICE UPDATED",
            "invoice_id": invoice_id,
            "fields_updated": invoice_update_fields,
            "modified": invoice_update.modified_count > 0
        })
        
        # 6E. Verify final state
        final_invoice = await db.retailer_invoices.find_one({"id": invoice_id})
        final_payment = await db.retailer_payments.find_one({"id": payment.get("id")}) if payment else None
        
        # Verify credit notes are now available
        final_credit_notes = []
        if credit_note_ids:
            cursor = db.retailer_credit_notes.find({"id": {"$in": credit_note_ids}})
            final_credit_notes = await cursor.to_list(length=100)
        
        result["steps"].append({
            "step": 9,
            "action": "VERIFICATION - FINAL STATE",
            "invoice": {
                "invoice_number": final_invoice.get("invoice_number"),
                "final_payable": final_invoice.get("final_payable"),
                "net_payable": final_invoice.get("net_payable"),
                "amount_paid": final_invoice.get("amount_paid"),
                "total_credit_adjusted": final_invoice.get("total_credit_adjusted"),
                "credit_note_adjustments": final_invoice.get("credit_note_adjustments", []),
                "balance_due": final_invoice.get("balance_due"),
                "payment_status": final_invoice.get("payment_status"),
            },
            "payment": {
                "id": final_payment.get("id") if final_payment else None,
                "amount": final_payment.get("amount") if final_payment else None,
                "invoice_id": final_payment.get("invoice_id") if final_payment else None,
                "invoice_number": final_payment.get("invoice_number") if final_payment else None,
            } if final_payment else None,
            "credit_notes_now_available": [
                {
                    "id": cn.get("id"),
                    "amount": cn.get("amount"),
                    "status": cn.get("status"),
                    "is_applied": cn.get("is_applied")
                } for cn in final_credit_notes
            ]
        })
        
        result["success"] = True
        result["mode"] = "CHANGES APPLIED SUCCESSFULLY"
        
    except Exception as e:
        result["errors"].append(str(e))
        result["success"] = False
    
    return result


@router.get("/fix-chandra-deep-invoice/status")
async def check_fix_status(
    token_valid: bool = Depends(verify_maintenance_token),
    db=Depends(get_db)
):
    """Check if the fix has already been applied (idempotency check)"""
    
    invoice = await db.retailer_invoices.find_one({"invoice_number": "CHA-INV-14AUG2026-002"})
    
    if not invoice:
        return {"status": "error", "message": "Invoice not found"}
    
    already_fixed = invoice.get("_maintenance_fix_applied")
    
    return {
        "invoice_number": "CHA-INV-14AUG2026-002",
        "already_fixed": already_fixed is not None,
        "fix_applied_at": already_fixed,
        "current_state": {
            "final_payable": invoice.get("final_payable"),
            "net_payable": invoice.get("net_payable"),
            "amount_paid": invoice.get("amount_paid"),
            "total_credit_adjusted": invoice.get("total_credit_adjusted"),
            "credit_note_adjustments_count": len(invoice.get("credit_note_adjustments", [])),
            "balance_due": invoice.get("balance_due"),
            "payment_status": invoice.get("payment_status"),
        }
    }
