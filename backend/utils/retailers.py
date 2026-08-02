"""
Retailer utility functions for filtering and validation.
"""
from typing import List, Dict, Any


def get_active_retailers_on_date(all_retailers: List[Dict[str, Any]], expense_date_str: str) -> List[str]:
    """
    Returns list of retailer IDs that were active on the given date.
    
    A retailer is considered active on a date if:
    - The expense date is >= retailer's first_dispatch_date (or created_at if no dispatch)
    - AND (status is 'active' OR status is 'churned' but churned_at date is ON OR AFTER the expense_date)
    
    Args:
        all_retailers: List of retailer dicts with 'id', 'status', 'churned_at', 'first_dispatch_date' fields
        expense_date_str: Date string in YYYY-MM-DD format
        
    Returns:
        List of retailer IDs that were active on the given date
    """
    active_ids = []
    for r in all_retailers:
        status = r.get("status", "active")
        churned_at = r.get("churned_at", "")
        
        # Check if retailer started before or on the expense date
        # Use first_dispatch_date if available, otherwise fall back to created_at
        first_dispatch_date = r.get("first_dispatch_date", "")
        created_at = r.get("created_at", "")
        
        # Determine retailer's start date
        retailer_start_date = None
        if first_dispatch_date:
            retailer_start_date = str(first_dispatch_date)[:10]
        elif created_at:
            retailer_start_date = str(created_at)[:10]
        
        # If we have a start date and expense is before it, skip this retailer
        if retailer_start_date and expense_date_str < retailer_start_date:
            continue
        
        # Check churn status
        if status == "churned" and churned_at:
            # If churned before expense_date, skip (retailer was not active on that date)
            if churned_at[:10] < expense_date_str:
                continue
        elif status == "churned":
            # Churned with no date means currently churned - skip
            continue
            
        active_ids.append(r.get("id"))
    
    return active_ids


def alloc_residual_to_first(shares_dict: Dict[str, float], total_amount: float, first_key: str) -> Dict[str, float]:
    """
    Allocate any residual cents to the first key to ensure amounts sum exactly.
    
    This handles rounding errors when dividing amounts equally among retailers.
    
    Args:
        shares_dict: Dictionary mapping retailer_id to their allocated share
        total_amount: The original total amount that should be distributed
        first_key: The retailer_id that should receive any residual cents
        
    Returns:
        Updated shares_dict with residual allocated to first_key
    """
    if not shares_dict or not first_key:
        return shares_dict
        
    allocated = sum(shares_dict.values())
    residual = round(total_amount - allocated, 2)
    
    if residual != 0 and first_key in shares_dict:
        shares_dict[first_key] = round(shares_dict[first_key] + residual, 2)
        
    return shares_dict
