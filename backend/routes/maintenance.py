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
    - Recompute invoice as fully paid
    
    Dry-run by default. Pass {"confirm": true} to apply changes.
    """
    
    result = {
        "mode": "DRY-RUN (no changes made)" if not request.confirm else "APPLYING CHANGES",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "invoice_number": "CHA-INV-14AUG2026-002",
        "retailer": "Chandra Deep Market",
        "steps": [],
        "backup_collection": "maintenance_backups",
        "errors": [],
        "success": False
    }
    
    try:
        # ========== STEP 1: FIND THE INVOICE ==========
        invoice = await db.invoices.find_one({"invoice_number": "CHA-INV-14AUG2026-002"})
        
        if not invoice:
            result["errors"].append("Invoice CHA-INV-14AUG2026-002 not found")
            return result
        
        invoice_id = invoice.get("id")
        retailer_id = invoice.get("retailer_id")
        
        # ========== STEP 2: ANALYZE PAYABLE TOTALS ==========
        payable_analysis = {
            "total_amount": invoice.get("total_amount"),
            "payable_amount": invoice.get("payable_amount"),
            "final_amount": invoice.get("final_amount"),
            "subtotal": invoice.get("subtotal"),
            "rejection_amount": invoice.get("rejection_amount", 0),
            "damage_amount": invoice.get("damage_amount", 0),
            "total_rejections": invoice.get("total_rejections", 0),
            "amount_paid": invoice.get("amount_paid", 0),
            "credit_applied": invoice.get("credit_applied", 0),
            "balance_due": invoice.get("balance_due"),
            "payment_status": invoice.get("payment_status"),
        }
        
        # Calculate which payable total is correct
        base_total = payable_analysis["total_amount"] or 0
        rejections = (payable_analysis["rejection_amount"] or 0) + (payable_analysis["damage_amount"] or 0) + (payable_analysis["total_rejections"] or 0)
        
        payable_analysis["calculated_after_rejections"] = base_total - rejections
        payable_analysis["explanation"] = (
            f"Base total: ₹{base_total}, "
            f"Rejections/Damages: ₹{rejections}, "
            f"After rejections: ₹{base_total - rejections}"
        )
        
        result["steps"].append({
            "step": 1,
            "action": "ANALYZE INVOICE PAYABLE TOTALS",
            "invoice_id": invoice_id,
            "payable_analysis": payable_analysis,
            "recommendation": "The correct payable should be total_amount (₹{}) since rejections appear to be ₹{}".format(
                base_total, rejections
            )
        })
        
        # ========== STEP 3: FIND CREDIT NOTE ADJUSTMENTS ==========
        credit_notes_applied = invoice.get("credit_notes_applied", [])
        total_credit_applied = sum(cn.get("amount", 0) for cn in credit_notes_applied)
        
        # Also find the actual credit note documents
        credit_note_ids = [cn.get("credit_note_id") or cn.get("id") for cn in credit_notes_applied]
        actual_credit_notes = []
        if credit_note_ids:
            cursor = db.credit_notes.find({"id": {"$in": credit_note_ids}})
            actual_credit_notes = await cursor.to_list(length=100)
        
        result["steps"].append({
            "step": 2,
            "action": "IDENTIFY CREDIT NOTES TO REMOVE",
            "credit_notes_on_invoice": len(credit_notes_applied),
            "total_credit_applied": total_credit_applied,
            "credit_note_details": [
                {
                    "id": cn.get("credit_note_id") or cn.get("id"),
                    "amount": cn.get("amount"),
                    "applied_at": cn.get("applied_at")
                } for cn in credit_notes_applied
            ],
            "will_return_to_pending": len(credit_notes_applied)
        })
        
        # ========== STEP 4: FIND THE ₹4,050.25 PAYMENT ==========
        # Search for payment around ₹4,050.25 for this retailer
        payment = await db.payments.find_one({
            "retailer_id": retailer_id,
            "amount": {"$gte": 4050, "$lte": 4051}
        })
        
        if not payment:
            # Try broader search
            payment = await db.payments.find_one({
                "retailer_name": {"$regex": "Chandra", "$options": "i"},
                "amount": {"$gte": 4050, "$lte": 4051}
            })
        
        if not payment:
            # Search all payments for this retailer to find the one
            all_payments_cursor = db.payments.find({
                "$or": [
                    {"retailer_id": retailer_id},
                    {"retailer_name": {"$regex": "Chandra", "$options": "i"}}
                ]
            })
            all_payments = await all_payments_cursor.to_list(length=100)
            
            result["steps"].append({
                "step": 3,
                "action": "SEARCH FOR ₹4,050.25 PAYMENT",
                "status": "NOT FOUND with exact criteria",
                "all_payments_for_retailer": [
                    {
                        "id": p.get("id"),
                        "amount": p.get("amount"),
                        "invoice_id": p.get("invoice_id"),
                        "payment_date": p.get("payment_date") or p.get("created_at"),
                        "method": p.get("payment_method")
                    } for p in all_payments
                ],
                "error": "Could not find the ₹4,050.25 UPI payment. Please verify payment details."
            })
        else:
            payment_current_invoice = payment.get("invoice_id")
            result["steps"].append({
                "step": 3,
                "action": "IDENTIFY PAYMENT TO RE-LINK",
                "payment_id": payment.get("id"),
                "payment_amount": payment.get("amount"),
                "payment_method": payment.get("payment_method"),
                "payment_date": payment.get("payment_date") or payment.get("created_at"),
                "currently_linked_to": payment_current_invoice,
                "will_link_to": invoice_id,
                "needs_relink": payment_current_invoice != invoice_id
            })
        
        # ========== STEP 5: CALCULATE FINAL STATE ==========
        payment_amount = payment.get("amount", 0) if payment else 0
        correct_payable = base_total  # Using total_amount as the correct payable
        
        result["steps"].append({
            "step": 4,
            "action": "CALCULATE FINAL INVOICE STATE",
            "before": {
                "total_amount": invoice.get("total_amount"),
                "amount_paid": invoice.get("amount_paid"),
                "credit_applied": invoice.get("credit_applied"),
                "balance_due": invoice.get("balance_due"),
                "payment_status": invoice.get("payment_status")
            },
            "after": {
                "total_amount": correct_payable,
                "amount_paid": payment_amount,
                "credit_applied": 0,
                "balance_due": max(0, correct_payable - payment_amount),
                "payment_status": "paid" if payment_amount >= correct_payable else "partial",
                "credit_notes_applied": []
            },
            "difference": {
                "payment_amount": payment_amount,
                "correct_payable": correct_payable,
                "is_fully_paid": payment_amount >= correct_payable,
                "overpayment_or_shortfall": payment_amount - correct_payable
            }
        })
        
        # ========== STEP 6: DRY-RUN SUMMARY OR APPLY CHANGES ==========
        if not request.confirm:
            result["steps"].append({
                "step": 5,
                "action": "DRY-RUN COMPLETE",
                "message": "No changes made. Review the above and call with {\"confirm\": true} to apply.",
                "changes_to_apply": [
                    f"1. Backup invoice, payment, and {len(credit_notes_applied)} credit notes",
                    f"2. Remove {len(credit_notes_applied)} credit note adjustments (₹{total_credit_applied}) from invoice",
                    f"3. Return {len(credit_notes_applied)} credit notes to pending/available status",
                    f"4. Re-link payment ₹{payment_amount} to invoice {invoice_id}",
                    f"5. Update invoice: amount_paid=₹{payment_amount}, credit_applied=₹0, balance_due=₹{max(0, correct_payable - payment_amount)}"
                ]
            })
            result["success"] = True
            return result
        
        # ========== APPLY CHANGES ==========
        
        # 6A. Create backups
        backup_timestamp = datetime.now(timezone.utc).isoformat()
        backup_prefix = f"chandra_deep_fix_{backup_timestamp}"
        
        # Backup invoice
        invoice_backup = {**invoice, "_backup_id": f"{backup_prefix}_invoice", "_backup_at": backup_timestamp}
        if "_id" in invoice_backup:
            del invoice_backup["_id"]
        await db.maintenance_backups.insert_one(invoice_backup)
        
        # Backup payment
        if payment:
            payment_backup = {**payment, "_backup_id": f"{backup_prefix}_payment", "_backup_at": backup_timestamp}
            if "_id" in payment_backup:
                del payment_backup["_id"]
            await db.maintenance_backups.insert_one(payment_backup)
        
        # Backup credit notes
        for i, cn in enumerate(actual_credit_notes):
            cn_backup = {**cn, "_backup_id": f"{backup_prefix}_creditnote_{i}", "_backup_at": backup_timestamp}
            if "_id" in cn_backup:
                del cn_backup["_id"]
            await db.maintenance_backups.insert_one(cn_backup)
        
        result["steps"].append({
            "step": 5,
            "action": "BACKUPS CREATED",
            "backup_collection": "maintenance_backups",
            "backup_prefix": backup_prefix,
            "documents_backed_up": 1 + (1 if payment else 0) + len(actual_credit_notes)
        })
        
        # 6B. Update credit notes to pending/available
        updated_credit_notes = 0
        for cn_id in credit_note_ids:
            if cn_id:
                update_result = await db.credit_notes.update_one(
                    {"id": cn_id},
                    {
                        "$set": {
                            "status": "pending",
                            "applied_to_invoice": None,
                            "applied_at": None,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        },
                        "$unset": {
                            "applied_invoice_number": ""
                        }
                    }
                )
                if update_result.modified_count > 0:
                    updated_credit_notes += 1
        
        result["steps"].append({
            "step": 6,
            "action": "CREDIT NOTES RETURNED TO PENDING",
            "credit_notes_updated": updated_credit_notes
        })
        
        # 6C. Re-link payment to this invoice
        if payment:
            payment_update = await db.payments.update_one(
                {"id": payment.get("id")},
                {
                    "$set": {
                        "invoice_id": invoice_id,
                        "invoice_number": "CHA-INV-14AUG2026-002",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
            result["steps"].append({
                "step": 7,
                "action": "PAYMENT RE-LINKED",
                "payment_id": payment.get("id"),
                "now_linked_to": invoice_id,
                "modified": payment_update.modified_count > 0
            })
        
        # 6D. Update invoice
        new_balance = max(0, correct_payable - payment_amount)
        new_status = "paid" if payment_amount >= correct_payable else ("partial" if payment_amount > 0 else "pending")
        
        invoice_update = await db.invoices.update_one(
            {"id": invoice_id},
            {
                "$set": {
                    "amount_paid": payment_amount,
                    "credit_applied": 0,
                    "balance_due": new_balance,
                    "payment_status": new_status,
                    "credit_notes_applied": [],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "_maintenance_fix_applied": backup_timestamp
                }
            }
        )
        
        result["steps"].append({
            "step": 8,
            "action": "INVOICE UPDATED",
            "invoice_id": invoice_id,
            "new_values": {
                "amount_paid": payment_amount,
                "credit_applied": 0,
                "balance_due": new_balance,
                "payment_status": new_status,
                "credit_notes_applied": []
            },
            "modified": invoice_update.modified_count > 0
        })
        
        # 6E. Verify final state
        final_invoice = await db.invoices.find_one({"id": invoice_id})
        final_payment = await db.payments.find_one({"id": payment.get("id")}) if payment else None
        
        result["steps"].append({
            "step": 9,
            "action": "VERIFICATION - FINAL STATE",
            "invoice": {
                "invoice_number": final_invoice.get("invoice_number"),
                "total_amount": final_invoice.get("total_amount"),
                "amount_paid": final_invoice.get("amount_paid"),
                "credit_applied": final_invoice.get("credit_applied"),
                "balance_due": final_invoice.get("balance_due"),
                "payment_status": final_invoice.get("payment_status"),
                "credit_notes_applied": final_invoice.get("credit_notes_applied", [])
            },
            "payment": {
                "id": final_payment.get("id") if final_payment else None,
                "amount": final_payment.get("amount") if final_payment else None,
                "invoice_id": final_payment.get("invoice_id") if final_payment else None
            } if final_payment else None
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
    
    invoice = await db.invoices.find_one({"invoice_number": "CHA-INV-14AUG2026-002"})
    
    if not invoice:
        return {"status": "error", "message": "Invoice not found"}
    
    already_fixed = invoice.get("_maintenance_fix_applied")
    
    return {
        "invoice_number": "CHA-INV-14AUG2026-002",
        "already_fixed": already_fixed is not None,
        "fix_applied_at": already_fixed,
        "current_state": {
            "amount_paid": invoice.get("amount_paid"),
            "credit_applied": invoice.get("credit_applied"),
            "balance_due": invoice.get("balance_due"),
            "payment_status": invoice.get("payment_status"),
            "credit_notes_applied_count": len(invoice.get("credit_notes_applied", []))
        }
    }
