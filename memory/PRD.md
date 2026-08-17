# Vezlo - Product Requirements Document

## Changelog (August 2026)

### August 16, 2026 - Backdated Invoice Regeneration Overhaul ✅
- **CRITICAL Backend Logic Changes** in `/app/backend/routes/retailer_portal.py`:

- **7 Rules Implemented for Backdated Invoice Handling**:
  1. **Restore only original credit notes/payments**: When regenerating, only the original invoice's CNs and payments are restored - not all pending CNs
  2. **No orphaned payments**: Payments are either relinked or flagged with `needs_relinking=true` - never left pointing at deleted invoices. `paid_amount` is updated correctly
  3. **Auto-balance handling**: Overpaid upon regeneration → auto-generates a credit note; underpaid → shows pending balance in response
  4. **Preserve original date/number**: Regenerated invoice defaults to original invoice date and retains same invoice number
  5. **Revision stamp**: Invoice marked with `is_revised=true`, `last_revised_on`, `last_revised_by_name` and `revision_history` array
  6. **Admin-only for backdated**: Staff CANNOT delete backdated invoices (only same-day). Admins can delete/regenerate any invoice
  7. **Credit note full reset**: When CN is released, fully reset: `adjusted_amount=0`, `pending_amount=full`, `status='pending'`, clear `adjusted_in_invoices` and `adjusted_against_invoices` arrays

- **New Endpoints Created**:
  - `POST /api/retailer/retailer-invoices/{invoice_id}/regenerate` - Regenerate a backdated invoice with proper payment/CN restoration
  - `POST /api/retailer/retailer-payments/{payment_id}/relink` - Manually relink an orphaned payment to a new invoice
  - Updated `GET /api/retailer/retailer-payments/orphans` - Now also returns `needs_relinking` payments

- **Deletion Audit Trail**:
  - New MongoDB collection `deleted_invoices_audit` stores deletion records with:
    - Original invoice details
    - Payments unlinked count
    - Credit notes reset count
    - Who deleted and when
    - Dispatch IDs for potential restoration

- **Schema Changes**:
  - `retailer_invoices` now has: `is_revised`, `revision_history[]`, `last_revised_on`, `last_revised_by`, `last_revised_by_name`
  - `retailer_payments` now has: `needs_relinking`, `unlinked_at`, `unlinked_reason`, `original_invoice_id`, `original_invoice_number`, `relinked_at`, `relinked_from_invoice`
  - `retailer_credit_notes` updates: Both `adjusted_in_invoices` and `adjusted_against_invoices` arrays are properly cleared when released

- **Files Modified**:
  - `backend/routes/retailer_portal.py` (delete_retailer_invoice, new regenerate_retailer_invoice, new relink_payment_to_invoice, updated get_orphan_payments)

- **Testing**:
  - Backend test file: `/app/backend/tests/test_backdated_invoice_deletion.py` (11 tests, 100% pass rate)
  - Test report: `/app/test_reports/iteration_51.json`

### August 16, 2026 - Frontend Regenerate Invoice Button ✅
- **UI Change**: Added "Regenerate" button (teal RotateCcw icon) to invoice action buttons
- **Location**: Invoice table actions, between Recalculate and Delete buttons
- **Visibility**: Admin-only (uses `getCurrentUserRole()` check)
- **Functionality**: 
  - Calls `POST /api/retailer-invoices/{invoice_id}/regenerate`
  - Does NOT delete-and-recreate, uses single regenerate endpoint
  - Shows detailed confirmation dialog before regenerating
  - Success toast shows payments relinked, CNs restored, pending balance
- **Files Modified**:
  - `frontend/src/pages/admin/RetailerOrders.js` (Added RotateCcw import, handleRegenerateInvoice function, UI button)

### August 17, 2026 - Enhanced Regenerate Orphan Payment Recovery ✅
- **Broadened Payment Re-linking**: Regenerate now finds orphaned payments from previous deletes
  - Original query: `invoice_id == current_invoice_id`
  - NEW query also includes: `needs_relinking=true AND original_invoice_number == invoice_number AND retailer_id matches`
  - Payments are deduped before relinking
  
- **Audit Record Enhancements**:
  - Delete now stores `payment_ids_unlinked` array (list of payment IDs) in `deleted_invoices_audit`
  - Regenerate checks audit record for `credit_note_adjustments` that survive delete
  - Response now includes `used_audit_record: true/false` to indicate audit was used

- **Payment Re-link Cleanup**:
  - Sets `invoice_id` and `invoice_number` to new invoice
  - Clears flags: `needs_relinking`, `original_invoice_number`, `original_invoice_id`, `unlinked_at`, `unlinked_reason`

- **Testing**:
  - Test file: `/app/backend/tests/test_regenerate_audit_orphan_relink.py` (5 tests, 100% pass)
  - Test report: `/app/test_reports/iteration_52.json`

### August 17, 2026 - Auto-Indent Only Checks Auto-Generated Indents ✅
- **Change**: Auto-indent "already exists" check now only considers auto-generated indents
- **Impact**: Manual indents (created by field team/retailer/admin) no longer block auto-generation
- **Filter Added**: `is_auto_generated: True` to existing-indent lookup queries
- **Files Modified**:
  - `backend/routes/retailer_portal.py` (bulk scheduler + single generate-auto-indent)
  - `backend/routes/admin.py` (single generate-auto-indent)
- **No Delete/Replace**: Manual indents are never deleted, replaced, or upserted

### August 17, 2026 - Edit & Regenerate Invoice Flow ✅
- **Frontend Changes** in `RetailerOrders.js`:
  - Edit modal now calls `POST /api/retailer-invoices/{id}/regenerate` with `selected_items` instead of `PUT`
  - Added checkbox to each item to allow removing items from invoice
  - Shows live preview of overpayment/shortfall when totals change
  - Button renamed to "Save & Regenerate" with better modal header
  - Modal subtitle: "Modify items, quantities, or MRP. Payment and credit notes will be preserved."
  
- **Invoice List Enhancement**:
  - When `invoice.is_revised` is true, shows "Revised {date} by {name}" badge under invoice number
  - Hover tooltip shows full revision details

- **Overpayment/Shortfall Warning**:
  - Purple warning box when new total < paid amount (overpayment → CN will be created)
  - Amber warning box when new total > paid amount (shortfall → pending balance)

### August 17, 2026 - Reviser Name Fix ✅
- **Backend Fix**: Regenerate endpoint now looks up user's real name from `users` collection
  - Queries `db.users.find_one({"id": current_user["user_id"]})` to get actual name
  - Falls back to email if name not found, then "Admin"
  - Fixed in revision_stamp, last_revised_by_name, and response message
- **Frontend Fix**: Revised badge now shows name in visible text (not just tooltip)
  - Format: "Revised {date} by {name}"

### August 17, 2026 - Edit Invoice Modal Enhancements ✅
- **S.No Column**: Added as first column in items table, shows row number (index + 1)
- **Per-row Delete Icon**: Trash icon at end of each row to permanently remove item from form
- **Add Item Button**: 
  - Fetches uninvoiced dispatched items via `GET /api/retailer-dispatches/uninvoiced?retailer_id={id}`
  - Shows picker modal with checkbox selection (same UI pattern as Create Invoice)
  - Selected items are mapped to correct shape: dispatch_id, product_id, product_name, variant_name, quantity, supplied_qty, rejected_qty, mrp, total_value, selected
  - Filters out items already on the invoice
- **New State Variables**: `showEditInvoiceAddItems`, `editInvoiceUninvoicedItems`, `editInvoiceSelectedItemIds`, `editInvoiceAddItemsLoading`
- **New Functions**: `removeEditInvoiceItem`, `fetchEditInvoiceUninvoicedItems`, `toggleEditInvoiceItemSelection`, `addSelectedItemsToEditInvoice`

### August 13, 2026 - Incentives & Allowances Feature ✅
- **New Feature in Payroll Processing Tab**:
  - Added "Add Incentive/Allowance" button (purple) to record employee incentives and allowances
  - Added "View All" button to see all incentives/allowances for the date range
  
- **Incentive/Allowance Modal**:
  - Employee dropdown (filters by active employees)
  - Date picker for recording date
  - Amount field
  - Category dropdown with optgroups:
    - Incentives: Daily Incentive, Monthly Incentive, Performance Bonus
    - Allowances: Travelling Allowance, Food Allowance, Mobile Allowance, Other
  - Description field (optional)
  - Edit and Delete functionality

- **Summary Cards Updated**:
  - Row 2 now shows: Total Incentives (purple), Total Allowances (teal), Total Paid, Net Payable
  - Incentives and allowances are included in total payroll calculations

- **Payroll Table Updated**:
  - New columns: SALARY, INCENTIVE (purple bg), ALLOWANCE (teal bg), TOTAL
  - Each employee's incentives/allowances are shown inline

- **Payslip PDF Updated**:
  - Earnings table now includes separate rows for Incentives (purple) and Allowances (teal)
  - New "Earnings Breakdown" section showing: Base Salary, Incentives, Allowances, Total
  - Preview modal and PDF download both show the breakdown
  - Only shows incentive/allowance rows if values > 0

- **Backend APIs Created**:
  - `GET /api/incentives` - List incentives with date range filter
  - `POST /api/incentives` - Add new incentive/allowance
  - `PUT /api/incentives/{id}` - Update existing entry
  - `DELETE /api/incentives/{id}` - Delete entry
  - `GET /api/incentives/summary` - Get summary by employee
  - MongoDB collection: `employee_incentives`
  - Payroll calculation updated to include incentives/allowances in totals

- **Files Modified**:
  - `backend/routes/attendance.py` (Added incentives CRUD APIs, updated payroll calculation)
  - `frontend/src/pages/admin/FixedExpenses.js` (Added incentive modals, updated payslip preview & PDF)

### August 13, 2026 - Expenses Tab Redesign ✅
- **UI Changes**:
  - Removed "Corporate Expenses" button
  - Added "Record Expense" button (opens Add Fixed Expense dialog)
  - Added "Manage Vendors" button (opens vendor management dialog)
  - Added Vendor filter dropdown in filters section

- **Vendor Management**:
  - New "Manage Vendors" dialog with list of all vendors
  - Each vendor shows: Name, Contact person, Phone, Notes
  - Add, Edit, and Delete vendor functionality
  - Vendors load from existing `/api/vendors` endpoint

- **Filtering**:
  - Added vendor filter to filter expenses by selected vendor
  - Summary cards (Total Fixed, Paid, Pending, Overdue) update based on vendor filter
  - Expense table filters by selected vendor

- **Flow Similar to Variable Expenses**:
  - "Record Expense" opens the same expense form dialog
  - Summary cards show: Total Fixed, Paid, Pending, Overdue
  - Filter options: Month/Date Range, Category, Status, Vendor

- **Files Modified**:
  - `frontend/src/pages/admin/FixedExpenses.js` (Added vendor state, vendor management modals, vendor filter, updated UI)

### August 13, 2026 - LWD Empty Default & Department Select Fix ✅
- **LWD (Last Working Day) Field Fix**:
  - Changed LWD field to show empty by default instead of auto-filling with today's date
  - Added helper text: "Leave empty if employee is still working"
  - Added clear (X) button to reset LWD if a date was accidentally selected

- **Department Select Fix**:
  - Replaced Radix UI Select with native HTML `<select>` element for better compatibility inside Dialog modals
  - The Radix UI Select inside Dialog had focus management issues causing value not to be captured
  - Native select reliably captures department selection on form submit

- **Files Modified**:
  - `frontend/src/pages/admin/FixedExpenses.js` (Department dropdown changed to native select, LWD field updated)

### August 13, 2026 - Bank Details & Payslip Generation Feature ✅
- **Bank Details in Add Employee Modal**:
  - Added Bank Details section with:
    - Bank Name field
    - Account Number field  
    - IFSC Code field
  - Fields are stored in employee record and displayed in Payroll Processing
  
- **Payslip Preview & PDF Download**:
  - New Payslip Preview modal in Payroll Processing tab
  - Professional payslip layout with Vezlo branding (#CFFF04 header)
  - Includes: Employee details, Bank details, Pay period, Earnings breakdown
  - "Download PDF" button generates printable payslip document
  - System-generated document footer

- **Files Modified**:
  - `frontend/src/pages/admin/FixedExpenses.js` (Added bank fields to modal, payslip preview modal)

### August 13, 2026 - Fixed Expenses Redesign: Employee Management System ✅
- **New Tab Structure**:
  - Redesigned Fixed Expenses page with 4 main tabs:
    1. **Attendance** (Fully implemented)
    2. **Manage Employees** (Fully implemented)
    3. **Expenses** (Original expenses functionality)
    4. **Payroll Processing** (Fully implemented)
  - Removed "Generate Recurring" and "Add Expense" buttons from main header

- **Manage Employees Tab Features**:
  - Employee table with columns: S.No, Employee ID, Name, Phone, Department, CTC, DOJ, LWD, Status, Actions
  - Auto-generated Employee IDs (EMP001, EMP002, etc.)
  - Add Employee popup with fields:
    - Name*, Phone Number*, Department*, Vertical (Retail/QC/Central), Designation
    - CTC (Annual), Date of Joining*, Last Working Day, City, Status
    - Address, State, Gender
    - Bank Details: Bank Name, Account Number, IFSC Code
    - ID Proof: Aadhar Number, PAN Number, Emergency Contact Number
  - Edit Employee functionality with pre-filled form
  - View Employee details modal
  - Delete Employee (soft delete)
  - Status badges (active/inactive/terminated)

- **Attendance Tab Features**:
  - Date picker for selecting attendance date
  - "Mark All Present" bulk action with smart 9-hour allocation by vertical
  - Summary cards (Total Employees, Present, Absent, Paid Leaves)
  - Detailed attendance table with Working Hrs, Retail Hrs, QC Hrs, OT tracking
  - "Copy to Dates" feature for bulk attendance entry

- **Payroll Processing Tab Features**:
  - Date range picker (From/To)
  - Summary cards (Total Payroll, Employee Count, Paid Leaves, Man Days)
  - Payroll table with Bank A/C, IFSC, Present/Absent days, Amount, Paid, Net Payable
  - "Details" modal for individual employee breakdown
  - "Pay Now" button to record payments
  - Payslip Preview and Download PDF functionality

- **Backend APIs Created**:
  - `GET /api/fixed-employees` - List all employees with filters
  - `POST /api/fixed-employees` - Create new employee
  - `GET /api/fixed-employees/{id}` - Get single employee
  - `PUT /api/fixed-employees/{id}` - Update employee
  - `DELETE /api/fixed-employees/{id}` - Soft delete employee
  - `POST /api/attendance/mark-all` - Bulk mark attendance with 9hr allocation
  - `GET /api/attendance/payroll` - Get payroll calculations for date range
  - MongoDB collections: `fixed_employees`, `departments`, `attendance`

- **Files Created/Modified**:
  - `backend/routes/fixed_employees.py` (NEW)
  - `backend/routes/attendance.py` (NEW)
  - `backend/server.py` (Added router imports)
  - `frontend/src/pages/admin/FixedExpenses.js` (Major redesign ~4000 lines)


### August 13, 2026 - Branding Update: Vezlo Logo & Retailer Yellow Theme ✅
- **Login Page Logo Updated**:
  - Replaced old logo with the official Vezlo logo (neon yellow background with orange mascot)
  - Logo URL: `https://customer-assets-lxgj4vgw.emergentagent.net/job_harvest-hub-384/artifacts/ouyg8w1d_vezlo_logo_PRINT_300dpi.webp`
  - **Files Changed**: `frontend/src/pages/Login.js`

- **Retailer Portal Neon Yellow Theme**:
  - Added neon yellow (`#E5FF00`) background to all retailer dashboard pages
  - Added Vezlo logo header at the top of retailer dashboard
  - Created `.retailer-yellow-bg` CSS class for consistent styling
  - Updated Layout component to have transparent background when sidebar is hidden (retailer mode)
  - **Files Changed**: 
    - `frontend/src/pages/retailer/Dashboard.js`
    - `frontend/src/App.css`



### August 12, 2026 - Retailers with 0 Orders Yesterday Feature ✅
- **New Feature: "0 Orders Yesterday" Tracking**:
  - Added clickable link under Active Retailers card on both Admin Panel and Field Team Portal
  - Opens modal showing retailers who did not place any indent yesterday
  
- **Admin Panel (Retailer Orders)**:
  - Modal displays: S.No, Retailer Name, Area, Zone, Assigned To (Field Team Member Name)
  - Shows all active retailers across the system
  - Field team names are resolved from user_id to actual names
  
- **Field Team Portal**:
  - Modal displays: S.No, Retailer Name, Area
  - Shows only retailers assigned to that specific field team member
  - Clicking a retailer row navigates to their individual dashboard
  
- **Backend Endpoint**: `GET /api/retailers-zero-orders-yesterday`
  - Returns different data based on user role (admin sees all, field team sees assigned only)
  - Date is calculated as yesterday (UTC)
  - **Files Changed**: `backend/routes/users.py`
  
- **Frontend Files Changed**:
  - `frontend/src/pages/admin/RetailerOrders.js` - Added state, load function, and modal
  - `frontend/src/pages/field_team/Dashboard.js` - Added state, load function, and modal


### August 11, 2026 - Retailer Catalogue MRP Sync & Variant Display Fix ✅
- **P0 - MRP Sync Issue Fixed**:
  - **Problem**: Retailer catalogue was showing outdated MRP (e.g., Onion 500gm showing ₹15 instead of ₹18)
  - **Root Cause**: Backend prioritized stale `daily_mrp` data over recent dispatch data even when dates were equal
  - **Solution**: Modified `/api/retailer-catalogue/mrp` endpoint to prefer dispatch MRP when dates are >= daily_mrp date
  - **Logic Change**: Dispatch data (actual charged prices) now takes precedence as authoritative source of truth
  - **Files Changed**: `backend/routes/retailer_portal.py` (lines 10276-10350)

- **P0 - Variant UUID Display Issue Fixed**:
  - **Problem**: Some product variants (like Ginger) were displaying raw UUIDs instead of human-readable names
  - **Root Cause**: `getVariantName` returned raw variantId when not found in packagings, and `resolveVariantName` didn't use mrpData as fallback
  - **Solution**: Enhanced both functions to:
    1. Accept optional `productId` parameter
    2. Use `mrpData` as fallback source for variant names when packagings lookup fails
    3. Return empty string or 'Kg' default instead of raw UUIDs
  - **Files Changed**: `frontend/src/pages/retailer/Dashboard.js` (lines 1302-1370, plus ~10 call sites updated)

- **Technical Details**:
  - Backend: Changed date comparison from `>` to `>=` so dispatch data wins on same day
  - Frontend: Added mrpData fallback in variant resolution chain: packagings → mrpData → graceful fallback
  - Both fixes ensure retailers see correct prices and readable variant names when ordering


### August 10, 2026 - Retailer Summary Cards Enhancement ✅
- **Retailer Orders Page - Summary Cards Added**:
  - Added 4 retailer summary cards below the existing dashboard cards
  - Total Retailers, Active Retailers, Live Retailers, Churned Retailers
  - "Pending to go live" button under Live Retailers opens modal with list
  - **Files Changed**: `frontend/src/pages/admin/RetailerOrders.js`

- **"Pending to Go Live" Feature**:
  - New modal showing active retailers without any invoices
  - Displays: Shop Name, Contact, City, Onboarded Date
  - New API endpoint: `GET /api/retailers-pending-to-go-live`
  - Added to both User Management and Retailer Orders pages
  - **Files Changed**: `backend/routes/users.py`, `frontend/src/pages/admin/UserManagement.js`, `frontend/src/pages/admin/RetailerOrders.js`

- **Field Team Dashboard - Updated Labels**:
  - Changed labels from "Total", "Active", "Live", "Churned" to full names
  - "Total Retailers", "Active Retailers", "Live Retailers", "Churned Retailers"
  - **Files Changed**: `frontend/src/pages/field_team/Dashboard.js`

### August 10, 2026 - Retailer Summary Cards for Admin & Field Team ✅
- **User Management - Retailer Tab Summary Cards**:
  - Added 4 summary cards when Retailer tab is selected:
    - **Total Onboarded**: Total count of all retailers (31)
    - **Active**: Retailers with status="active" (26)
    - **Live**: Active retailers with at least 1 invoice (21)
    - **Churned**: Retailers with status="churned" (5)
  - New API endpoint: `GET /api/retailer-stats` returns all 4 counts
  - **Files Changed**: `backend/routes/users.py`, `frontend/src/pages/admin/UserManagement.js`

- **Field Team Dashboard - Retailer Breakdown**:
  - Replaced single "Retailers" card with 4 breakdown cards: Total, Active, Live, Churned
  - Financial cards (Immediately Payable, Overdue, Outstanding) now in separate row
  - Backend returns `live_retailers` count in portfolio summary
  - **Files Changed**: `backend/routes/field_team.py`, `frontend/src/pages/field_team/Dashboard.js`

### August 10, 2026 - OT Payment Display Fix + Summary Cards ✅
- **OT Payment Display Fix (P0)**:
  - **FIXED**: OT Payment column in Payroll Details modal was showing blank (only ₹ symbol)
  - **Root Cause**: Backend wasn't including `payment` field in `days_with_overtime` array
  - **Solution**: Modified `labour.py` line 946 to include `payment: ot_payment` in overtime day records
  - **Verification**: API now returns `{date, hours, payment}` for each overtime day (e.g., `{date: "2026-08-02", hours: 3.5, payment: 175.0}`)
  - **Files Changed**: `backend/routes/labour.py`

- **Paid Leave Payment Fix**:
  - Backend now properly includes paid leave days in payroll calculations
  - Records with `present: false` AND `paid_leave: true` get full daily rate
  - Added `paid_leave_days` tracking in summary and breakdown
  - Payroll detail endpoint shows paid leave days separately
  - **Files Changed**: `backend/routes/labour.py`

- **Summary Cards - Regular vs OT Split**:
  - Payroll Processing tab now shows 6 summary cards (was 4)
  - New cards: **Regular Salary** (total daily rates) and **OT Amount** (total overtime payment)
  - Man Days card now shows paid leave count: "189 (+2 PL)"
  - Helps quickly understand salary composition
  - **Files Changed**: `frontend/src/pages/admin/LaborCosts.js`

### August 9, 2026 - Salary Revision History + Monthly Salary + Sorting/Search ✅
- **P0 - Salary Revision History Tracking**:
  - Added `salary_history` array to labourers collection tracking rate changes with effective dates
  - When daily_rate or overtime_rate is updated, old entry is closed with `effective_to` and new entry created
  - Payroll calculations now use `get_rate_for_date()` to apply correct historical rates
  - Payroll Detail modal shows "Salary History" section with all revisions and effective dates
  - **NEW: Dedicated Salary Revision UI Flow**:
    - Edit modal shows read-only current rates with "Update Salary" and "View History" buttons
    - "Update Salary" modal allows setting new rates with specific effective date
    - "Salary History" modal shows complete revision timeline with effective dates
    - Clock icon in Actions column for quick access to salary history
    - API endpoint: `POST /api/labours/{id}/salary-revision` for creating revisions with effective dates
  - **Files Changed**: `backend/routes/labour.py`, `frontend/src/pages/admin/LaborCosts.js`
  
- **P1 - Monthly Salary Auto-Calculation**:
  - Added `monthly_salary` field to labourer form
  - When Monthly Salary entered, Daily Rate auto-calculates (Monthly ÷ 30)
  - OT Rate auto-calculates as Hourly Rate (Daily ÷ 9)
  - Helper text guides users: "Daily & Hourly rates auto-calculate (Monthly÷30, Daily÷9)"
  - **Files Changed**: `frontend/src/pages/admin/LaborCosts.js`
  
- **P2 - Sorting and Search**:
  - **Manage Labourers Tab**: Added search bar + sortable columns (Name, Monthly, Daily, OT/Hr, Joining Date)
  - **Payroll Processing Tab**: Added search bar + sortable columns (Name, Days, OT Hrs, Amount, Net Payable)
  - Click column header to toggle asc/desc sort, arrow indicator shows current sort
  - **Files Changed**: `frontend/src/pages/admin/LaborCosts.js`

### August 8, 2026 - Labour Cost Vertical Split in Dashboard ✅
- **NEW FEATURE**: Labour costs now correctly allocated to Retail vs QC verticals in Dashboard P&L
  - **Vertical Split Logic**: Labour costs split based on actual `retail_hours` and `qc_hours` from attendance records
  - **Dashboard Integration**: Each vertical sub-dashboard (QC/Retail) now shows its portion of labour costs in Variable Expenses
  - **Eye Button**: Added clickable eye icon on VAR. EXP blocks showing cost breakdown:
    - Labour Cost (from allocated hours)
    - Other Variable Expenses (Transportation, Maintenance, etc.)
    - Labour Cost Split summary (Retail vs QC vs Total)
  - **Backend Updated**: 
    - `dashboard_analytics.py` - Labour costs calculated per-vertical based on hours allocation
    - Response includes `labour_cost` in each vertical's data + `labour_breakdown` in expenses
  - **Frontend Updated**: 
    - `Dashboard.js` - Added eye button + Variable Expense Breakdown modal
  - **Default Behavior**: If no vertical split in attendance, all labour costs go to Retail

### August 8, 2026 - Vertical Allocation for Labour Hours ✅
- **NEW FEATURE**: Track labour hours split between Retail and Quick Commerce (QC) verticals
  - **Attendance Form Updated**: New columns for Retail Hrs, QC Hrs, Retail OT, QC OT
  - **Auto-calculation**: Total OT is auto-calculated from Retail OT + QC OT
  - **Payment Allocation**: Labour costs are now allocated to respective verticals
  - **Payroll Summary**: Shows vertical-wise breakdown (retail_hours, qc_hours, retail_payment, qc_payment)
  - **Default Behavior**: If no split provided, all hours default to Retail vertical
  - **Color Coding**: Blue for Retail, Purple for QC in both UI and reports
  - **Backend Updated**: 
    - `/api/labour-attendance` and `/api/labour-attendance/bulk` now accept vertical allocation fields
    - `/api/labour-costs/summary` returns vertical-wise totals
  - **Files Changed**: 
    - `backend/routes/labour.py` - Updated attendance endpoints + summary
    - `frontend/src/pages/staff/Attendance.js` - Added vertical allocation columns
    - `frontend/src/pages/admin/LaborCosts.js` - Added vertical allocation columns (Record Attendance tab) with summary cards showing Retail/QC split

### August 8, 2026 - Labour Payment Recording Feature ✅
- **NEW FEATURE**: Record and track payments made to labourers in Payroll Processing
  - **Payment Recording**: Click "+ Pay" button to record payment with amount, date, transaction ID, payment mode, and notes
  - **Payment History**: Click on paid amount to view all payments for that labourer with edit/delete options
  - **Net Payable Tracking**: Shows AMOUNT - PAID = NET PAYABLE in real-time
  - **Visual Indicators**: 
    - "PAID" badge on fully paid labourers
    - Green background for fully paid rows
    - Orange text for pending payments
  - **Backend**: New `/api/labour-payments` CRUD endpoints + updated summary to include payment tracking
  - **Files Changed**: 
    - `backend/routes/labour.py` - Added labour payment endpoints + updated summary
    - `frontend/src/pages/admin/LaborCosts.js` - Added payment modal, history modal, new columns

### August 8, 2026 - Detailed Payroll Breakdown Feature ✅
- **NEW FEATURE**: Added detailed payroll breakdown modal for each labourer
  - **Shows**: Days Present, Regular Hours + Amount, Overtime Hours + Amount, Final Payable
  - **Overtime Section**: Lists all OT days with dates, hours, and payment (calculated using labourer's OT rate from profile)
  - **Days Under 9 Hours**: Highlighted in yellow for attention
  - **Daily Records Table**: Full breakdown with Date, Hours, OT, Daily Rate, OT Rate, Payment
  - **Payment Calculation**: Shows formula (Regular Work + Overtime = Final Payable)
  - **BUG FIX**: OT payment was showing ₹0 because attendance records had `overtime_rate=0`. Fixed to use labourer's `overtime_rate` from profile (e.g., ₹50)
  - **Example - Vanita Chopade**: 30 days (₹14,000.1) + 14 OT hrs × ₹50 (₹700) = **₹14,700.1**
  - **Files Changed**: 
    - `backend/routes/labour.py` - New `/api/labour-costs/detail/{labour_id}` endpoint with correct OT calculation
    - `frontend/src/pages/admin/LaborCosts.js` - Added detail modal and View Details button

### August 8, 2026 - Inactive Labour Pending Dues Fix ✅
- **BUG FIX**: Inactive labourers' pending payment dues now show correctly in Payroll Processing
  - **Problem 1**: When a labourer was marked inactive, their pending dues showed as ₹0
  - **Problem 2**: Full Sync wasn't pulling inactive labourers, so 13 labourers were missing from Preview
  - **Root Cause**: 
    1. Attendance records stored with `total_payment=0` when daily rate wasn't set
    2. Full Sync endpoint `/api/labours` didn't include `include_inactive=true` parameter
  - **Solution**: 
    1. Updated `/api/labour-costs/summary` to use labourer's `default_daily_rate` when attendance has zero payment
    2. Fixed Full Sync to include `include_inactive=true` for labours endpoint (now syncs all 50 labourers)
    3. Added `is_active` flag to labour breakdown + red "INACTIVE" badge in frontend
  - **Result**: July payroll increased from ₹131,693 → ₹175,956 (includes all pending dues for inactive labourers)
  - **Remaining**: Lata & Nidhi still show ₹0 - their `default_daily_rate` is 0 in Production (need to be updated there)
  - **Files Changed**: 
    - `backend/routes/labour.py` - Default rate fallback logic
    - `backend/routes/backup_data.py` - Added `include_inactive=true` to labours sync
    - `frontend/src/pages/admin/LaborCosts.js` - INACTIVE badge styling

### August 8, 2026 - Full Sync Missing Collections Fix ✅
- **BUG FIX**: Production-to-Preview Full Sync now includes ALL database collections including historical data
  - **Problem 1**: User reported that Payroll (`labours`) and Attendance (`labour_attendance`) data was not syncing from Production to Preview
  - **Problem 2**: After initial fix, historical attendance records (for deactivated labourers like "Prajwal Dighe") were still missing because the API endpoint only shows active labourers
  - **Root Cause**: The `/api/labour-attendance?date=...` endpoint only returns records for **currently active** labourers, missing historical records
  - **Solution**:
    1. Changed `sync-from-production-full` to use **Excel backup** for `labour_attendance` instead of day-by-day API calls
    2. Excel backup directly exports database collection with ALL historical records
    3. This ensures records from deactivated labourers (like Prajwal Dighe: 6 days, ₹2,400) are properly synced
  - **Result**: July 2026 Labor Costs now shows exactly ₹1,31,693.24 / 564 Man Days / 290.0 OT Hours - matching Production perfectly
  - **Files Changed**: 
    - `backend/routes/backup_data.py` - Updated `sync-from-production-full` to use Excel backup for attendance

### August 5, 2026 - Credit Note Display on Rejections Table ✅
- **FEATURE**: Show credit note info against each rejection in both Retailer and Field Team portals
  - **Backend**: Created shared helper `attach_credit_notes_to_rejections()` in `retailer_portal.py`
    - Bulk fetches credit notes for rejection IDs and attaches: `credit_note_id`, `credit_note_number`, `credit_note_amount`, `credit_note_status`
    - Fetches `adjusted_against_invoices` array and joins invoice numbers for display as `adjusted_invoice_numbers`
    - Used by `/api/retailer-rejections`, `/api/field-team/retailer/{id}-rejections`, and `/api/retailer-rejections/daily-summary`
  - **Frontend** (`Dashboard.js` rejections tables):
    - Added "CREDIT NOTE" column to BOTH "By Invoice Date" and "By Recorded Date" views
    - Date summary row shows count of credit notes and how many are adjusted
    - Expanded row shows credit note number, amount, and status badge (green "Adjusted" / blue "Partial" / yellow "Pending")
    - For adjusted/partial credit notes, shows "→ INV-XXX, INV-YYY" to indicate which invoice(s) it was adjusted against
    - Footer shows total count of credit notes and adjusted count
  - **Credit Note Deletion**: Already implemented - when rejection is deleted:
    - If CN has been used (adjusted_amount > 0), it's voided instead of deleted
    - If CN hasn't been used, it's fully deleted along with the rejection

### August 5, 2026 - Cart Auto-Save (Draft) Feature ✅
- **FEATURE**: Cart draft persistence for order/indent flow
  - Cart state now persists across page reloads and browser sessions
  - **localStorage key**: `orderDraft:${retailerId || 'self'}` - scoped per retailer
  - **On mount/retailer change**: Loads saved draft back into cart state
  - **On cart change**: Auto-saves with 500ms debounce to avoid excessive writes
  - **On successful submit**: Clears the draft from localStorage
  - **Field Team support**: Each retailer gets their own draft key when switching
  - **User feedback**: Toast notification "Cart draft restored from previous session" when draft is loaded
  - No backend changes needed - all localStorage based

### August 5, 2026 - Field Team Payment Block Fixes ✅
- **FIX 1: Total Payable shows gross pending in fieldTeamMode**
  - In `Dashboard.js` for `fieldTeamMode=true`:
    - Header figure (line 3724) now shows `total_pending` (gross) instead of `immediately_payable` (net after credit)
    - Total Payable card shows `total_pending` with label "From Pending Invoices"
    - Credit Notes card label changed to "Pending Credit Notes"
    - Suppressed "After ₹X credit" sub-labels to keep credit shown separately
  - Retailer's own portal unchanged (still shows net figures)

- **FIX 2: Summary popup now works for Field Team**
  - Extracted shared `compute_retailer_payment_summary(retailer_id, start_date, end_date)` in `retailer_portal.py`
  - `get_retailer_payment_summary` now calls shared function (thin wrapper)
  - Field Team's `/api/field-team/retailer/{id}/payment-summary` now returns correct shape:
    - `{total_invoices, totals: {...}, invoices: [...]}` instead of `{summary: {...}}`
  - Summary modal now displays same data as Admin/Retailer view with full invoice breakdown

### August 5, 2026 - Field Team Payment Details Fix ✅
- **REFACTOR**: Deduplicated Field Team payment-details endpoint
  - **Problem**: `GET /api/field-team/retailer/{id}/payment-details` was a hand-rolled duplicate of the retailer payment-details endpoint that had drifted (missing per-date invoices, credit notes, item enrichment, etc.)
  - **Solution**: 
    - Extracted body of `get_retailer_payment_details` in `retailer_portal.py` into shared `compute_retailer_payment_details(retailer_id, start_date, end_date)` function
    - Made `get_retailer_payment_details` a thin wrapper calling the shared function
    - Updated `field_team.py` to import and use `compute_retailer_payment_details` (reduced from 140+ lines to ~30 lines)
  - **Result**: Field Team payment view now matches Admin/Retailer view exactly with:
    - Per-date entries with `upfront_50_total`, `final_payment_total`, `total_pending`, `invoices`, `is_all_clear`
    - Totals with `grand_total`, `net_payable`, `total_pending_credit`, `immediately_payable`
    - Credit notes included in response
    - Both 100%-upfront and 50%-upfront models handled correctly

### August 5, 2026 - Fixed Expenses Module Enhancements ✅
- **FEATURE: Date Range Filter**
  - Added toggle between "By Month" (default) and "Date Range" filter modes
  - New `from_date` and `to_date` query params added to `GET /api/expenses/fixed`
  - Frontend shows date inputs with Apply button when in Date Range mode
  
- **FEATURE: View Details Dialog**
  - Added eye icon button on each expense row
  - Read-only modal displays all expense info: category, description, amount, date, status
  - Shows **Vendor Details** section (vendor, invoice_number) when available
  - Shows **Payment Details** section (payment_mode, payment_date, payment_reference, paid_by) for Paid expenses
  - Edit button in dialog for quick access to editing
  
- **FEATURE: Corporate Expenses Management**
  - New "Corporate Expenses" button opens management dialog
  - **Corporate Employees tab**: CRUD for `corporate_employees` collection (name, role, department, notes)
  - **Recurring Templates tab**: CRUD for `recurring_expense_templates` collection
    - Fields: category, description, amount, due_date, vendor, invoice_number, expense_type, linked_employee
    - Templates auto-generate expenses when "Generate Recurring" is clicked
  - Backend endpoints: `/api/corporate-employees`, `/api/recurring-expense-templates`
  
- **FEATURE: Extended Generate Recurring**
  - `POST /api/expenses/fixed/generate-recurring` now uses both:
    1. Active `recurring_expense_templates`
    2. Previous month's recurring entries
  - Fixed January edge case (prev_month calculation for month=1)
  - Returns stats: `from_templates`, `from_prev_month` counts
  
- **FEATURE: Vendor/Invoice Fields in Add Dialog**
  - Added "Vendor Details (Optional)" section with vendor and invoice_number inputs
  - These fields persist with expenses and show in View Details

- **BUG FIX**: Fixed Radix SelectItem crash with empty-string value
  - Changed `<SelectItem value="">None</SelectItem>` to use `__none__` sentinel value
  - Mapped sentinel to empty string in state setter

### August 5, 2026 - Expenses Payment Modal Focus Trap Bug Fix ✅
- **BUG FIX**: Fixed Payment Details modal being unclickable in Fixed/Variable Expenses
  - **Problem**: When adding an expense with "Paid" status, the "Record Payment Details" modal rendered inside the still-open "Add Dialog" which had a focus-trap that blocked clicks on the payment modal buttons
  - **Root Cause**: The Add Dialog (Shadcn Radix Dialog) was not closed before opening the Payment Details modal, causing the focus-trap to remain active
  - **Solution in FixedExpenses.js**:
    - Modified `handleSubmit()` to call `setShowAddDialog(false)` BEFORE `setShowPaymentDetailsModal(true)`
    - Updated Cancel button in Payment Details modal to re-open Add Dialog (`setShowAddDialog(true)`) so user can continue editing
    - Added `data-testid` attributes: `payment-details-modal`, `confirm-payment-btn`, `payment-cancel-btn`
  - **Solution in VariableExpenses.js**:
    - Same fix applied to `handleSubmit()` - close Add Dialog before opening Payment modal
    - Fixed `payment_date` initialization from `new Date().toISOString()` to `''` (empty string)
    - This allows the Payment Details modal trigger condition (`payment_status === 'paid' && !payment_date`) to be reached in the Add flow
    - Added `data-testid` attributes: `variable-payment-details-modal`, `variable-confirm-payment-btn`, `variable-payment-cancel-btn`
  - **Verification**: Radix dialog count goes to 0 when Payment modal opens, Confirm Payment button is clickable without force

- **ENHANCEMENT**: Fixed Expenses now defaults to latest month with data
  - Previously defaulted to current calendar month which could show empty results
  - Added `useEffect` hook to fetch all expenses and determine the latest month/year with data
  - Falls back to current month if no expense data exists
  - `filterMonth` state initialized as `null` until determined to prevent premature API calls


### August 3, 2026 - Field Team Record Rejection Flow Fix ✅
- **BUG FIX**: Fixed Field Team Dashboard showing "No retailers assigned to you"
  - **Root Cause**: Backend was querying retailers with `assigned_to: field_team_id` (Staff model)
  - **Actual Data Model**: Field Team users have `assigned_to` as an ARRAY of retailer IDs they manage
  - Backend fixes in `/app/backend/routes/field_team.py`:
    - Added `get_field_team_assigned_retailer_ids()` helper function
    - Added `verify_retailer_assigned_to_field_team()` helper function
    - Updated `GET /api/field-team/assigned-retailers` - now queries FT user's assigned_to array
    - Updated `GET /api/field-team/portfolio-summary` - same fix
    - Updated all retailer authorization checks to use new helpers
  - Model fix in `/app/backend/models.py`:
    - Changed `UserResponse.assigned_to` from `Optional[str]` to `Optional[Union[str, List[str]]]`
    - Allows both string (Staff) and array (Field Team) data types

- **VERIFIED**: Field Team Record Rejection flow now works identically to Admin panel:
  - Step 1: Select Retailer (ONLY assigned retailers shown)
  - Step 2: Select Product (products dispatched to selected retailer)
  - Step 3: Select Dates with **Reason dropdown** and **Remarks text input** columns
  - Add to Draft functionality working
  - Submit All functionality working
  - Drafts panel displays: Product, Variant, # Entries, Total Qty, Actions (edit/delete)

### August 2, 2026 - Mobile Horizontal Scroll Fix for Retailer Portal Header Buttons ✅
- **BUG FIX**: Staff/Admin on mobile can now horizontally scroll header buttons in Retailer Orders
  - Problem: Buttons like "Auto Indent", "New Indent", "Select Retailer", "Record Rejection" were cut off on mobile
  - Solution: Added `overflow-x-auto` and `flex-shrink-0` to button containers
  - **Rejections tab toggle fix**: "By Invoice Date" / "By Recorded Date" toggle is now visible on mobile
    - Changed from `flex-row items-center justify-between` to `flex-col md:flex-row` layout
    - Toggle now stacks properly on mobile and is scrollable

### August 2, 2026 - Admin-Only Buttons Hidden for Non-Admin Users ✅
- **FEATURE**: Sensitive admin buttons are now hidden from staff users
  - Wrapped with `getCurrentUserRole() === 'admin'` checks
  - **Rejection tab**: "Sync to Invoices" - hidden for staff
  - **Invoice tab**: "Payment Audit", "Fix Rejection Data" - hidden for staff (Fix Statuses already was)
  - **Credit Notes tab**: ALL maintenance buttons hidden for staff:
    - Fix Product Details, Backfill Missing CNs, Reconcile 100% Upfront CNs
    - Cleanup Bogus CNs, Set Model Switch Dates, Fix Orphaned CNs
    - Diagnose Sync, Fix Sync Issues
  - Staff users can still: Export, Record Rejection, Refresh, Create Invoice, etc.

### August 2, 2026 - Retailer P&L Variable Expense Date Filtering Fix ✅
- **BUG FIX**: Variable expenses now properly exclude retailers who weren't active on the expense date
  - Problem: Retailers were being allocated expense shares for dates before they started working
  - **Issue 1**: Variable Expense Breakdown popup was including pre-start-date expenses
    - Fixed in `/app/backend/routes/expenses_new.py` - all split types now check active date
  - **Issue 2**: P&L Summary card showed different (higher) VE than the breakdown popup
    - Root cause: P&L calculation in `/app/backend/routes/dashboard_analytics.py` wasn't filtering by active date
    - Fixed: **Selected** split now filters to only active-selected retailers
    - Fixed: **Proportional** split now tracks each expense's active retailers and calculates share based on sales among only those active retailers
  - Updated `get_active_retailers_on_date()` to check first_dispatch_date
  - Both P&L summary AND Variable Expense Breakdown popup now show matching numbers

### August 2, 2026 - Variable Expense Vendor Management ✅
- **FEATURE**: Added vendor management system and copy expense functionality
  - Backend endpoints in `/app/backend/routes/expenses_new.py`:
    - `GET /api/vendors` - List all vendors
    - `POST /api/vendors` - Create new vendor
    - `PUT /api/vendors/{vendor_id}` - Update vendor
    - `DELETE /api/vendors/{vendor_id}` - Delete/deactivate vendor
    - `POST /api/vendors/migrate-from-expenses` - One-time migration to create vendors from existing expense `paid_to` values
  - New `vendors` collection with fields: `id`, `name`, `contact`, `phone`, `notes`, `is_active`, `created_at`, `created_by`
  - Frontend changes in `/app/frontend/src/pages/admin/VariableExpenses.js`:
    - **Manage Vendors button** in header opens vendor management dialog
    - **Vendor Management dialog**: Table view of all vendors with Add/Edit/Delete actions
    - **"Paid To (Vendor)"** field changed from free text to **dropdown** selecting from vendor list
    - **"Add New"** quick button next to vendor dropdown to add new vendor inline
    - **Copy button** (purple icon) in ACTIONS column to duplicate an expense line item
      - Copies all fields except receipt_no and payment_reference
      - Sets date to today and payment_status to pending
    - **Import from Expenses** button to migrate existing vendor names (ran once, created 60 vendors)

### August 2, 2026 - Dozen Unit Tracking on Wastage Dashboard ✅
- **FEATURE**: Track products purchased in "Dozen" in their native unit without converting to Kg
  - Backend changes in `/app/backend/routes/dashboard_analytics.py`:
    - Modified `derive_fresh_wastage_for_date()` to exclude "Dozen" from Kg conversion
    - Dozen items now tracked in native unit, not converted to 1200 grams
    - Added `unit` field ("Kg" or "Dozen") to product wastage records
    - Added `total_wastage_dozen` and `total_dozen_value` to daily totals
    - Updated `fix-all-purchase-quantities` endpoint to handle Dozen separately
  - API Response changes (`/api/stock-status/wastage-by-date`):
    - Each product now includes `unit` field
    - Kg and Dozen totals are tracked separately
    - `total_wastage_kg` excludes Dozen items
    - New fields: `total_wastage_dozen`, `all_wastage_dozen`
  - Frontend changes in `/app/frontend/src/pages/admin/WastageDashboard.js`:
    - Added "Unit" column to wastage table
    - Dozen rows highlighted with amber background
    - Unit badge shows "Kg" (gray) or "Dozen" (amber)
    - Table footer shows Kg total + Dozen total when applicable
    - Print function updated with Unit column and separated totals
  - Summary tiles remain Kg-only (Dozen shown only in table rows)
  - Monetary calculations unchanged (value = quantity × rate per dozen)

### August 1, 2026 - Field Team Dashboard ✅
- **FEATURE**: Built complete Field Team Dashboard for portfolio management
  - Backend endpoints in `/app/backend/routes/field_team.py`:
    - `GET /api/field-team/assigned-retailers` - Lists retailers assigned to current field team member
    - `GET /api/field-team/portfolio-summary` - Aggregated metrics across all assigned retailers
    - `GET /api/field-team/retailer/{retailer_id}/dashboard` - Full dashboard for specific retailer
    - `GET /api/field-team/retailer/{retailer_id}/payment-details` - Payment details for retailer
    - `POST /api/field-team/retailer/{retailer_id}/indent` - Create indent on behalf of retailer
    - Proxy endpoints for retailer data access (dispatches, rejections, invoices, indents, payments, grn, immediately-payable)
  
  - Frontend at `/app/frontend/src/pages/field_team/Dashboard.js`:
    - **Portfolio Home (Cumulative View)**:
      - Summary cards: Retailers count, Immediately Payable, Overdue, Total Outstanding
      - **Avg Net Sales (15D)** and **Rejection % (15D)** cards with **View links**
      - Portfolio Earnings card with total earnings, avg per day, and date range picker
      - **4 Cumulative Charts**: Monthly Order Value, Monthly Rejection MRP, Monthly Earnings, Avg Earning/Day
      - View mode toggle: Daily/Weekly/Monthly
      - Mini-cards for each assigned retailer with expandable details
      - **Record Rejection button** at top
    - **View Modals (Retailer-wise Breakdown)**:
      - Avg Net Sales modal: Shows per-retailer breakdown with View Dashboard button
      - Rejection % modal: Shows per-retailer breakdown sorted by rejection %, View Dashboard button
    - **Record Rejection Wizard (3 steps)**:
      - Step 1: Select Retailer (ONLY assigned retailers shown)
      - Step 2: Select Product (from retailer's dispatches with variants)
      - Step 3: Select Dates and Quantities
      - Draft support: Add multiple products before submitting
      - Back navigation between steps
    - **Individual Retailer View**:
      - Renders the full Retailer Portal Dashboard (exact same as retailer sees)
      - Back arrow button to return to portfolio
      - All retailer features: Create Order, My Orders, Payment Ledger, etc.
  
  - Test credentials:
    - Gaurav: adb@gmail.com / fieldteam123 (2 assigned retailers: Tamanna Mart, S Mart)

## Changelog (July 2026)

### July 29, 2026 - 50% Upfront Immediately-Payable Headline ✅
- **FEATURE**: Wired up "immediately payable" calculation for 50% upfront retailers
  - Backend: Added `@router.get("/retailer-immediately-payable")` endpoint
  - Backend: Added `totals.immediately_payable` to `/api/retailer-payment-details` response
    - Days 0-4: only upfront portion is immediately due
    - Days 5+: full pending amount is immediately due
    - Credit notes subtracted from immediately_payable
  - Retailer Portal: Headline now shows `immediately_payable` instead of `grand_total`
    - "Total Outstanding" shown as secondary figure when different
  - Admin Panel: Headline now shows `upfront_50_total + overdue` for 50% upfront retailers
    - "Total Outstanding" shown as secondary figure
  - 100% upfront retailers unchanged (all pending is immediately due)
  
- **BUG FIX**: Added automatic password seeding on server startup
  - Ensures all users have password hashes when preview syncs from production
  - Prevents recurring login failures in preview environment
  - Function: `ensure_user_passwords_on_startup()` in `server.py`

### July 28, 2026 - Part W-21: Extended 21-Day Window for Metrics ✅
- **Changed**: Avg Net Sales (15d) and Rejection % (15d) now use a 21-day window
  - Fetches 21 distinct delivered days (top21)
  - Uses only the **15 OLDEST** of those 21 (oldest15 = top21.slice(6, 21))
  - The 6 most recent days are dropped because rejection data is still trickling in
  
- **Retailer Portal** (`/app/frontend/src/pages/retailer/Dashboard.js`):
  - Updated `netSalesAndRejection15d` useMemo
  - Card subtitles: "avg over 15 oldest of last 21 delivered days"
  - Modal title: "Avg Net Sales — 15 Oldest of Last 21 Delivered Days"
  - Rejection modal: Explains "The 6 most recent delivered days are excluded because rejection reporting for them is still incoming."
  
- **Admin Panel** (`/app/frontend/src/pages/admin/RetailerOrders.js`):
  - Updated `adminNetSalesAndRejection15d` useMemo with same 21-day window logic
  - Preserves W4-revised per-day-per-retailer averaging for "All Retailers" mode
  - Card/modal text updated to match retailer portal pattern

### July 28, 2026 - Retailer Name Data Quality Fix ✅
- **STEP 1 - Migration**: Fixed 5,030 documents across 6 collections
  - `retailer_dispatches`: 310 docs
  - `retailer_invoices`: 290 docs
  - `retailer_rejections`: 3,011 docs
  - `retailer_indents`: 722 docs (including 6 additional retailers discovered)
  - `retailer_closing_inventory`: 481 docs (including blank/null names)
  - `retailer_grn`: 16 docs
  
- **Key Fixes Applied**:
  - f77940fb... "Lucky" → "Jai Bhawani Traders Mundhwa"
  - a400f104... "Ghisendra Choudhary" → "Tamanna Mart"
  - d36a4f17... "G D Enterprises", "Sonaji Kharat" → "Savtamali"
  - c15885f6... "Kartik Narang" → "Narang Super Mart (Brahmacorp)"
  - 17b601bc... "Rohan" → "Park Way Mart"
  - Plus 6 additional retailers fixed in retailer_indents

- **STEP 2 - Prevention**: Audited and fixed all backend write paths
  - Changed 8 locations from `retailer.get("name")` to `retailer.get("company_name") or retailer.get("name")`
  - Files modified: `retailer_portal.py`, `retailer_indents.py`
  - Now all write paths consistently use `company_name` (shop name) first

- **Verification**: 
  - Final scan confirms ZERO retailers have multiple names in any collection
  - Test: Creating indent for Tamanna Mart correctly uses "Tamanna Mart" (not "Ghisendra Choudhary")

### July 23, 2026 - Part Y5: Auto Indent Rejection Fix for 100% Upfront Retailers ✅
- **Root Cause**: `sync_invoice_rejection_amount` skips 100% upfront retailers (rejections flow via Credit Notes), leaving `billable_qty=None` and `rejected_qty=0` on invoices. The Y3 fallback used raw quantity, inflating auto-indent for 17 of 18 retailers.
- **Fix**: Added rejection_map lookup from `retailer_rejections` collection
  - Pre-loads rejections within 28-day window keyed by `(retailer_id, product_id, variant_id/name, date)`
  - When `billable_qty` is None, subtracts rejection quantity from raw quantity
  - Applied to both bulk (`generate_auto_indents_for_tomorrow`) and single (`generate_single_auto_indent`) endpoints
- **Impact**: 1,246 rejections in last 28 days now properly subtracted for 100% upfront retailers
- **Files Modified**: `/app/backend/routes/retailer_portal.py`

### July 23, 2026 - Part BB: COGS Multiplier Colors + Auto Indent Defaults ✅
- **BB1**: COGS tab SP/CP Multiplier column is now color-coded
  - Green (`text-green-600`) when multiplier ≥ 2.5
  - Red (`text-red-600`) when multiplier < 2.5
  - Grey "—" when null (unchanged)

- **BB2**: Auto Indent "Increase Qty by (%)" default changed from 30 to 0
  - Initial state: `useState(0)` instead of `useState(30)`
  - Reset after successful creation: `setAutoIndentBufferPct(0)`
  - User must opt-in to any buffer increase

- **BB3**: Added "Generate for all retailers" button in Auto Indent modal
  - Purple button at top of modal with Zap icon
  - Loops through all active retailers, calling `/api/admin/generate-auto-indent` for each
  - Uses selected Indent Date, Order Basis, and "Increase Qty by (%)"
  - Shows toast: "{created} created, {skipped} skipped, {failed} failed"
  - Retailers with existing indents for that date are skipped (no duplicates)

### July 23, 2026 - Part AA-revised: COGS Tab Invoice-Based Retail + SP Averaging ✅
- **AA-backend**: Added `retail_invoice_date` field to COGS snapshot API (`/app/backend/routes/cogs_snapshot.py`)
  - Reads from `retailer_invoices` collection keyed by `invoice_date` (not dispatch_date)
  - Uses same weighted-average per-kg pattern as dispatches
  - Preserves existing `retail_sp_date` (dispatch-based) for backward compatibility
  - 46 products now have `retail_invoice_date` on sample date
  
- **AA3-revised**: Updated Retail tab filter to use `retail_invoice_date` (invoice-based instead of dispatch-based)
  - QC tab: `qc_sp_date === snapshotDate` (unchanged, GRN-based)
  - Retail tab: `retail_invoice_date === snapshotDate` (NEW invoice-based)
  - All tab: QC-sold OR Retail-sold on that date

- **AA4-revised**: Updated All tab to average QC SP and Retail SP
  - Both present: `display_sp = (qc_sp + retail_sp) / 2`
  - Only one present: use that one
  - Neither: shows "—"
  - SP/CP multiplier calculated from averaged SP

- **AA6 clarification**: Multiplier rules
  - QC tab: `qc_sp_per_kg / pp_per_kg`
  - Retail tab: `retail_sp_per_kg / pp_per_kg`
  - All tab: `averaged_sp / pp_per_kg` (2 decimals, "—" when denominator is 0/null)

### July 23, 2026 - Part AA: COGS Tab Enhancement ✅
- **FEATURE**: Enhanced COGS tab with switchable sub-tabs, SP/CP multiplier, and Excel export
  - **New State** (`cogsSubTab`): Controls All/QC/Retail view filter
  - **Sub-tabs**: All (shows items sold to QC or Retail), QC (only QC sales), Retail (only Retail sales)
  - **Sales Price logic**: QC tab shows QC SP, Retail tab shows Retail SP, All tab prefers Retail SP (falls back to QC SP)
  - **SP/CP Multiplier column**: `Math.round((display_sp / pp_per_kg) * 100) / 100` — shows "—" when PP is 0 or missing
  - **Export Excel**: Downloads 3-sheet workbook (All/QC/Retail) with columns: S No, Item Name, Purchase Price, Sales Price, Unit, SP/CP Multiplier, Last Updated
  - **Sortable headers**: All columns clickable for ascending/descending sort
  - **S No column**: Added serial number column
  - **"Sold Items" filter**: Only shows products with `qc_sp_date` or `retail_sp_date` matching the selected date
  - **Files Modified**: `/app/frontend/src/pages/admin/Dashboard.js`

### July 23, 2026 - Part Z: Fix Retailer ID Collisions + Auto-Indent Guards ✅
- **Z1: One-Time Data Migration** (`/app/backend/routes/admin.py`):
  - New endpoint: `POST /api/admin/fix-retailer-id-collisions`
  - Scans `retailer_dispatches` and `retailer_invoices` for retailer_id collisions (multiple names sharing same ID)
  - Supports `dry_run` (default true) to preview remaps before execution
  - For each collision: keeps the name with most records on existing ID, generates new UUID for others
  - Updates across all collections: dispatches, invoices, rejections, indents, payments, credit_notes, closing_inventory, etc.
  - Creates user master record if not exists for each new retailer
  - **Found 5 collisions** affecting 6 retailer names (Savtamali, G D Enterprises, Park Way Mart, Tamanna Mart, Jai Bhawani Traders Mundhwa, Narang Super Mart)
  - Safe to run multiple times (idempotent)

- **Z2: Prevent Recurrence** (`/app/backend/routes/users.py`):
  - When `company_name` is updated for a retailer, the change now propagates to all historical records
  - Updated collections: dispatches, invoices, rejections, indents, payments, credit_notes, daily_requirements, daily_sales, grn
  - Ensures renaming never creates a "fork" where old records have old name and new records have new name
  - Logged with INFO level: "Retailer rename: {old} -> {new}. Propagating to historical records..."

- **Z3: Outlier & Minimum-Sample Guard** (`/app/backend/routes/retailer_portal.py`):
  - Both `generate_auto_indents_for_tomorrow()` and `generate_single_auto_indent()` now use robust averaging:
    - **Single sample (1 data point)**: No buffer applied, flagged as `low_confidence`
    - **Outlier detection**: Values >3x median are capped to 3x median (only when 3+ samples)
  - Response includes `low_confidence_warning` with list of products that had only 1 data point
  - Response includes `outliers_capped` with details of any capped values
  - **Verified**: Indent creation returns warnings like "19 products have only 1 data point (no buffer applied)"

### July 23, 2026 - Part Y4: Configurable Safety Buffer for Auto Indent ✅
- **FEATURE**: Made the sales-based auto-indent safety buffer user-configurable via UI
  - **Backend Changes** (`/app/backend/routes/retailer_portal.py`):
    - `generate_auto_indents_for_tomorrow()`: Now accepts `buffer_pct` parameter (default 30%)
    - `generate_single_auto_indent()`: Accepts `buffer_pct` from request payload, converts to multiplier
    - Replaced hardcoded `1.30` multiplier with dynamic `buffer_multiplier = 1 + (buffer_pct / 100)`
  - **Frontend Changes** (`/app/frontend/src/pages/admin/RetailerOrders.js`):
    - Added `autoIndentBufferPct` state (default: 30)
    - Added "Increase Qty by (%)" number input field in Auto Indent modal (visible only when `autoIndentBasis === 'sales'`)
    - Input is bounded 0-100% with step of 5
    - Updated radio button description: "4 weekday avg + {buffer}%"
    - Updated detailed description: "last 4 identical weekdays + {buffer}% buffer"
    - Payload now includes `buffer_pct: autoIndentBufferPct`
    - State resets to 30% after successful indent creation
  - **Verified**: Backend correctly applies different buffer values (45% → total_qty:241, 10% → total_qty:226)

### July 14, 2026 - Part H3, H4, I Implementation ✅
- **Part H3: P&L Allocation Refactor** - Variable Expense three-way split allocation
  - **New split_type handling**: 'all_equal' (equal among all active retailers), 'selected' (equal among selected retailers), 'proportional' (legacy - based on sales share)
  - Added `direct_ve_by_retailer` dictionary to track direct VE allocations
  - Added `legacy_retail_pool` for proportional VEs
  - Customer P&L now uses: `direct_ve + (legacy_retail_pool * customer_share)`
  - Helper functions extracted to `/app/backend/utils/retailers.py`:
    - `get_active_retailers_on_date()` - filters churned retailers based on expense date
    - `alloc_residual_to_first()` - handles rounding residuals
  - **Files Modified**: `/app/backend/routes/dashboard_analytics.py` (lines 1885-1973, 2609-2630)

- **Part H4: VE Detail View Button** - New endpoint and modal for VE breakdown
  - **New Endpoint**: `GET /api/expenses/variable/by-retailer/{retailer_id}`
    - Returns expense breakdown with split_type, retailers_included, retailer_share
    - Filters by from_date and to_date query parameters
  - **Frontend Modal**: Added "View" button (eye icon) on VAR EXP tile in Customer P&L modal
    - Shows table with: Date, Category, Split Type (badge), # Retailers, Original Amount, Your Share
    - Split Type badges: Blue="All Equal", Purple="Selected", Green="Proportional"
    - Proportional expenses show "% of sales" instead of share amount
  - **Files Modified**: `/app/backend/routes/expenses_new.py` (lines 371-458), `/app/frontend/src/pages/admin/Dashboard.js`

- **Part I: Cross-cutting Integration** - Active retailers filter for dropdowns
  - Added `activeRetailers` computed value using `useMemo` to filter churned retailers
  - Filter: `retailers.filter(r => (r.status || 'active') !== 'churned')`
  - Updated 5 dropdown selectors to use `activeRetailers.map`:
    1. Daily Requirement retailer dropdown
    2. Invoice Create retailer dropdown
    3. Rejection Form retailer dropdown
    4. Auto-Indent retailer dropdown
    5. Closing Inventory retailer dropdown
  - **Note**: Filter dropdowns for viewing historical data remain unchanged (show all retailers)
  - **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js` (lines 8185-8192, and dropdown locations)

- **Testing**: All 8 backend tests passed (iteration_43). E2E verified via Playwright.

### July 14, 2026 - Admin Rejection 3-Level Drilldown ✅
- **ENHANCEMENT**: Extended admin Rejection Details modal with retailer-wise middle level
  - **New Flow** (when All Retailers selected):
    - L1: Product list → L2: Retailer breakdown → L3: Date-wise
  - **Original Flow** (when specific retailer selected):
    - L1: Product list → L2: Date-wise (unchanged)
  - **New State**: `adminRejectionDrilldownRetailer` (holds `{retailer_id, retailer_name}` for L3)
  - **New useMemo**: `adminRejectionDrilldownRetailers` - aggregates rejection qty/value per retailer for selected product
  - **Updated useMemo**: `adminRejectionDrilldownDates` - now filters by `adminRejectionDrilldownRetailer` when set
  - **Back Button Logic**:
    - L3 → L2-retailer: clears `adminRejectionDrilldownRetailer`
    - L2 → L1: clears `adminRejectionDrilldownProduct`
  - **Header Breadcrumb**:
    - L1: "Rejection Details"
    - L2: "Rejection Details — {product_name}"
    - L3: "Rejection Details — {product_name} › {retailer_name}"
  - **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js`

### July 14, 2026 - Rejection Drilldown Refinement ✅
- **ENHANCEMENT**: Added "Rejection Value" column to rejection drilldown modals
  - **Retailer Portal** (`Dashboard.js`):
    - Extended `rejectionDetailsData` useMemo to track `rejection_value` per product
    - Extended `rejectionDrilldownDates` useMemo to track `rejection_value` per date
    - Added "Rejection Value" column to L1 (product list) and L2 (date-wise) tables
    - Shows formatted currency values (₹80.00, ₹240.00, etc.)
  - **Admin Portal** (`RetailerOrders.js`):
    - Added new state: `showAdminRejectionDetailsModal`, `adminRejectionDrilldownProduct`
    - Added new useMemos: `adminRejectionDetailsData`, `adminRejectionDrilldownDates`
    - Chart "View Details" button now opens NEW modal (mirrors retailer portal)
    - Rejection Loss block "View Details" stays pointed at existing Analytics modal
    - New modal scoped by `selectedRetailer` (empty = All Retailers)
    - Both L1 and L2 tables have "Rejection Value" column

### July 14, 2026 - Rejection Drilldown Feature ✅
- **FEATURE**: Added "View Details" drilldown to Rejection blocks on both Retailer and Admin portals
  - **Formula**: Rejection % = (rejection_count / supplied_qty) × 100 (COUNT-based, not value-based)
  - **Retailer Portal** (`/app/frontend/src/pages/retailer/Dashboard.js`):
    - New state: `showRejectionDetailsModal`, `rejectionDrilldownProduct`
    - New useMemo: `rejectionDetailsData` (L1 product list), `rejectionDrilldownDates` (L2 date-wise)
    - Added "View Details" button to Rejection MRP chart header
    - Added modal with L1 (product list sorted by Rejection % DESC) and L2 (date-wise breakdown)
    - Click product row → see date-wise rejection breakdown for that product
  - **Admin Portal** (`/app/frontend/src/pages/admin/RetailerOrders.js`):
    - Made product rows clickable in "By Product (Count %)" section of Rejection Analytics modal
    - Added `cursor-pointer hover:bg-red-50` to rows + onClick that opens existing drilldown
    - Added "View Details" button to Weekly Rejections chart in earnings section
  - **Verified**: Both portals show L1 product list with correct Rejection %, clicking opens L2 date-wise breakdown

### July 14, 2026 - Rejection % Metric ✅
- **FEATURE**: Added Rejection % display to admin Rejection block
  - Extended `rejectionAnalyticsState` with `grossMrpValue`
  - Raised `loadDispatchesForRejection` limit from 1000 → 50000
  - Added "(23.1% Rejection)" to Rejection Loss block stats row
  - Added "23.1% of Gross MRP" to Total Rejections summary card
  - Formula: `(Total Rejection MRP / Gross MRP) × 100`
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

### July 13, 2026 - Indents & Dispatches Tab Filters ✅
- **FEATURE**: Added From/To date pickers, searchable retailer dropdown, Apply and Clear buttons to Indents and Dispatches tabs
  - Mirrors the pattern already on Invoice / Credit Note tabs
  - **Backend Changes**:
    - `GET /api/retailer-indents`: limit raised from 200 → 50000
    - `GET /api/retailer-dispatches`: limit raised from 200 → 50000
  - **Frontend Changes**:
    - New state variables: `indentDateFrom`, `indentDateTo`, `indentRetailerFilter`, `indentRetailerSearch`, `showIndentRetailerDropdown` (same for dispatch*)
    - `loadIndents()` and `loadDispatches()` now use server-side filtering with `start_date`, `end_date`, `retailer_id`, and `limit=50000`
    - Simplified `filteredIndents` and `filteredDispatches` useEffects (server handles filtering)
    - Tab click handler now reloads Indents/Dispatches on switch
    - Replaced old single-date filter UI with full filter row
  - **Legacy Fix**: Renamed `from_date/to_date` → `start_date/end_date` in 3 API calls (lines 4006, 4518, 5138)
  - **Files Modified**:
    - `/app/backend/routes/retailer_portal.py` (lines 253, 521)
    - `/app/frontend/src/pages/admin/RetailerOrders.js` (multiple sections)
  - **Verified**: Both tabs show count and load data correctly with filters

### July 13, 2026 - Global Dispatch MRP Fallback ✅
- **FEATURE**: Added global dispatch MRP fallback for new retailers with no dispatch history
  - Only runs for `role == "retailer"` (admin/staff already query global dispatches)
  - Queries ALL retailer dispatches sorted by date DESC, limit 2000
  - Only inserts when composite key is missing or has MRP ≤ 0 (preserves per-retailer priority)
  - Includes dual-key insertion for Piece/Packet products
  - **Files Modified**: `/app/backend/routes/retailer_portal.py` (lines 9839-9870)
  - **Verified**: Tamanna Mart gets 47 additional MRPs from global dispatches (source: `global_dispatch`)

### July 13, 2026 - Pending Amount Dashboard Fix ✅
- **BUG FIX**: Fixed incorrect Pending Amount in Payments dashboard block
  - **Root Cause**: `dashboardStats.pendingAmount` was `filteredTotalInvoiced - filteredTotalPayments`, ignoring credit adjustments and including paid invoices
  - **Fix Applied**: New `filteredPendingAmount` that only sums unpaid invoices (`status === 'pending' || 'partial'`) with `Math.max(0, net_payable - paid_amount - total_credit_adjusted)`
  - **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js` (lines 2735-2759)
  - **Verified**: Payments block shows correct ₹18,985.40 pending

### July 13, 2026 - Add Product Popup & MRP Dual-Key Fix ✅
- **BUG FIX 1**: "Add Product" popup going off-screen in Products tab
  - **Root Cause**: DialogContent lacked height constraints, extending past viewport on smaller screens
  - **Fix Applied**: Added `max-h-[90vh] overflow-y-auto` to DialogContent
  - **Files Modified**: `/app/frontend/src/pages/admin/Products.js` (line 1682)
  - **Verified**: Dialog contained within viewport on 1920x1080 and 768x700 viewports

- **BUG FIX 2**: Piece/Packet-based products showing ₹0 MRP in retailer catalogue
  - **Root Cause**: Frontend looks up MRP by key `{product_id}_unit_piece` or `{product_id}_unit_packet`, but backend only wrote keys `{product_id}_{variant_id}`
  - **Fix Applied**: Implemented dual-key insertion logic in `get_retailer_catalogue_mrp()`:
    1. Query `retailer_catalogue` for products with `display_unit` = "Piece"/"Packet"
    2. Build `piece_products` lookup: `product_id → "unit_piece"/"unit_packet"`
    3. In yesterday_mrp, today_mrp, and dispatch fallback loops, insert MRP under BOTH original key AND dual-key
  - **Files Modified**: `/app/backend/routes/retailer_portal.py` (lines 9729-9847)
  - **Verified MRPs**: Cabbage=₹35, Cauliflower=₹45, Bottle Gourd=₹35 at their `*_unit_piece` keys
  - **Regression Test**: `/app/backend/tests/test_retailer_catalogue_mrp_dual_key.py` (9 tests, 100% pass)

### July 11, 2026 - Auto-Indent Datetime Bug Fix ✅
- **BUG FIX**: Fixed `TypeError: can't compare offset-naive and offset-aware datetimes` in auto-indent generation
  - **Root Cause**: Invoice dates stored as naive ISO strings (without 'Z' or timezone offset) were parsed inconsistently - some became timezone-aware (when 'Z' was present), others remained naive
  - **Impact**: Historical sales auto-indent generation (`POST /api/admin/generate-auto-indent`) crashed with 500 error when comparing invoice dates
  - **Fix Applied**: Added timezone awareness enforcement after parsing - if `parsed_dt.tzinfo is None`, apply `replace(tzinfo=timezone.utc)`
  - **Files Modified**:
    - `/app/backend/routes/retailer_portal.py`:
      - Lines 7143-7160: Fixed datetime parsing in `generate_single_auto_indent()`
      - Lines 6760-6775: Applied same fix to bulk auto-indent generation loop
  - **Testing**: Verified via `testing_agent_v3_fork` - 10/16 retailers successfully generated auto-indents, 6 returned expected "No historical data" message, zero 500 errors
  - **Regression Test**: `/app/backend/tests/test_auto_indent_datetime_fix.py` (3 tests, all passing)

---

## Changelog (June 2026)

### June 30, 2026 - Invoice Payment Buckets Helper ✅
- **REFACTOR**: Created shared `compute_invoice_payment_buckets()` helper for consistent payment calculations
  - **Purpose**: Align retailer portal payment endpoint with admin endpoint's logic
  - **Key Changes**:
    1. **New Helper Function** (`compute_invoice_payment_buckets`):
       - Subtracts `total_credit_adjusted` from `net_payable` BEFORE computing `pending_amount`
       - Implements overdue-aware split logic: for days_since >= 5, splits `unpaid_upfront` into upfront bucket, puts only remainder into final
       - Handles 100% upfront vs standard (50%) retailers correctly
       - Returns: `upfront_due`, `final_due`, `paid`, `outstanding`, `pending_amount`, `days_since`, `is_overdue`, `final_payable`, `is_all_clear`
    2. **Updated `get_retailer_payment_details()`** (L8623-8656): Now uses shared helper instead of inline calculation
  - **Files Modified**:
    - `/app/backend/routes/retailer_portal.py`:
      - Added `compute_invoice_payment_buckets()` helper (lines 85-196)
      - Updated `get_retailer_payment_details()` to use helper
  - **Result**: Portal and admin endpoints now use identical payment bucket logic

### June 30, 2026 - Wastage Computation Refactoring ✅
- **REFACTOR**: Centralized wastage computation using shared `derive_fresh_wastage_for_date()` helper
  - **Purpose**: Align Wastage Dashboard, Daily P&L, and wastage-by-date endpoints to use identical real-time wastage derivation
  - **Key Changes**:
    1. **New Helper Function** (`derive_fresh_wastage_for_date`):
       - Reads LIVE from procurements (with unit_size Kg conversion for Bunch/Piece/Pack/etc.)
       - Reads LIVE from qc_dispatches + retailer_dispatches (with combo ingredient decomposition via `add_combo_ingredient_dispatches`)
       - Reads LIVE from daily_stock_status (for opening/closing)
       - For CLOSED records: `wastage_qty = max(0, opening + fresh_purchase - fresh_dispatch - closing)`
       - Pricing cascade: daily_cogs (WAC) → procurement avg → historical price
       - MAX_REASONABLE_COGS_PER_KG sanity check (5000)
       - READ-ONLY - never writes to daily_stock_status
    2. **Wastage Dashboard** (`get_wastage_dashboard`): Now calls helper per-date
    3. **P&L Report** (`get_pnl_report`): Pre-derives fresh wastage for all dates, uses helper values for wastage_qty, unsold detection
    4. **Wastage By Date** (`get_wastage_by_date`): Simplified to use helper
    5. **Fix Historical Values** (`fix_all_wastage_values`): Repurposed to persist helper-derived values back to stock_status for audit
    6. **Frontend Dashboard.js**: `dayWastage` now includes `unsold_wastage_total`
    7. **WastageDashboard.js**: Updated confirmation text for "Fix Historical Values" button
  - **Files Modified**:
    - `/app/backend/routes/dashboard_analytics.py`:
      - Added `derive_fresh_wastage_for_date()` helper (lines 175-453)
      - Updated `get_wastage_dashboard()` (lines 5205-5328)
      - Updated P&L wastage section (lines 1332-1430)
      - Updated `product_wastage_summary` (lines 1895-1925)
      - Updated `fix_all_wastage_values()` (lines 4684-4860)
      - Updated `get_wastage_by_date()` (lines 5450-5517)
    - `/app/frontend/src/pages/admin/Dashboard.js`:
      - Added `unsoldWastage` variable and included in `dayWastage` calculation (line 1858)
    - `/app/frontend/src/pages/admin/WastageDashboard.js`:
      - Updated confirmation text (line 445)
  - **Contract**: Real-time recompute on every page load - edits to procurement/dispatch/closing reflect immediately

### June 30, 2026 - Full Sync Collections Added ✅
- **FEATURE**: Added 9 new collections to prod-to-preview Full Sync endpoint
  - **Collections Added**: daily_cogs, payments, cogs_snapshots, retailer_inventory, retailer_closing_inventory, retailer_grn, retailer_daily_requirements, qc_daily_requirements, procurement_templates
  - **New Endpoints Created**:
    - `GET /api/daily-cogs` - Returns all daily_cogs records
    - `GET /api/payments` - Returns all payments
    - `GET /api/cogs-snapshots` - Returns all COGS snapshots
    - `GET /api/retailer-inventory` - Returns all retailer inventory
    - `GET /api/retailer-closing-inventory` - Returns all closing inventory
  - **Updated Endpoints**: Increased limit for retailer-daily-requirements and qc-daily-requirements from 100 to 10000
  - **Files Modified**:
    - `/app/backend/routes/backup_data.py` (lines 648-686)
    - `/app/backend/routes/daily_cogs.py` (added GET endpoint)
    - `/app/backend/server.py` (added 4 sync endpoints)

### June 26, 2026 - Record Purchase Bidirectional Calculation ✅
- **FEATURE**: Added bidirectional calculation in Record Purchase modal
  - **Purpose**: Allow users to enter any 2 of (qty, rate, total) and auto-calculate the 3rd
  - **Calculation Logic**:
    - For Kg-based products: Enter any 2 fields → 3rd auto-calculates
    - For Bunch/Piece/Packet: Enter qty + rate → total (or enter qty + total → rate)
  - **Features**:
    - Total field is now editable (was previously display-only)
    - Smart tracking of user-edited fields to determine calculation direction
    - Preserves manually edited totals when selecting products
  - **Files Modified**:
    - `/app/frontend/src/pages/admin/Procurement.js`:
      - `handleProductChange()` - Added bidirectional calculation logic
      - `handleProductSelect()` - Preserves manually edited totals
      - Made Total field an editable Input component
  - **Verified**: Both calculation directions work correctly

### June 26, 2026 - Required Purchase Price Column in DPR ✅
- **FEATURE**: Added "Required Purchase Price" (Req. PP/Kg) column to Daily Purchase Requirement tab
  - **Purpose**: Help procurement team understand target purchase prices based on retail selling prices
  - **Calculation Logic**:
    - Vegetables/Sprouts/Exotic: Required PP/kg = SP/3
    - Fruits: Required PP/kg = SP/2
  - **Data Source**: Latest Retail Selling Price (SP) from COGS tab
  - **Warning**: Displays alert if COGS data is older than 3 days
  - **Features**:
    - Auto-populated values based on category and SP
    - Editable for manual adjustments
    - Included in PDF and Excel exports
    - Multi-language support (English, Hindi, Marathi)
  - **Files Modified**:
    - `/app/frontend/src/pages/admin/RetailerOrders.js`:
      - Updated column header from "PP/Kg" to "Req. PP/Kg"
      - Updated translations for Hindi (आवश्यक खरीद मूल्य/किलो) and Marathi (आवश्यक खरेदी किंमत/किलो)
      - Updated placeholder text to "Req. ₹/Kg"
  - **Verified**: Column displays correctly with auto-calculated values for both Vegetables and Fruits categories

### June 25, 2026 - Closing Inventory Auto-Save Feature ✅
- **FEATURE**: Added auto-save functionality for closing inventory recording
  - **Problem**: Users were losing entered data if they accidentally clicked elsewhere or navigated away
  - **Solution**: Auto-save to localStorage on every value change
  - **Features**:
    - Values automatically saved to localStorage as user enters quantities
    - Visual indicator in modal footer shows "Auto-saving..." → "Auto-saved ✓"
    - Reopening the modal restores previously entered values with toast notification
    - localStorage is cleared after successful server save
    - Storage key format: `closing_inventory_{retailerId}_{date}`
  - **Files Modified**:
    - `/app/frontend/src/pages/retailer/Dashboard.js`:
      - Added `autoSaveStatus` state
      - Added `autoSaveClosingToLocalStorage()` function
      - Added `loadAutoSavedClosing()` function  
      - Added `clearAutoSavedClosing()` function
      - Added auto-save indicator UI in modal footer
  - **Test Results**: 4/4 frontend scenarios pass (100%)

### June 25, 2026 - Auto Indent Generation Bug Fix ✅
- **BUG FIX (P0)**: Fixed Auto Indent Generation merging distinct products with similar names
  - **Symptom**: Parkway retail plan with "Green Chilli" (qty 5) and "Light Green Chilli" (qty 5) generated an indent with only "Green Chilli" (qty 10) - products were incorrectly merged
  - **Root Cause**: The de-duplication logic in `generate_plan_based_indent` used only `product_id` as the dictionary key. If two distinct products accidentally shared the same `product_id` (or if similar-named products were intended to be separate), they would be merged.
  - **Solution**: Changed de-duplication key to a composite key using BOTH `product_id` AND `product_name.strip()`:
    - Format: `f"{product_id}|{product_name.strip()}"`
    - This ensures distinct products with different names are NEVER merged even if they share the same `product_id`
    - Exact duplicates (same product_id AND product_name) are still deduplicated to prevent accidental double-counting
  - **Files Modified**:
    - `/app/backend/routes/retailer_portal.py`:
      - `generate_plan_based_indent()` (line 6719) - Uses composite key for plan deduplication
      - `merge_close_weight_variants()` (line 5772) - Uses composite key for weight merging
    - `/app/backend/routes/admin.py`:
      - `generate_single_auto_indent()` (line 83) - Uses composite key for closing-based indent
  - **Test File Created**: `/app/backend/tests/test_auto_indent_distinct_products.py`
  - **Test Results**: 8/8 backend tests pass (100%)
  - **Verified**: Park Way Mart's plan-based indent now correctly shows "Chilli Light Green" (qty 5) and "Green chilli" (qty 10) as distinct line items

### June 22, 2026 - COGS Tab Added to Dashboard ✅
- **FEATURE**: Added new "COGS" tab on the main dashboard next to the "Costs" tab
  - **Backend**: New endpoint `GET /api/cogs/snapshot?date=YYYY-MM-DD` with admin auth
  - **Frontend**: New COGS tab with date picker, search, sortable table
  - **Features**:
    - Date picker (default: today's date)
    - Table columns: Product Name | PP/kg | QC SP (₹/kg) | Retail SP (₹/kg) | Unit | Last Updated
    - PP/kg from `daily_cogs` collection with date carry-forward
    - QC SP from `qc_grns` (weighted average rate_per_kg) with carry-forward
    - Retail SP from `retailer_dispatches` (weighted average) with carry-forward
    - Search/filter by product name
    - Sort by any column
    - PP/kg change indicator (green ▼ decrease, red ▲ increase vs previous day)
  - **Files Created**:
    - `/app/backend/routes/cogs_snapshot.py` - New API endpoint
  - **Files Modified**:
    - `/app/backend/server.py` - Router registration
    - `/app/frontend/src/pages/admin/Dashboard.js` - COGS tab UI

### June 22, 2026 - P&L retail_cogs and qc_cogs Alignment ✅
- **BUG FIX**: Recomputed `retail_cogs` and `qc_cogs` from line items after detailed COGS calculation
  - Ensures daily totals match sum of individual line items
  - Added `qc_cogs` to daily_pnl output

### June 22, 2026 - P&L and Wastage Dashboard Perfect Alignment ✅
- **BUG FIX (P0)**: Aligned P&L and Wastage Dashboard to show IDENTICAL wastage quantities and values
  - **Symptom**: P&L and Wastage Dashboard showed different wastage values (~Rs 4,744 discrepancy on single days, larger on ranges)
  - **Root Cause**: 
    1. P&L was recalculating wastage using fresh procurement data instead of stored values
    2. Wastage Dashboard was recalculating wastage_value using daily_cogs rates instead of stored values
    3. Both dashboards used different pricing methodologies
  - **Solution**:
    1. Changed both dashboards to use stored `wastage_qty` and `wastage_value` directly from `daily_stock_status`
    2. The stored values are the ground truth (calculated at stock closing time)
    3. Removed recalculation fallback logic that caused discrepancies
  - **Result**: Both dashboards now show IDENTICAL values for all date ranges
    - Full historical range (2026-03-18 to 2026-06-22): 23,917.45 kg / Rs 849,361.31 ✅
    - June 21: 664.44 kg / Rs 28,290.58 ✅
    - June 19: 382.66 kg / Rs 13,788.18 ✅
  - **Files Modified**:
    - `/app/backend/routes/dashboard_analytics.py` - Simplified wastage logic to use stored values
  - **Verification**:
    - Ginger on 2026-06-21: 8.80 kg wastage (correct, dispatch includes 7.60 kg combo ingredients)
    - Garlic on 2026-06-21: 19.65 kg wastage (correct, dispatch includes 7.60 kg combo ingredients)

### June 22, 2026 - Wastage Dashboard vs P&L Value Discrepancy Fix ✅
- **BUG FIX (P0)**: Fixed major discrepancy between Wastage Dashboard and P&L wastage values
  - **Symptom**: Wastage Dashboard showed Rs 842,608 vs P&L showing Rs 506,454 (~65% difference)
  - **Root Cause**: 
    1. Corrupt COGS data in `daily_cogs` collection (e.g., Button Mushroom at Rs 200,000/kg due to division by near-zero quantity)
    2. Wastage Dashboard recalculated wastage_value using daily_cogs without sanity checks
  - **Solution**:
    1. Added `MAX_REASONABLE_COGS_PER_KG = 5000` sanity check in Wastage Dashboard calculation
    2. Prioritized stored `wastage_value` from `daily_stock_status` (ground truth from stock closing)
    3. Added same sanity check to P&L wastage calculation for consistency
    4. Added sanity check in `daily_cogs.py` COGS computation to prevent future data corruption
    5. Cleaned up 10 corrupt COGS records in database
  - **Result**: Discrepancy reduced from Rs 336,154 (65%) to Rs 6,535 (1.27%)
  - **Files Modified**:
    - `/app/backend/routes/dashboard_analytics.py` - Added sanity checks and prioritized stored wastage values
    - `/app/backend/routes/daily_cogs.py` - Added COGS sanity check during computation



### June 21, 2026 - Combo Ingredient Decomposition in Daily COGS ✅
- **BUG FIX**: Fixed `get_sales_by_date()` in `daily_cogs.py` to decompose combo products into base ingredients
  - Previously, combo dispatches were recorded under the combo name, causing base product stock/wastage/COGS to be wrong
  - Now, when a combo is dispatched, its ingredient quantities are added to each base product
  - Example: 38 packs of "Herbs mix(280 gm Pack)" adds:
    - Curry Leaves: 38 × 0.060 = 2.28 kg
    - Coriander: 38 × 0.120 = 4.56 kg
    - Mint: 38 × 0.100 = 3.8 kg
- **BUG FIX**: Fixed `get_packaging_weight_gm()` regex to use midpoint for ranges
  - Previously: "90-110 gm" → 90 gm (lower bound), inflating per-kg price
  - Now: "90-110 gm" → 100 gm (midpoint)
- **BUG FIX**: Fixed `close_stock_status()` to recompute dispatch_qty with combo ingredient decomposition
  - Now calculates fresh dispatches including combo ingredients before computing wastage_qty
- **BUG FIX**: Fixed `recalculate_stock_dispatches()` to include combo ingredient decomposition
- **NEW ENDPOINT**: `POST /api/stock-status/recompute-historical-dispatches`
  - Recomputes dispatch quantities for all closed stock status records in a date range
  - Includes combo ingredient decomposition
- **"Fix COGS Data" button** now also runs historical dispatch recompute after COGS backfill
- **FILES MODIFIED**:
  - `/app/backend/routes/daily_cogs.py` - Combo decomposition in `get_sales_by_date()`, midpoint for ranges
  - `/app/backend/routes/dashboard_analytics.py` - Combo decomposition in stock closing and recalculation
  - `/app/frontend/src/pages/admin/Dashboard.js` - Updated button to run both backfills


### June 21, 2026 - Deployment Health Check Fix ✅
- **BUG FIX**: Added root-level `/health` endpoint for Kubernetes health checks
  - Kubernetes was checking `/health` but the health router was mounted at `/api/health`
  - Added direct `/health` endpoint at root level that returns `{"status": "healthy", "service": "harvest-hub-backend"}`
- **FILES MODIFIED**:
  - `/app/backend/server.py` - Added root-level health endpoint


### June 21, 2026 - Combo Products Exclusion from Stock Status ✅
- **FEATURE**: Exclude combo products from daily stock closing
  - Combo products no longer appear in Stock Status tab
  - Combo products no longer appear in Closable Products list
  - Combo products excluded from Wastage Dashboard
- **FEATURE**: Add combo ingredient quantities to base product dispatches
  - When a combo is dispatched, its ingredient quantities are added to respective base products
  - Example: "Herbs mix(280 gm Pack)" with 76 packs adds:
    - Curry Leaves: 76 × 0.060 = 4.56 kg
    - Coriander: 76 × 0.120 = 9.12 kg
    - Fresh Mint Leaves: 76 × 0.100 = 7.6 kg
  - Helper function `add_combo_ingredient_dispatches()` handles mapping
- **FILES MODIFIED**:
  - `/app/backend/routes/dashboard_analytics.py`:
    - Added `add_combo_ingredient_dispatches()` helper function
    - Updated `get_today_stock_status` to exclude combos and add ingredient dispatches
    - Updated `get_closable_products_for_date` to exclude combos and add ingredient dispatches
    - Updated `get_wastage_dashboard` to exclude combos


### June 21, 2026 - P&L Internal Consistency Fix ✅
- **BUG FIX (P0)**: Fixed Summary vs Daily P&L Purchase Amount Mismatch
  - **Symptom**: Summary `total_purchase` (Rs 31557.5) didn't match sum of `daily_pnl.purchase` (Rs 4755.32) 
  - **Root Cause**: 
    1. `daily_pnl.purchase` was calculated from original `line_items_by_date` which had COGS=0 for non-combo QC items
    2. Proper COGS calculation happened later when building `detailed_line_items`
    3. Summary `total_purchase` used raw procurement data instead of line-item COGS
  - **Solution**:
    1. Moved day COGS calculation to AFTER `detailed_line_items` are built (which have proper COGS rates)
    2. Changed Summary `total_purchase` to use `total_cogs` (line-item based) for consistency
    3. Added `total_procurement` field to preserve raw procurement value for audit reference
  - **Consistency Achieved**:
    - Summary total_purchase = Sum of daily_pnl.purchase ✅
    - Summary total_wastage = Sum of daily_pnl.wastage ✅  
    - QC + Retail bifurcation purchase = Summary total_purchase ✅
- **ENHANCEMENT**: Wastage now uses daily_cogs rate (same as COGS)
  - Updated wastage_value calculation at line 902-922 (main aggregation loop)
  - Updated product_wastage_summary at line 1431-1435
  - Wastage now valued at same rate as line-item COGS for consistency across all 5 P&L views
- **FILES MODIFIED**:
  - `/app/backend/routes/dashboard_analytics.py` - Refactored COGS calculation order, updated summary output, wastage rate alignment


### June 21, 2026 - Combo Product COGS Calculation in Datewise P&L ✅
- **FEATURE (P0)**: Implemented dynamic COGS calculation for combo products
  - **Problem**: New combo products (like "Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)") couldn't be read by GRN upload and P&L didn't calculate their COGS correctly
  - **Solution**: Created combo parsing and COGS calculation system that:
    1. Detects combo products by parsing product names with format: `Name (weight Pack)-FK : (ingredient1 qty, ingredient2 qty, ...)`
    2. Extracts ingredient names and quantities from the product string
    3. Looks up each ingredient's daily COGS rate from the `daily_cogs` collection
    4. Calculates total COGS per pack: `sum(ingredient_weight_kg × ingredient_daily_cogs_rate)`
    5. Distributes wastage proportionally to ingredients based on usage
  - **5 Combo Products Supported**:
    1. Coriander and mint leaves (220 gm Pack)-FK : ( Coriander - 120 gm & Mint 100 gm)
    2. Curry leaves and coriander leaves(220 gm Pack)-FK : (Curry 100gm, Coriander 120 gm)
    3. Herbs mix(280 gm Pack)-FK : (Curry 60 gm, Coriander 120 gm, Mint 100 gm)
    4. fresh spices mix(620 gm Pack)-FK : (Green chill 100gm, Coriander 120gm, Garlic 200gm, Ginger 200gm)
    5. Spinach and Coriander leaves(420 gm Pack)-FK : (Coriander 120 gm, Palak, 300 gm)
  - **Example COGS Calculation** for Herbs mix:
    - Curry Leaves: 0.06 kg × Rs 150/kg = Rs 9.00
    - Coriander: 0.12 kg × Rs 80/kg = Rs 9.60
    - Fresh Mint Leaves: 0.1 kg × Rs 200/kg = Rs 20.00
    - **Total COGS per pack: Rs 38.60**
- **FILES CREATED**:
  - `/app/backend/routes/combo_utils.py` - Combo parsing, COGS calculation, wastage distribution utilities
  - `/app/backend/tests/test_combo_utils.py` - 11 unit tests (all passing)
- **FILES MODIFIED**:
  - `/app/backend/routes/qc_grn.py` - Added combo detection during GRN Excel upload, fixed matching to use GRN_Qty directly for combos
  - `/app/backend/routes/dashboard_analytics.py` - Added combo COGS calculation in P&L, propagated combo fields to response
- **P&L Response Fields Added**:
  - `is_combo`: boolean flag for combo products
  - `combo_cogs_breakdown`: array of ingredient COGS details
  - `combo_wastage_breakdown`: array of proportional wastage distribution
- **TESTED**: Unit tests pass (11/11), API tests verified all 5 combos with correct GRN_Qty (36) from Excel

### GRN COMBO FIX (June 21, 2026) ✅
- **BUG FIX**: GRN upload now correctly reads ALL 5 combo products from Excel
- **Issues Fixed**:
  1. Only 1 combo was being matched (instead of 5) - Fixed by using `startswith` matching for combo products instead of substring matching
  2. GRN Qty was showing 82 instead of 36 - Fixed by using GRN_Qty directly from Excel for combo products (instead of proportional distribution from dispatch qty)
  3. Combo products were filtered out during PCS processing - Fixed by skipping `dispatch_is_pcs` filter for combo items
- **Changes Made in `/app/backend/routes/qc_grn.py`**:
  - Added `is_combo_sku` detection based on combo prefixes
  - Modified matching logic to use `startswith` for combo products (prevents "coriander" from matching "coriander and mint leaves")
  - Added `is_combo` flag to PCS/Kg SKU tracking
  - For combos: use ALL items regardless of `dispatch_is_pcs` flag
  - For combos: use GRN_Qty directly from Excel without proportional distribution
- **Test Results**: All 5 combos matched with GRN Qty: 36, Supplied: 38

### Unit Conversion & Daily COGS Scheduler (June 21, 2026) ✅
- **BUG FIX**: PP/Kg was showing price-per-unit instead of price-per-kg for bunch/piece products
  - Fixed by adding proper bunch/piece/pack → kg conversion in procurement processing
  - Added fallback to closest available date's `daily_cogs` when exact date not found
  - Normalized sales_qty to kg for proper comparison with purchase_qty (Button Mushroom fix)
- **FEATURE**: Added APScheduler job for automatic daily COGS computation
  - Runs at 23:55 IST (18:25 UTC) daily
  - Ensures `daily_cogs` collection stays current automatically
  - Job ID: `daily_cogs_computation`
- **Files Modified**:
  - `/app/backend/routes/dashboard_analytics.py` - Fixed unit conversions at lines 800-815 and 850-865, normalized sales_qty to kg
  - `/app/backend/server.py` - Added `compute_daily_cogs_scheduled()` function and scheduler job


### June 20, 2026 - Invoice Status Fix + Admin-Retailer Portal Sync ✅
- **BUG FIX (P0)**: Fixed invoice showing "Pending" status when fully covered by Credit Notes
  - **Symptom**: June 17 invoice (NAR-INV-17JUN2026-001) showed "Pending" even though Receivable (₹620) = Credit Note (₹620), net is zero
  - **Root Cause**: Status calculation required `paidAmount > 0`, but when CNs fully cover an invoice, paidAmount is 0
  - **Solution**: Added condition: if `pendingAmount <= 0.01 && creditAdjusted > 0 && actualReceivable <= 0.01` → status = 'paid'
  - **Result**: Invoice now shows "Paid" status with green badge
- **SYNC FIX (P0)**: Aligned Retailer Portal Invoice view with Admin Panel
  - **Problem**: Retailer Portal wasn't using 100% upfront calculation logic or showing CN breakdowns
  - **Changes to Retailer Dashboard.js**:
    1. Added 100% upfront detection: `isUpfront100 = dashboardData?.retailer?.upfront_collection_percentage === 100`
    2. For 100% upfront: Use `gross - commission` instead of `gross - rejection - commission`
    3. Added CN breakdown in RECEIVABLE column: strikethrough original → -CN amount → final amount
    4. Dynamic status calculation matching Admin panel logic
    5. Header column renamed from "NET PAYABLE" to "RECEIVABLE" for consistency
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Status calculation (lines 10773-10795)
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Invoice rendering (lines 4695-4810)
- **TESTED**: Verified via screenshot - Narang Super Mart June 17 invoice shows "Payment Cleared" status in Retailer Portal


### June 19, 2026 - Grand Total Pending Amount Fix (Invoice Table Footer) ✅
- **BUG FIX (P0)**: Fixed mismatch between sum of individual invoice pending amounts and the footer total in Admin Retailer Orders
  - **Symptom**: User reported: Individual invoices summed to ₹1200.3 but footer showed ₹1153.55 (difference of ₹46.75 = Credit Note amount)
  - **Root Cause**: Footer calculation used `(final_payable || net_payable) - paid_amount` which was inconsistent with row calculation
    - When `final_payable` existed (CN already deducted), it correctly showed CN-adjusted amount
    - When `final_payable` was missing, it fell back to `net_payable` WITHOUT deducting CN
    - Row calculation ALWAYS deducted `total_credit_adjusted` from `netPayable` explicitly
  - **Solution**: Unified footer calculation to match row logic exactly:
    - RECEIVABLE total: `sum(netPayable - creditAdjusted)` (instead of `sum(final_payable || net_payable)`)
    - PENDING total: `sum((netPayable - creditAdjusted) - paidAmount)` 
    - Also handles 100% upfront retailers correctly by recalculating from gross value
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Fixed footer calculation at lines 11132-11159


### June 19, 2026 - Narang Super Mart One-Time Cleanup (100% Upfront Model Correction) ✅
- **ONE-TIME TASK**: Created CNs for rejection amounts on first 5 invoices (June 3-9, 2026)
  - **Problem**: Narang moved to 100% upfront but payments were made after removing rejections (old flow)
  - **Correct Flow**: Invoice on full gross → CN for rejections → CN adjusted in future invoices
  - **Results**: 
    - 5 CNs created: CN-NAR-0086 to CN-NAR-0090
    - Total CN amount: ₹6,747 (now available for adjustment)
    - Invoice statuses updated from "paid" to "partial" where applicable
  - **Implementation**:
    1. Backend: Added `/api/admin/narang-cleanup/execute`, `/rollback`, `/status` endpoints
    2. Each CN has `narang_cleanup: true` flag linked to source invoice
    3. Frontend: "CN Created" blue badge shown in Status column
    4. Frontend: Cleanup notice in invoice details showing CN number created
  - **Rollback**: Run `/api/admin/narang-cleanup/rollback` to delete CNs and restore statuses
- **FILES MODIFIED**:
  - `/app/backend/routes/retailer_portal.py` - Added Narang cleanup endpoints
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added "CN Created" badge and cleanup notice


### June 19, 2026 - Savtamali One-Time Cleanup (50% → 100% Upfront Migration) ✅
- **ONE-TIME TASK**: Cleared pending amounts for Savtamali retailer who migrated from 50% to 100% upfront model
  - **Scope**: All invoices on or before June 7, 2026
  - **Results**: 5 invoices updated, ₹1,168.00 pending cleared
  - **Implementation**:
    1. Backend: Added `/api/admin/savtamali-cleanup/execute`, `/rollback`, `/status` endpoints
    2. Each updated invoice has `savtamali_cleanup: true` flag with original values stored for rollback
    3. Frontend: "Adjusted" badge (amber) shown in Status column for cleaned-up invoices
    4. Frontend: Cleanup notice displayed in invoice details expansion with date and explanation
  - **Rollback**: Run `/api/admin/savtamali-cleanup/rollback` to restore original values
  - **Disable**: Set `SAVTAMALI_CLEANUP_ENABLED = False` in `/app/backend/routes/retailer_portal.py`
- **FILES MODIFIED**:
  - `/app/backend/routes/retailer_portal.py` - Added cleanup endpoints and constants (end of file)
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added "Adjusted" status badge and cleanup notice


### June 19, 2026 - Payment Summary Modal Fix for 100% Upfront Retailers ✅
- **BUG FIX (P0)**: Fixed Payment Summary modal showing incorrect amounts and irrelevant columns for 100% upfront retailers
  - **Symptom**: Payment Summary showed ₹1107.20 Net Receivable but should show ₹1200.70, and was showing "Rejections" column which doesn't apply to 100% upfront model
  - **Root Cause**: Modal used stored `net_payable` which includes rejection deduction, but for 100% upfront retailers it should be `gross - commission` only. Also, rejections are handled via Credit Notes for 100% upfront, so the column is misleading.
  - **Solution**: 
    1. Updated `getSelectedInvoicesData()` function to recalculate payable for 100% upfront retailers
    2. **Removed "Rejections" and "Total MRP" columns** from Payment Summary table for 100% upfront retailers
    3. Simplified flow for 100% upfront: `Gross → Commission → Payable → CN Adjusted → Paid → Net Receivable`
    4. Updated CSV export to also use conditional columns based on retailer type
- **UI CHANGE**: Payments Block no longer subtracts pending Credit Notes from total
  - **Rationale**: Pending CNs will be adjusted in future invoices, so they shouldn't reduce the current payable amount
  - Now shows: "₹1200.70" with "+₹867 pending credit available" instead of "₹333.70 after ₹867 credit adjustment"
  - Credit Notes card label changed to "Pending Credit Notes" with "for future invoices" subtitle
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js`:
    - Fixed `getSelectedInvoicesData()` function (lines 2011-2058)
    - Fixed `exportPaymentSummary()` function with conditional columns
    - Fixed Payment Summary modal table - conditional columns for 100% upfront
    - Updated Payments Block display to show actual pending without subtracting pending CNs


### June 19, 2026 - Payments Block Total Fix for 100% Upfront Retailers ✅
- **BUG FIX (P0)**: Fixed 93.1 discrepancy between Payments Block total and Invoice Table total for D Store
  - **Symptom**: Payments block showed ₹240.2 payable (after ₹867 credit = ₹1107.2 total) but Invoice footer showed ₹1200.3
  - **Root Cause**: Backend API `all-retailers-immediately-payable` used stored `net_payable` field which was calculated as `gross - rejection - commission`. But for 100% upfront retailers, rejections are handled via Credit Notes, so the correct formula is `gross - commission` only.
  - **Specific Data**: Invoice DSX-INV-17JUN2026-001 had:
    - Stored `net_payable`: ₹1140.70 (incorrect - includes ₹110 rejection deduction)
    - Correct calculation: ₹1234.20 (gross ₹1452 - 15% commission)
    - Difference: ₹93.50
  - **Solution**: Backend now checks if retailer is 100% upfront and recalculates `net_payable` as `gross - (gross * commission_pct / 100)` instead of using stored value
- **FILES MODIFIED**:
  - `/app/backend/routes/retailer_portal.py` - Fixed `get_all_retailers_immediately_payable` endpoint (lines 8460-8488)


### June 18, 2026 - Rejection Amount at COGS Basis (Admin Dashboard) ✅
- **FEATURE**: Rejection amounts in Admin Dashboard now calculated using COGS (Purchase Price) basis instead of MRP (Selling Price)
  - Formula: `rejection_at_cogs = rejection_at_mrp × (purchase / sales)`
- **LOCATIONS UPDATED**:
  1. **Retail P&L Sub-Dashboard**: Label changed to "REJECTION (COGS)", value converted to purchase price basis
  2. **Date-wise Daily P&L Table**: Retail rejection values converted to COGS for date totals and Retail vertical rows
  3. **Customer Level Rows in Daily P&L**: Now uses **exact customer-level rejection** data (not proportional distribution) from actual rejection records, converted to COGS basis
  4. **Customer Detail Popup**: Total rejection and daily rejection values converted to COGS basis, label updated to "REJECTION (COGS)"
- **TECHNICAL CHANGES**:
  - Added `convertRejectionToCOGS(rejectionAtMRP, sales, purchase)` helper function
  - Added `rejectionByDateRetailer` state to store rejection data keyed by `{date}_{retailer_id}`
  - Fetch rejection data in `loadPnlData()` to build exact customer-date lookup map
  - Customer rows now lookup exact rejection by retailer_id instead of proportional distribution
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/Dashboard.js` - All COGS conversion logic and exact customer rejection lookup
- **NOTE**: Retailer Portal views continue to show rejection at MRP (selling price) - this change is Admin-only


### June 17, 2026 - CN-Invoice Sync Diagnostic & Fix Tools ✅
- **ROOT CAUSE ANALYSIS**: Credit Notes marked as "adjusted" but invoice doesn't have the adjustment
  - Root cause 1: Inconsistent field names (`adjusted_in_invoices` vs `adjusted_against_invoices`, `credit_note_adjustments` vs `credit_adjustments`)
  - Root cause 2: Non-atomic updates - CN updated first, then invoice, with potential failure between steps
- **NEW API**: `GET /api/retailer-credit-notes/diagnose-sync-issues` - Finds all mismatches between CN and Invoice records
  - Types: CN_NOT_IN_INVOICE, INVOICE_NOT_FOUND, AMOUNT_MISMATCH, TOTAL_MISMATCH
- **NEW API**: `POST /api/retailer-credit-notes/fix-sync-issues` - Repairs invoices by adding missing CN adjustments
  - Supports `dry_run: true` to preview changes
  - Updates `credit_note_adjustments`, `total_credit_adjusted`, `final_payable`, and `payment_status`
- **UI**: Added "Diagnose Sync" and "Fix Sync Issues" buttons in Credit Notes tab with diagnostic results panel
- **FILES MODIFIED**:
  - `/app/backend/routes/retailer_portal.py` - Added 2 new API endpoints with robust error handling for string/dict formats
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added state, handlers, and UI buttons


### June 17, 2026 - Payment Summary Preview & Retailer Catalogue Export Fixes ✅
- **BUG FIX (P0)**: Excel export for Retailer Catalogue was failing with "Failed to export catalogue" error
  - Root cause: Code referenced undefined variable `packagings` instead of `packagingVariants`
  - Solution: Fixed variable reference in `exportCatalogueToExcel()` function
- **BUG FIX (P0)**: Customer Display Variant names now appear in Excel export
  - Root cause: Export was reading from `variant_mrps` or `enabled_variants` instead of `catalogueItem.variants`
  - Solution: Changed to read from correct field and handle `unit_*` prefixed IDs (e.g., "unit_piece" → "Piece")
- **FEATURE**: Credit Notes (CN) column now appears in Payment Summary Preview and CSV export
  - Added `creditNotes` field to `getSelectedInvoicesData()` function
  - Updated Net Receivable calculation: `Payable - Credit Notes - Paid`
  - Added "CN" column header and data cells in Payment Summary Preview modal
  - Added "Credit Notes" column to CSV export with totals row
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/Products.js` - Fixed `packagings` → `packagingVariants` reference, fixed JSX parsing error
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added creditNotes to data mapping, preview table, and CSV export


### June 16, 2026 - IST Timezone Fix for Date Handling ✅
- **BUG FIX (P0)**: Staff can now edit TODAY's invoices
  - Root cause: `canEditDeleteInvoice()` was using `new Date().toISOString().split('T')[0]` which returns UTC date, not IST
  - Solution: Created `getISTDate()` helper function using `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'`
  - Staff users now correctly see edit/delete buttons ONLY for today's invoices
- **BUG FIX (P0)**: Default date no longer shows as "yesterday" for users with different system timezones
  - Root cause: All `useState(new Date().toISOString().split('T')[0])` calls were using UTC, which could show wrong date depending on user's local system time
  - Solution: Replaced ~40 instances of UTC date initialization with `getISTDate()` or `getISTDateWithOffset()`
  - Affects: Indent forms, Dispatch forms, Invoice forms, Rejection forms, Payment forms, Date filters, Closing inventory
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added `getISTDate()` and `getISTDateWithOffset()` helpers, updated all date initializations
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Updated `getLocalDateString()` to use IST timezone, added `getISTDateWithOffset()` helper
- **TESTING**: Verified staff user (Vanita) can see correct default dates and proper edit permissions on invoices


### June 14, 2025 - Retailer Portal Statement & Final Summary Tabs ✅
- **FEATURE**: Ported Statement and Final Summary tabs from Admin panel to Retailer Portal
  - Statement Tab: Complete financial ledger showing invoices, payments, rejections, and credit notes
    - Date range filter with Apply button
    - Summary cards (Total Debit, Total Credit, Balance Due/Excess Paid)
    - Ledger table with expandable grouped rows (same-day items collapsed)
    - Color-coded entry types (INV, PMT, CN, REJ)
  - Final Summary Tab: Detailed invoice reconciliation view
    - Date range filter with Apply button
    - Main table: Date, Invoice #, Gross Value, Rejections, Net MRP, Commission, Payable, Credit Notes, Paid, Final Payable, Status
    - Expandable item details showing Supply vs Rejection breakdown
    - Totals row at bottom
  - Both tabs are mobile-responsive with scrollable tables
- **TECHNICAL**:
  - State hooks and loading functions were already added (`loadStatementData`, `loadFinalSummaryData`)
  - Added complete JSX rendering for both tabs in `/app/frontend/src/pages/retailer/Dashboard.js`
  - Uses existing backend endpoints: `/api/retailer-statement` and `/api/retailer-invoices/final-summary`
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Added Statement and Final Summary tab UI (~450 lines)

### June 14, 2025 - Statement Invoice Amount Fix for 100% Upfront Retailers ✅
- **FIX**: For 100% upfront retailers, Statement now uses `paid_amount` (what they actually paid) as invoice debit
  - Previously used `net_payable` which excluded rejections - causing mismatch
  - Now: Invoice DEBIT = paid_amount (gross - commission = what they paid upfront)
  - Credit Notes remain as CREDIT (rejections credited back)
  - Balance now matches Final Summary exactly (₹5,380 for Narang)
- **Example** (NAR-INV-03JUN2026-001):
  - Before: DEBIT ₹2,443.2 (net_payable)
  - After: DEBIT ₹2,584 (paid_amount = what they actually paid)
- **FILES MODIFIED**:
  - `/app/backend/routes/retailer_portal.py` - Use paid_amount for 100% upfront retailers in `/api/retailer-statement`

### June 14, 2025 - Final Summary Overpayment Double-Counting Fix ✅
- **BUG FIX**: Fixed double-counting of overpayments in Final Summary totals
  - Issue: For 100% upfront retailers, overpayments (negative Final Payable) were being counted twice:
    1. As negative amounts in the Final Payable column
    2. AND as Credit Notes when adjusted against other invoices
  - Solution: Negative Final Payable values are now excluded from totals (`max(0, final_payable)`)
  - Example (Narang): Overpayments of -₹1,349.6 (on invoices 03-09 Jun) were already converted to credit notes and adjusted against NAR-INV-14JUN2026-001. Now the totals correctly show ₹5,380 instead of ₹4,030.4
- **FILES MODIFIED**:
  - `/app/backend/routes/retailer_portal.py` - Fixed totals calculation in `/api/retailer-invoices/final-summary`

### June 14, 2025 - Statement Tab Grouping Feature ✅
- **FEATURE**: Multiple line items on the same day + same category now show as a collapsed group
  - Groups payments, credit notes, invoices, rejections when multiple occur on same date
  - Shows total amount and count (e.g., "9 Payments", "3 Credit Notes")
  - Click row to expand and see individual items with their references
  - Click again to collapse
  - Expanded items show with "↳" prefix for visual hierarchy
- **Example**: 25 May had 9 payments totaling ₹3,787.7 - now shown as single expandable row
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added `groupStatementEntries` function and expandable row rendering

### June 14, 2025 - Payment Summary Credit Notes Column ✅
- **FEATURE**: Added "Credit Notes" column to Payment Summary modal
  - Placed after "Payable" column, before "Paid" column
  - Shows credit notes adjusted against each invoice (pink color, with - prefix)
  - Updated Net Receivable calculation: `Payable - Credit Notes - Paid`
  - Added Credit Notes total to footer row
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added Credit Notes column to Payment Summary modal

### June 14, 2025 - Invoice Pending Amount & Final Summary Fixes ✅
- **BUG FIX**: Invoices tab pending amount now correctly calculated as `net_payable - credit_notes - paid`
  - Root cause: Frontend was using the stale `final_payable` field from database instead of calculating dynamically
  - Example: NAR-INV-10JUN2026-001 now shows ₹1,986.40 pending (was incorrectly showing ₹3,676)
- **BUG FIX**: Final Summary expanded view now shows correct variant names instead of UUIDs
  - Root cause: Invoice items stored variant_id in `variant_name` field
  - Solution: Backend now looks up actual variant names from `qc_packaging` collection
- **BUG FIX**: Final Summary gross_value now shows INITIAL invoice amount (before rejections)
  - Root cause: Was using `total_mrp_value` (after rejections) instead of `gross_value` (initial)
  - Example: NAR-INV-10JUN2026-001 now shows ₹4,595 gross (was showing ₹2,693)
- **BUG FIX**: Item-level billable_qty now calculated dynamically as `supplied_qty - rejected_qty`
  - Root cause: Stored `billable_qty` in invoice items was incorrect (copied from supplied instead of calculated)
  - Example: Amaranthus Green now shows billable=0 (1-1=0, was showing 1)
- **ENHANCEMENT**: Final Summary item details table reorganized with columns: Supplied Qty, MRP, Supplied Value, Rejection Qty, Rejection Amt, Billable Qty, Billable Value
- **ENHANCEMENT**: Added TOTAL row at bottom of item details showing sum of all quantities and values
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Fixed pending amount calculation, reorganized item columns, added totals footer
  - `/app/backend/routes/retailer_portal.py` - Added qc_packaging lookup, item_totals, fixed gross_value and billable_qty calculations

### June 14, 2025 - Credit Notes Against Invoice Display Fix ✅
- **BUG FIX**: Credit Notes "Against Invoice" column now properly displays which invoice each credit note was adjusted against
  - Root cause: Frontend was reading `adjusted_against_invoices` but data was stored in `adjusted_in_invoices`
  - Solution: Updated frontend to check both fields for adjustment data
- **BUG FIX**: Fixed discrepancy in credit note totals (₹1,517.6 issued vs ₹1,349.6 showing in invoices)
  - Root cause: Two invoices (NAR-INV-10JUN2026-001 and SAV-INV-12JUN2026-001) had credit notes adjusted but the invoice documents weren't updated
  - Solution: Fixed the invoice documents to include `total_credit_adjusted` and `credit_note_adjustments` arrays
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Credit Notes tab now reads from `adjusted_in_invoices` field

### June 14, 2025 - Final Summary Tab Rejection Data Fix ✅
- **BUG FIX**: Fixed Final Summary tab not showing rejection data
  - Root cause: The endpoint was trying to match rejections to invoices by `retailer_id + date`, but rejection dates don't always match invoice dates
  - Solution: Now uses the invoice's stored `rejection_amount` field which is already correctly linked
  - Also fixed item-level breakdown to use invoice items' `rejected_qty` instead of trying to match from separate rejections collection
  - **Before**: Totals showed `rejections: 0` even when invoices had rejections
  - **After**: Totals correctly show `rejections: 69683.0` and individual rows display rejection values
- **FILES MODIFIED**:
  - `/app/backend/routes/retailer_portal.py` - Rewrote `/api/retailer-invoices/final-summary` endpoint to use invoice's stored rejection data

### June 14, 2025 - Print Bug Fix & Labour UX Improvements ✅
- **BUG FIX**: Fixed Stickers & MRP Print showing "undefined" products
  - Root cause: Field name mismatch between `stickersData` structure and `printStickersMrp()` function
  - Fixed: `product.product_name` → `product.productName`, `product.sticker_count` → `product.quantity`
  - Print now correctly shows product names, sticker counts, MRP values, and unit types
- **BUG FIX**: Dispatch modal now shows retailer/shop name instead of owner name
  - Changed from `selectedIndent?.retailer_name` to `getRetailerNameById(selectedIndent?.retailer_id)`
  - Now correctly shows "Dispatch to Savtamali" instead of "Dispatch to Sonaji Kharat"
- **BUG FIX**: Products now sorted alphabetically within categories in both Indent PDF and Dispatch popup
  - Indent PDF: Added alphabetical sorting within each category/type group
  - Dispatch popup: Already had category/type sorting, confirmed alphabetical within groups
  - Order: Vegetables (Hard → Semi-hard → Leafy, each alphabetical) → Fruits (alphabetical) → Exotic → Sprouts
- **BUG FIX**: Invoice excess amounts now showing correctly for all "Excess Paid" invoices
  - Root cause: `final_payable` was incorrectly stored in some invoices, making `pendingAmount = 0`
  - Fixed: Now calculates excess using `net_payable` (original receivable) instead of `final_payable`
  - June 9, June 3, etc. invoices now show correct excess amounts (e.g., "₹336.00 excess")
- **BUG FIX**: Invoice item-level rejections now populate correctly
  - Root cause: Enrichment logic skipped invoices with `rejection_amount > 0` even if items didn't have `rejected_qty`
  - Fixed: Backend now checks if items actually have `rejected_qty` before skipping enrichment
  - June 10 invoice now shows: Supplied Qty → Rejection (-X) → Billable Qty correctly
- **BUG FIX**: Indent Supplied/Pending quantities now correctly match dispatched quantities per variant
  - Root cause: Both frontend and backend used only `product_id` for matching, ignoring `variant_id`
  - Fixed: Now uses `product_id + variant_id` for precise matching when same product has multiple variants
  - "Dispatch Remaining" now correctly identifies items that still need dispatch
  - Frontend: Updated `getIndentRemainingQtys()` and indent display to use precise keys
  - Backend: Updated `create_retailer_dispatch()` to check full dispatch status per variant
  - Model: Added `indent_variant_id` to `RetailerDispatchItem` for tracking
- **BUG FIX**: Invoice creation failure with better error handling
  - Fixed null check for `rejected_qty` field (was causing error when `None` instead of `0`)
  - Added try-except with detailed error logging for debugging
  - Invoice modal now only shows "Rejected" column when any item actually has rejections
- **ENHANCEMENT**: Labour Inactive State Visual Clarity
  - Added "Show inactive" toggle checkbox (only appears when inactive labourers exist)
  - Improved status badges: "✓ Active" (green) / "✗ Inactive" (red) with hover color transitions
  - Inactive labourers now show: strikethrough name + "Deactivated" badge + gray background
  - Count display improved: "15 active • 2 inactive" format
- **ENHANCEMENT**: Add Product / Override MRP button in Stickers & MRP
  - Renamed button from "Add MRP Override" to "Add Product / Override MRP" with tooltip
  - Products added via MRP overrides now appear in the Stickers list (even without day's indents)
  - Print function includes override-only products with quantity 0
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Print fix, dispatch modal fixes, alphabetical sorting, excess amount calculation, rejection display, variant-aware dispatch matching, conditional rejection column in invoice modal
  - `/app/frontend/src/pages/admin/LaborCosts.js` - Inactive state toggle, visual improvements
  - `/app/backend/routes/retailer_portal.py` - Invoice enrichment logic fix, variant-aware dispatch status, invoice creation error handling
  - `/app/backend/models.py` - Added `indent_variant_id` to `RetailerDispatchItem`


### June 13, 2025 - Retailer Portal Rejections & Admin Chart Defaults ✅
- **FEATURE**: Added Rejections tab to Retailer Portal hamburger menu (below Payment Ledger)
  - Same view modes as Admin: "By Invoice Date" and "By Recorded Date"
  - Date range filter for "By Recorded Date" view
  - Shows rejection history with expandable date rows
- **FEATURE**: Admin Retailer Orders charts now default to 12 weeks (84 days) instead of 30 days
  - User can still adjust dates to see different periods

### June 13, 2025 - Rejection Daily Summary & Payment Integration ✅
- **FEATURE**: Daily Rejection Summary View
  - New endpoint `/api/retailer-rejections/daily-summary` groups rejections by RECORDED date (created_at)
  - Frontend toggle: "By Invoice Date" (existing) vs "By Recorded Date" (new)
  - Shows: Recorded Date → Retailers → Products with qty, value, reason
  - Answers: "On June 12, what products were rejected and what was the total amount?"
- **BUG FIX**: Fixed missing `os` import in `backup_data.py` (caused sync errors)
- **BUG FIX**: Fixed missing `timedelta` import in `procurement_new.py` (broke Record Purchase historical data)
- **VERIFIED**: Rejection amounts already properly reflected in Payment Summary
  - Formula: `net_payable = (gross_value - rejection_amount) - commission`
  - Invoice items have `rejected_qty`, `billable_qty`, `amount` properly calculated
- **FILES MODIFIED**:
  - `/app/backend/routes/backup_data.py` - Added missing `os` import
  - `/app/backend/routes/procurement_new.py` - Added missing `timedelta` import
  - `/app/backend/routes/retailer_portal.py` - Added `/api/retailer-rejections/daily-summary` endpoint
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added view toggle and daily summary UI

### June 13, 2025 - Post-Refactoring Fixes & Auto-Indent Enhancements ✅
- **BUG FIX**: Fixed dashboard blank page after deployment
  - Missing startup functions: `seed_default_units_on_startup`, `seed_default_categories_types_on_startup`, `initialize_default_plans`
  - Added missing imports from `routes/retail_plans.py` and `routes/retailer_portal.py`
  - Fixed cross-module dependency: `calculate_grn_loss` imported from `qc_grn.py` to `dashboard_analytics.py`
- **FEATURE**: Historical Closing Inventory Filter
  - Added `filter_inactive` query parameter to `/api/retailer-closing-inventory/summary/{retailer_id}`
  - When `filter_inactive=true`, only returns products with non-zero opening OR non-zero closing quantities
  - Frontend `loadClosingHistory()` now uses this filter for historical dates
- **FEATURE**: Enhanced Auto-Indent Generation (Both Sales-Based and Plan-Based)
  - **Sales-Based Changes:**
    1. Removed 10% buffer - now uses exact historical average
    2. Subtracts closing inventory from historical average to get actual requirement
    3. Applies same timing logic: if closing < dispatch time, dispatch items added to closing
  - **Plan-Based Changes (already done):**
    1. Uses closing inventory with timing adjustment
    2. If closing < dispatch time, adds dispatch to get true ending inventory
  - **New Fields in Indent Documents:**
    - `generation_basis`: "sales" or "plan"
    - `closing_date_used`: Yesterday's date if closing was available
    - `dispatch_adjustment_applied`: Boolean indicating if dispatch was added
    - `last_closing_time`, `last_dispatch_time`: Timestamps used for timing comparison
  - **Remarks Format:** Now includes "(Closing: YYYY-MM-DD)" and "[Dispatch items added to closing]" when applicable
- **FILES MODIFIED**:
  - `/app/backend/server.py` - Added startup seed functions, filter_inactive parameter
  - `/app/backend/routes/dashboard_analytics.py` - Import calculate_grn_loss from qc_grn
  - `/app/backend/routes/retailer_portal.py` - Enhanced auto-indent with closing adjustment
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Use filter_inactive for historical closings

### June 13, 2025 - Backend Codebase Refactoring COMPLETE ✅
- **MASSIVE REFACTORING**: Extracted 18 route modules from `server.py`:
  - ✅ **Auth Routes** → `routes/auth.py`
  - ✅ **Labour Routes** → `routes/labour.py`
  - ✅ **Health Routes** → `routes/health.py` (~330 lines)
  - ✅ **User Routes** → `routes/users.py` (~170 lines)
  - ✅ **Farmer Routes** → `routes/farmers.py` (~50 lines)
  - ✅ **QC Orders & Customers** → `routes/qc_orders_customers.py` (~210 lines)
  - ✅ **QC Indents & Dispatches** → `routes/qc_indents_dispatches.py` (~570 lines)
  - ✅ **QC Invoices** → `routes/qc_invoices_new.py` (~130 lines)
  - ✅ **Products & Packaging** → `routes/products_packaging.py` (~850 lines)
  - ✅ **QC GRN** → `routes/qc_grn.py` (~1,200 lines)
  - ✅ **Retail Plans** → `routes/retail_plans.py` (~340 lines)
  - ✅ **Procurement** → `routes/procurement_new.py` (~1,020 lines)
  - ✅ **Retailer Orders/Wastage** → `routes/retailer_orders_wastage.py` (~300 lines)
  - ✅ **Expenses (Variable & Fixed)** → `routes/expenses_new.py` (~370 lines)
  - ✅ **Backup & Data Management** → `routes/backup_data.py` (~860 lines)
  - ✅ **Gmail Integration** → `routes/gmail_integration.py` (~480 lines)
  - ✅ **Dashboard & Analytics** → `routes/dashboard_analytics.py` (~4,420 lines)
  - ✅ **Retailer Portal** → `routes/retailer_portal.py` (~6,900 lines)
- **PROGRESS**:
  - `server.py` reduced from **20,841 to 2,845 lines** 
  - **-17,996 lines removed (86.3% reduction!)**
  - 18 active routers now extracted and wired up
- **TESTING**: All critical endpoint groups verified via comprehensive curl testing

### June 10, 2025 - Root Cause Fix: Variant Consistency in Auto-Generated Orders ✅
- **ROOT CAUSE FIX**: Auto-generated indents now use consistent variant IDs for Piece/Packet products
  - **`generate_auto_indents_for_tomorrow`** (line ~16371): 
    - Fetches retailer catalogue to check `purchase_unit` for each product
    - For `purchase_unit = "Piece"`: Sets `variant_id = "unit_piece"`, `variant_name = "Pieces"`
    - For `purchase_unit = "Packet"`: Sets `variant_id = "unit_packet"`, `variant_name = "Packets"`
    - Resolves any UUID variant_names to actual packaging names
  - **`generate_plan_based_indent`** (line ~16777):
    - Same logic applied - checks catalogue and overrides variants for Piece/Packet products
    - Also checks closing inventory with both original and normalized variant IDs
- **Migration Script Created**: `/app/backend/migrations/fix_uuid_variants.py`
  - Fixes existing `retail_plans`, `retailer_indents`, and `retailer_dispatches` collections
  - Resolves UUID variant_names to actual packaging names
  - Run manually in production: `cd /app/backend && python3 migrations/fix_uuid_variants.py`
- **FILES MODIFIED**:
  - `/app/backend/server.py` (generate_auto_indents_for_tomorrow, generate_plan_based_indent)
  - `/app/backend/migrations/fix_uuid_variants.py` (NEW)

### June 10, 2025 - Retailer Details & UUID Variant Resolution Fixes ✅
- **BUG FIX**: Retailer names now show when clicking on Piece/Packet products in Stickers & MRP
  - Issue: Key mismatch between aggregation key and lookup key
  - Fix: Items now store their `aggregationKey` and use it for retailer details lookup
- **BUG FIX**: UUID variants (Elaichi Banana, Muskmelon, etc.) now resolved in Daily P&L Dashboard
  - Added `packaging_id_to_name` lookup in P&L report
  - Added `resolve_variant_name()` helper to convert UUID → proper variant name
  - Applied to retail dispatch items in the P&L calculation
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js`:
    - `calculateStickersData()` - Items now store `aggregationKey`
    - Retailer details lookup uses `item.key` instead of hardcoded key format
  - `/app/backend/server.py`:
    - `get_pnl_report()` - Added packaging lookup and UUID resolution for variant names

### June 10, 2025 - Stickers & MRP: Catalogue-Based Variant Aggregation ✅
- **BUG FIX**: For products with `purchase_unit = "Piece"` or `"Packet"` in the Retailer Catalogue:
  - Retailer manual orders (using `unit_piece`/`Pieces`) now aggregated with system auto-generated orders (using weight variants like `250+ gm`)
  - Example: Broccoli "Pieces" (3) + Broccoli "250+ gm" (4) → Combined as "Broccoli: 7 Pieces of 250+ gm"
- **ENHANCEMENT**: Variant display now shows weight info for Piece/Packet products
  - Format: "Pieces of [weight]" or "Packets of [weight]" where weight comes from catalogue's `purchase_weight_variant`
- **FILES MODIFIED**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js`:
    - `calculateStickersData()` - Fetches catalogue, aggregates by `productId` only for Piece/Packet products
    - `loadMrpIndentProducts()` - Same catalogue-based aggregation logic

### June 10, 2025 - Stickers & MRP: Enhanced Dedup + MRP Overrides ✅
- **ENHANCEMENT**: Fixed `calculateStickersData` dedup logic
  - Dedup key now uses `product_id + canonical variant_id` (not name-based)
  - Resolves variants via packagings map using same normalization as Daily Purchase Requirement
  - Handles special `unit_piece`, `unit_packet`, and raw variant_name strings
  - Onion 500g and Onion 1000g stay as separate rows (different variants)
  - Button Mushroom across different spellings collapses to one row (same product)
- **NEW FEATURE**: Sticker MRP Overrides
  - New MongoDB collection `sticker_mrp_overrides` stores admin-defined MRPs
  - Add button to create new override (product + variant + MRP)
  - Pencil icon on each row to edit existing override
  - Override MRP column (purple) shows saved overrides
  - Overrides persist independently of indents/dispatches
- **ENHANCEMENT**: `/api/retailer-dispatches/yesterday-mrp` now prefers overrides
  - Checks `sticker_mrp_overrides` first, then falls back to dispatch MRP
  - Response includes `source: "override"` or `source: "dispatch"` field
  - This auto-populates the Dispatch flow with override MRPs
- **Backend Endpoints Added**:
  - `GET /api/sticker-mrp-overrides` - List all overrides
  - `POST /api/sticker-mrp-overrides` - Create/update override
  - `PUT /api/sticker-mrp-overrides/{id}` - Update specific override
  - `DELETE /api/sticker-mrp-overrides/{id}` - Delete override
- **Files Modified**:
  - `/app/backend/server.py` (lines 11286-11455 - yesterday-mrp + override endpoints)
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (StickerMrpOverrideForm component, calculateStickersData rewrite, modal state, UI columns)

### June 10, 2025 - Today's Closing Summary: Date Query Bug Fix ✅
- **BUG FIX**: "Today's Closing Summary" section in Closing Inventory tab now correctly displays retailers
  - Root cause: MongoDB query used `$regex` on `dispatch_date` which didn't match ISO datetime strings stored in DB
  - Fix: Changed to use `$or` query combining regex pattern AND date range (`$gte`/`$lte`) for robust matching
  - Also added indents check: Retailers with today's indents (not just dispatches) now appear in summary
  - All 5 retailers (Jai Bhawani, Narang Super Mart, Park Way Mart, Savtamali, Tamanna Mart) now show as "Pending"
- **Files Modified**:
  - `/app/backend/server.py` (lines 19222-19244 - get_todays_closing_summary endpoint)

### June 10, 2025 - Daily Purchase Requirement: Enhanced Unit Handling ✅
- **ENHANCEMENT**: Added proper handling for `unit_piece` and `unit_packet` variant IDs
  - These special IDs are used for items sold by piece/packet but not in qc_packaging collection
  - Backend now resolves them to proper display names ("Pieces", "Packets")
  - Weight calculation improved: looks up catalogue purchase_weight for accurate Kg conversion
- **ENHANCEMENT**: Added `qty_pieces` and `qty_packets` tracking to API response
  - Frontend displays orange "Pcs" label for piece-based products
  - Frontend displays purple "Pkts" label for packet-based products
  - Shows contextual info like "Pcs of 500+ gm" for better procurement guidance
- **Files Modified**:
  - `/app/backend/server.py` (lines 19630-19820 - retailer-daily-requirement/calculate)
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (lines 2928-2933, 7672-7716)

### June 9, 2025 - Auto Indent Edit: Missing Variant Fix ✅
- **BUG FIX**: Editing auto-generated indents no longer shows "Missing variant" error
  - Root cause: Sales-based auto indents stored `variant_name` but empty `variant_id`
  - Invoices (source data for sales-based indents) have `variant_name` but no `variant_id`
  - Fix: Backend now looks up `variant_id` from `variant_name` using qc_packaging table
- **Backend Changes**:
  - `POST /api/retailer-indents`: Resolves variant_id from variant_name before validation
  - `PUT /api/retailer-indents/{id}`: Same resolution logic applied
  - Sales-based auto indent generation: Looks up variant_id when creating indent items
- **Files Modified**:
  - `/app/backend/server.py` (create_retailer_indent, update_retailer_indent, generate_single_auto_indent)

### June 9, 2025 - Daily Purchase Requirement: Product Grouping & Dozen Math ✅
- **BUG FIX**: Daily Purchase Requirement now groups indents by PRODUCT (not variant)
  - Products with multiple variants (Onion 500g & 1kg, Bottle Gourd Pieces & 500g) appear as SINGLE rows
  - Variants are combined into a comma-separated string (e.g., "500+ gm, 1000+ gm")
  - Eliminates duplicate rows that caused procurement confusion
- **BUG FIX**: Banana dozen calculations now work correctly
  - Backend calculates `qty_dozens` based on variant multipliers: 1.0 for "1 Dozen", 0.5 for "Half Dozen"
  - Example: 6 units × 1 dozen + 6 units × 0.5 dozen = 9 dozens
  - Frontend displays yellow "Dozens" input field for products with `purchase_unit='Dozen'`
- **Testing**: All 11 backend tests + full frontend verification passed
- **Files Modified**:
  - `/app/backend/server.py` (lines 19550-19800 - retailer-daily-requirement/calculate endpoint)
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (lines 2919-2935, 7670-7692)

### June 9, 2025 - Compact Collapsible Tables for Indent & Dispatch ✅
- **UI IMPROVEMENT**: Made Indent and Dispatch expanded tables more compact
  - Removed `w-full` to stop table from stretching to full width
  - Product, Variant, and Qty columns now closer together
  - Reduced cell padding from `p-1` to `px-1 py-0.5` for tighter rows
  - Set minimum widths to maintain readability on mobile
- **Parity**: Both Indent and Dispatch tabs now have identical compact table layouts
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` (4 table updates - 2 for Indent, 2 for Dispatch)

### June 9, 2025 - Sync & Auto Indent Improvements ✅
- **BUG FIX**: Retail Plans now sync from Production to Preview
  - Added `retail_plans` collection to backup system (`COLLECTIONS_TO_BACKUP`)
  - Added to Excel sync sheet mapping (`sheet_to_collection`)
  - Added to direct API sync endpoints
  - Added to `/api/backup/status` and `/api/sync-status` responses
  - Added `products` field to JSON fields map for proper nested array handling
- **BUG FIX**: Variant names now display correctly in Auto Indent items
  - Fixed `RetailPlans.js` to lookup packaging names when adding products (was storing UUID as name)
  - Enhanced `getIndentVariantDisplay()` in `RetailerOrders.js` to detect and resolve UUID patterns
- **NEW FEATURE**: "Yest. Closing" column added to Plan Based indent view
  - Shows only for indents with `generation_basis === 'plan'`
  - Helps verify calculation: Plan Qty - Closing Qty = Ordered Qty
  - Column appears between Variant and Ordered columns
- **Files Modified**:
  - `/app/backend/backup_system.py`
  - `/app/backend/server.py` (sync endpoints, backup status)
  - `/app/frontend/src/pages/admin/RetailPlans.js`
  - `/app/frontend/src/pages/admin/RetailerOrders.js`

### June 9, 2025 - Attendance: Working Hours & Paid Leave Features ✅
- **NEW FEATURE**: Added configurable Working Hours for attendance
  - Default: 9 hours when marking present
  - Editable: Can change hours if labourer worked less (wages proportionally adjusted)
  - Formula: `payment = (daily_rate / 9) * working_hours + (overtime_rate * overtime_hours)`
- **NEW FEATURE**: Added Paid Leave checkbox column
  - Only available when labourer is NOT present
  - Paid leave days count as full day payment in calculations
  - Formula when paid_leave: `payment = daily_rate`
- **UI Changes** (Both Staff & Admin panels):
  - Added "WORKING HRS" column (editable input, default 9)
  - Added "PAID LEAVE" checkbox column (after OT hours)
  - Added "Paid Leave" summary card
  - Row highlighting: green for present, purple for paid leave
- **Files Modified**:
  - `/app/frontend/src/pages/staff/Attendance.js`
  - `/app/frontend/src/pages/admin/LaborCosts.js`
  - `/app/backend/routes/labour.py` (bulk save endpoint)

### June 9, 2025 - Rejection Chart Added to Retailer Earnings Block ✅
- **NEW FEATURE**: Added rejection trend chart to the Retailer Earnings section
  - Summary row now shows 4 metrics: Total Order Value, Total Earnings, Avg. Earning/Day, **Total Rejections** (with item count)
  - New **Rejections chart** (red) added alongside existing 3 charts
  - Uses the same date filter (Period) and view mode toggle (Daily/Weekly/Monthly)
  - Filters by selected retailer when one is chosen
  - Tooltip shows rejection value and item count per period
- **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js`

### June 9, 2025 - Enhanced Auto Indent with Order Basis Selection ✅
- **NEW FEATURE**: Auto Indent modal now supports two generation modes:
  1. **Historical Sales Based** (default) - Calculates from last 7 identical weekdays + 10% buffer
  2. **Retail Plan Based** - Plan qty minus yesterday's closing inventory
- **UI Changes**:
  - Added "Order Basis" radio button selector in Auto Indent modal
  - Dynamic description text changes based on selected option
  - Color-coded: Purple for Sales-based, Green for Plan-based
- **Indent Tags**: Auto-generated indents now show two tags:
  - "Auto Generated" (purple) + "Sales Based" (amber) OR "Plan Based" (green)
- **Plan-based Logic**:
  - Validates retailer has subscribed plan with products
  - Requires closing inventory for previous day (mandatory)
  - Calculates pending qty = Plan qty - Closing qty
  - Only creates items with positive pending quantities
- **Backend**: New `generate_plan_based_indent()` function added
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Modal UI and state
  - `/app/backend/server.py` - `generate_single_auto_indent()` and new helper function

### June 8, 2025 - Credit Notes Grouped by Invoice Date in PDF (Verified) ✅
- **FEATURE VERIFIED**: Invoice PDF now displays credit note adjustments grouped by Original Invoice Date
  - Credit notes are organized under date headers (e.g., "30 May 2026", "29 May 2026")
  - Each group shows the Original Invoice Number (e.g., "SAV-INV-30MAY2026-001")
  - Rejection credit notes display product details: Product, Qty, Variant, Reason, Value
  - Excess Payment credit notes are clearly labeled and distinguished
  - Total adjustment amount shown per group and overall
- **Files Involved**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - `downloadInvoicePdf()` function with grouping logic
  - `/app/backend/server.py` - `/api/retailer-invoices` endpoint passes `original_invoice_number` in adjustments
- **Status**: Visually verified via PDF generation test

### June 8, 2025 - Stock Closing Matrix UI (Phase 2 of Automated Order System) ✅
- **NEW FEATURE**: Replaced the old complex Closing Inventory tab with a new matrix-style UI (like Retail Plans)
  - Shows ALL products from Retailer Catalogue grouped by category (collapsible)
  - User selects retailer and date, then clicks "Load" to view/enter stock closing
  - Shows Opening qty (from previous day's closing) and Closing qty input
  - Today's entries are editable, historical entries are view-only with "Items Sold" calculation
  - Save button appears only when there are changes and date is today
  - Summary footer shows total products, entries filled, and total closing stock
  
- **State Variables Added**:
  - `stockClosingCatalogue` - Parsed retailer catalogue for stock closing
  - `stockClosingData` - Map of { productId_variantId: closingQty }
  - `stockClosingOpeningData` - Map of opening quantities
  - `stockClosingExpandedCats` - Expanded categories
  - `stockClosingHasChanges` - Track unsaved changes
  - `stockClosingSaving` - Loading state for save
  
- **Functions Added**:
  - `loadStockClosingData()` - Loads catalogue and existing closing data
  - `saveStockClosing()` - Saves closing entries to backend
  - `getStockClosingVariantName()` - Resolves variant names from packagings
  - `stockClosingCategories` - Computed memo for category list
  - `stockClosingCatalogueByCategory` - Computed memo for grouped catalogue
  
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Replaced Closing Inventory tab with new matrix UI

### June 8, 2025 - Retail Plans Matrix Improvements (P0) ✅
- **FIXES Applied** (5 issues reported by user):
  1. **Saved Quantities Not Visible** - Fixed by properly resetting `hasChanges` flag after loadData and ensuring planProducts map rebuilds correctly from API response
  2. **Customer Display Variants** - Now shows ALL variants from catalogue (matching what's shown in Products > Retailer Catalogue) with proper names from packagings lookup
  3. **Variant Names** - Added `getVariantDisplayName` function that looks up variant names from `qc-packaging` API (e.g., "250+ gm", "200 gm Packet" instead of truncated UUIDs)
  4. **Users Icon Too Small** - Increased icon size from 10px to 14px and added hover styling for better visibility
  5. **Backspace Not Working** - Changed from `<Input type="number">` to native `<input type="text" inputMode="decimal">` with proper onChange/onBlur handlers that allow empty strings and backspace
  
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailPlans.js` - Major update to load packagings, display all variants, fix input handling

### June 8, 2025 - Catalogue Variants Parsing Fix (P0) ✅
- **BUG FIX**: Retailer Catalogue category expansion error and multiple variants in Retail Plans
  - **Root Cause**: The backend stores `variants` and `purchase_weights` as **string representations** of arrays (e.g., `"['unit_packet', 'e185c5d8-...']"`) instead of actual arrays. Frontend code was trying to call array methods (`.filter()`, `.reduce()`) on these strings, causing crashes.
  - **Fix Applied**: Added parsing logic in 4 locations to convert string variants to proper arrays:
    1. `/app/frontend/src/pages/retailer/Dashboard.js` - loadData function parses catalogue variants
    2. `/app/frontend/src/pages/admin/RetailerOrders.js` - loadBaseData function parses catalogue variants
    3. `/app/frontend/src/pages/admin/RetailerOrders.js` - startClosingEntry function parses closing catalogue variants
    4. `/app/frontend/src/pages/admin/RetailPlans.js` - loadData function parses catalogue variants
  - **Files Modified**: 
    - `/app/frontend/src/pages/retailer/Dashboard.js`
    - `/app/frontend/src/pages/admin/RetailerOrders.js`
    - `/app/frontend/src/pages/admin/RetailPlans.js`
  - **Result**: Category expansion now works correctly, and Retail Plans matrix shows proper single variant per product based on `purchase_unit`


### June 7, 2025 - Retailer Earnings Dashboard Enhancement ✅
- **ENHANCEMENT**: Improved "Your Earnings" section in Retailer Portal
  - **Default Date Range**: Now defaults from first order date to today (instead of last 30 days)
  - **Average Earnings Per Day**: Added new metric showing total earnings divided by number of days with orders
  - **UI Display**: Shows "Avg. Per Day: ₹X (Y days with orders)"
  - **Trend Charts**: Added 2 area charts:
    1. **Daily Orders Trend** - Blue gradient showing order count per day
    2. **Daily Earnings Trend** - Green gradient showing earnings per day
  - Charts update based on selected date range
  - Date Pickers still available for custom filtering
- **Files Modified**: `/app/frontend/src/pages/retailer/Dashboard.js`
- **Library Used**: recharts (already installed)

### June 7, 2025 - Admin Indent "Piece" Variant Dropdown Fix ✅
- **BUG FIX**: Admin/Staff Indent Form was missing "Piece" variants (e.g., Bottle Gourd, Cauliflower, Cabbage)
  - **Issue**: When Admin/Staff created an indent on behalf of a retailer, products with "Piece" unit type (like Bottle Gourd) were not showing their variants in the dropdown
  - **Root Cause**: The variant dropdown filtered from `packagings` (QC packaging) which only contains weight-based variants. Piece products use synthetic variants like `unit_piece` stored in the retailer catalogue's `variants` array
  - **Fix Applied**:
    1. Created `getVariantsForProduct()` function that looks up the product's catalogue entry
    2. Parses catalogue variants (handles both array and string-encoded array formats)
    3. Adds `unit_piece`/`unit_packet` synthetic variants when present
    4. Includes standard weight-based packagings from the catalogue
    5. Falls back to filtered packagings if no catalogue entry found
  - **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js`
  - **Result**: Selecting Bottle Gourd now shows "Pieces" and "500+ gm" in the variant dropdown


### June 5, 2025 - Rejection Loss Date Filter Fix ✅
- **BUG FIX**: Rejection Loss block amount not updating when date range changed
  - **Root Cause**: The dispatches data (`allDispatchesForRejection`) was only loaded when the modal opened, not when dates changed on the main block
  - **Fix Applied**: Added a new useEffect that loads dispatches whenever `rejectionLossDateFrom` or `rejectionLossDateTo` changes, even when the modal is closed
  - **Result**: Now changing dates on the Rejection Loss block will properly update the displayed values
- **Files Modified**: `/app/frontend/src/pages/admin/RetailerOrders.js`

### June 5, 2025 - Invoice Rejection Sync Fix ✅
- **BUG FIX**: Rejections not syncing to invoice line items
  - **Root Cause**: Invoice items had `variant_id: 'None'` (string) while rejections had proper variant IDs. The matching logic tried `variant_id` first but didn't find matches.
  - **Fix Applied**: Updated `sync_invoice_rejection_amount()` to use dual-key matching:
    1. First try exact match: `product_id + variant_id`
    2. Fallback to: `product_id + variant_name`
  - **Result**: 19 out of 20 Narang rejections now sync correctly to invoice items
- **Files Modified**: `/app/backend/server.py` - Updated sync function

### June 5, 2025 - Rejection Delete Cascades to Credit Note ✅
- **NEW FEATURE**: When a rejection is deleted, its linked credit note is automatically handled:
  - If credit note hasn't been adjusted (used) → Credit note is **deleted**
  - If credit note has been partially/fully adjusted → Credit note is **voided** (amount set to 0)
  - Confirmation dialog updated to warn about linked credit note
  - Success message shows credit note action taken
  - Credit notes list auto-refreshes after rejection deletion
- **Files Modified**:
  - `/app/backend/server.py` - Updated `delete_retailer_rejection` endpoint
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Updated confirmation and refresh

### June 5, 2025 - Credit Notes Product Details Fix Button ✅
- **NEW FEATURE**: Added "Fix Product Details" button in Admin Credit Notes tab
  - Located in Credit Notes tab header (orange button with wrench icon)
  - Click to backfill missing product-level details (qty, rate, amount) for all credit notes
  - Uses the linked rejection records to populate missing details
  - Shows success message with count of fixed credit notes
- **Files Modified**:
  - `/app/backend/server.py` - Added `/api/retailer-credit-notes/backfill-rejection-details` endpoint
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added button and handler

### June 5, 2025 - Reimbursement Modal Bug Fix ✅
- **BUG FIX**: Reimbursement popup was showing full purchase amount instead of employee's actual paid amount
  - **Issue**: For Riva Vegetable purchase (₹11,065.75 total), when Devendra paid only ₹8,000, the modal incorrectly showed "Employee Paid: ₹11,065.75" and pre-filled ₹11,065.75 as reimbursement amount
  - **Root Cause**: Modal used `total_amount` instead of `paid_amount`
  - **Fix Applied**:
    1. `openSettlementModal()` now uses `paid_amount` (what employee actually paid)
    2. Modal "Employee Paid" display shows `paid_amount`
    3. Added "Pending (to farmer)" line when there's remaining balance
    4. "Full Amount" button now sets to `paid_amount` not `total_amount`
  - **Files Modified**: `/app/frontend/src/pages/admin/Procurement.js`
  - **Result**: Modal now correctly shows ₹8,000 for Employee Paid and pre-fills ₹8,000 as reimbursement amount

### June 5, 2025 - Invoice Print Enhancements ✅
- **NEW FEATURE**: Storage Type shown on Invoice Print
  - Each product line now shows "(Storage - Outdoor)" or "(Storage - Fridge)" below the item name
  - Color coded: Fridge = blue text, Outdoor = amber text
  - Applied to both Admin and Retailer portal invoice printing
- **NEW FEATURE**: Language Selection for Invoice Print (Admin Portal)
  - When clicking download/print button, a dialog appears to select language
  - Options: English, Hindi (हिं), Marathi (मरा)
  - Only product names are translated, rest remains in English
  - Note displayed explaining translation scope
- **Files Modified**:
  - `/app/frontend/src/pages/admin/RetailerOrders.js` - Added language dialog, storage type display
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Added storage type display, Marathi support

### June 5, 2025 - Storage Type Field for Products ✅
- **NEW FEATURE**: Added Storage Type field to products
  - Options: "Outdoor" (default), "Fridge"
  - New column in Products table (after Type column)
  - Field in Add/Edit Product form
  - Outdoor = amber badge, Fridge = blue badge
- **BULK EDIT**: Added "Bulk Edit Storage" dialog
  - Quick Set All buttons: "All Outdoor" / "All Fridge"
  - Individual dropdown for each product
  - Summary showing count by type and pending changes
  - Saves only changed products
- **MIGRATION**: Set default storage_type="Outdoor" for all 91 existing products
- **Files Modified**:
  - `/app/backend/models.py` - Added storage_type field to Product, ProductCreate, ProductUpdate
  - `/app/backend/server.py` - Added bulk-update-storage and set-default-storage endpoints
  - `/app/frontend/src/pages/admin/Products.js` - Added column, form field, bulk edit dialog

### June 5, 2025 - Admin Credit Notes Retailer Filter Fix ✅
- **BUG FIX**: Credit Notes section in Admin portal retailer filter not syncing
  - **Issue**: When selecting a retailer from the top dropdown, Credit Notes section had its own separate dropdown showing "All Retailers"
  - **Root Cause**: Credit Notes section used `creditNoteFilter.retailer` state separate from page-level `selectedRetailer`
  - **Fix Applied**:
    1. Removed duplicate retailer dropdown from Credit Notes section
    2. Now uses page-level `selectedRetailer` which triggers API call with `retailer_id` filter
    3. Shows selected retailer as a purple tag when filtered
    4. Fixed retailer count display to use `retailer_id` instead of `retailer_name`
  - **Files Modified**:
    - `/app/frontend/src/pages/admin/RetailerOrders.js`
  - **Result**: Selecting "Savtamali" from top dropdown now correctly shows only 18 credit notes (was showing all 129)

### June 5, 2025 - Critical Fix: Rejection Qty Validation ✅
- **BUG FIX**: Rejection quantity was exceeding supplied quantity
  - **Root Cause 1**: Frontend history lookup used only `product_id`, not `product_id+variant_id` - caused wrong "already rejected" calculation for products with variants
  - **Root Cause 2**: Backend had NO validation - allowed any rejection qty regardless of supplied qty
  - **Fix Applied**:
    1. **Backend**: Added validation in `POST /api/retailer-rejections` that:
       - Fetches supplied qty from `retailer_dispatches` for the specific product+variant+date
       - Fetches existing rejections for the same product+variant+date  
       - Rejects if `new_qty + already_rejected > supplied_qty`
       - Returns clear error message: "Rejection qty (X) exceeds maximum allowed (Y). Supplied: Z, Already rejected: W"
    2. **Backend**: Updated `POST /api/retailer-rejections/history-batch` to return both:
       - Product-level aggregation (by product_id)
       - Product+Variant-level aggregation (by "product_id|variant_id")
    3. **Frontend**: Updated history lookup to use composite key "product_id|variant_id" for precise tracking
    4. **Models**: Added `variant_id` field to `RetailerRejection` and `RetailerRejectionCreate`
  - **Files Modified**:
    - `/app/backend/server.py` - Validation in create endpoint, history-batch update
    - `/app/backend/models.py` - Added variant_id field
    - `/app/frontend/src/pages/admin/RetailerOrders.js` - Composite key lookup
  - **Data Cleanup**: Deleted 38 duplicate rejection records for Narang Super Mart (Jun 3)
  - **Test Results**: 
    - Reject > supplied → BLOCKED ✅
    - Reject within limit → ALLOWED ✅
    - Reject again exceeding remaining → BLOCKED ✅

### June 4, 2025 - Credit Notes on Retailer Portal ✅
- **NEW FEATURE**: Credit Notes Tab for Retailer Portal
  - Added "Credit Notes" menu item in hamburger menu (below Payment Ledger)
  - Summary blocks showing: Total Issued, Adjusted, Pending amounts
  - Date-wise collapsible list showing credit amount per date
  - Expandable details showing: Invoice #, Product, Qty, Rejection Date, Amount, Adjusted, Pending
  - Handles both detailed rejection items and simple credit notes
- **API Added**: `GET /api/retailer-credit-notes/my-summary`
  - Returns summary totals and date-wise grouped credit notes
  - Automatically filters by logged-in retailer's ID
- Files Modified:
  - `/app/backend/server.py` - Added `my-summary` endpoint
  - `/app/frontend/src/pages/retailer/Dashboard.js` - Added Credit Notes tab

### June 4, 2025 - Paid By Filter Fix for Legacy Data ✅
- **BUG FIX**: Procurement Page "Paid By" Filter
  - **Issue**: Filter only showed ~9 results for Devendra Shukla, but he had 29 payments
  - **Root Cause**: Legacy data stored employee name (`paid_by`) but no `paid_by_employee_id`
  - **Solution**: Updated filter logic to match by employee NAME as fallback for legacy data
  - **Changes Made**:
    1. Backend: Added `payments` array to procurement API response (includes all payments from `procurement_payments` collection)
    2. Frontend: Filter now checks both procurement-level `paid_by_employee_id` AND individual payments array
    3. Frontend: Filter uses employee name matching for legacy data without employee ID
    4. Frontend: `paidByEmployees` dropdown now includes all employees who have ever paid (with/without ID)
  - **Results**: Filter by "Devendra Shukla" now shows 29 results (was 9), including:
    - 17 from Riva Vegetable
    - 6 from Samsuddin  
    - 4 from Shewalwadi Market
    - 1 from Anand Gaikwad
    - 1 from Shri Enterprises
- Files Modified: 
  - `/app/backend/models.py` - Added `ProcurementPaymentItem` model and `payments` field to `Procurement`
  - `/app/backend/server.py` - Enhanced `GET /api/procurement` to include payments array
  - `/app/frontend/src/pages/admin/Procurement.js` - Updated filter logic and employee extraction

### June 2, 2025 (Session 12) - Closing Inventory Enhancement & Auto Indent Fix

#### Closing Inventory - New Entry Mode ✅
- **NEW FEATURE**: Simplified Closing Inventory Entry
  - When user selects retailer and clicks "New Entry", products from last supply auto-populate
  - Pre-populated with last dispatch items (product name, variant)
  - "Add Product" modal to add more products not in last supply
  - Simple quantity entry and save
  - View previous dates' closing by changing date and clicking "Load"
- **API Added**: `GET /api/retailer-closing-inventory/last-supply/{retailer_id}`
  - Returns items from most recent dispatch for the retailer
  - Used to pre-populate closing inventory form
- **UI Changes**:
  - New "New Entry" button alongside "Load" button
  - Entry mode shows blue info banner with retailer name and last supply date
  - Table with # | Product | Variant | Closing Qty | Action columns
  - "Add Product" modal with search and variant selection
  - Cancel and Save Closing buttons
- Files: `/app/backend/server.py` (lines 18288-18349), `/app/frontend/src/pages/admin/RetailerOrders.js`

#### Auto Indent - Smart Weight Clustering V3 ✅
- **FIX**: Auto Indent Generation Logic - Smart Weight Clustering
  - Four-tier weight grouping: DB lookup → Name extraction → Bucket normalization → Close weight merging
  - Added `merge_close_weight_variants()` - Combines variants within 300g of each other
  - Results: Tamanna Mart reduced from 64 to 46 items
  - Different weight categories (500g vs 1000g) correctly kept separate
- Files: `/app/backend/server.py` (lines 14785-14935, 15118-15145, 15363-15377)

### June 2, 2025 (Session 11) - Image Storage Migration & Expense Improvements
- **MIGRATION**: Product Images - Base64 to Filesystem ✅
  - Migrated 68 product images from MongoDB base64 to `/app/uploads/products/`
  - Images auto-compressed and resized to max 800×800 pixels
  - Converted to WebP format (85% quality) for optimal file size
  - New upload endpoint accepts up to 10MB, outputs ~20-50KB WebP
  - Migration API: `POST /api/products/migrate-images` (admin only)
  - Files: `/app/backend/server.py` (compress_and_convert_image function, upload/delete/migrate endpoints)

- **ENHANCEMENT**: Bulk Payment - Editable Amount & Auto-Allocation ✅
  - Added editable payment amount field in Bulk Payment modal
  - Payment auto-allocates to oldest entries first (sorted by date)
  - Shows real-time allocation preview with partial/full payment indicators
  - Transaction reference now mandatory for non-cash payments (UPI, Bank, Cheque)
  - "Full Amount" button to quickly fill total pending
  - Files: `/app/frontend/src/pages/admin/Procurement.js`

- **ENHANCEMENT**: Variable Expenses - Validations & Settle Feature ✅
  - "Paid To (Vendor)" field is now mandatory
  - Transaction Reference mandatory for non-cash payments
  - When "Retail Only" vertical selected, shows Retailer dropdown (All/Specific retailer)
  - New "Settle" button in header opens vendor bulk payment modal
  - Vendor Payment Modal: Select vendor → See pending amount → Enter custom amount → Auto-allocate oldest first
  - **Employee Reimbursement Modal Redesigned**: Now matches vendor payment design
    - Editable reimbursement amount with "Full Amount" button
    - Real-time allocation preview showing which expenses will be settled (oldest to newest)
    - Transaction Reference mandatory for non-cash payments (Bank Transfer, UPI, Cheque)
    - Shows remaining pending after partial reimbursement
  - Files: `/app/frontend/src/pages/admin/VariableExpenses.js`

- **ENHANCEMENT**: Procurement - Employee Bulk Reimbursement ✅
  - Redesigned "Pending Employee Reimbursements" section
  - Groups pending procurements by employee with individual "Settle" buttons
  - Employee Reimbursement Modal (same design as Variable Expenses):
    - Shows total pending reimbursement for the employee
    - Editable amount with "Full Amount" button
    - Real-time allocation preview (oldest procurement first)
    - Transaction Reference mandatory for non-cash payments
    - Shows remaining after partial reimbursement
  - Files: `/app/frontend/src/pages/admin/Procurement.js`

### June 2, 2025 (Session 10 Cont.) - Performance, Credit Notes & UI Updates
- **OPTIMIZATION**: Retailer Create Order Page Load Time ✅
  - **Before**: Loaded all 85 products + 32MB of base64 images in one request
  - **After**: Categories load instantly (~46KB), images load on-demand when expanded
  - New API: `/api/products/images?ids=...` for lazy image loading
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/retailer/Dashboard.js`

- **NEW FEATURE**: One-Click Credit Note for Excess Payments ✅
  - When retailer has "Excess Paid" status, a "CN" button appears
  - One click creates a credit note for the exact excess amount
  - New API: `POST /api/retailer-credit-notes/from-excess`
  - Files: `/app/backend/server.py` (~line 11550), `/app/frontend/src/pages/admin/RetailerOrders.js`

- **ENHANCEMENT**: Payment Details Block - Credit Notes Display ✅
  - **Admin Portal**: Added Credit Notes card (3rd card) showing pending credit amount
  - **Admin Portal**: Total now shows net payable after credit adjustment
  - **Retailer Portal**: Renamed to "Pending Payment Details"
  - **Retailer Portal**: Changed color scheme from green to blue/indigo
  - **Retailer Portal**: Shows credit notes sum and net payable after adjustment
  - Credit notes now fetched for ALL retailers (not just 100% upfront)
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`, `/app/frontend/src/pages/retailer/Dashboard.js`, `/app/backend/server.py`

### June 1, 2025 (Session 10) - Stability & Login Improvements
- **FIX**: Retailer Portal Crash Prevention ✅
  - Changed `Promise.all` to `Promise.allSettled` in `loadData()` function
  - Added automatic retry mechanism (up to 3 attempts with exponential backoff)
  - Dashboard now loads gracefully even if some APIs fail
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (lines 307-380)

- **FIX**: LazyImage Component Improvements ✅
  - Added `isMounted` ref to prevent React state updates on unmounted components
  - Added fallback for browsers without IntersectionObserver support
  - Better error handling with try/catch around observer creation
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (lines 22-110)

- **FIX**: Login - Case-Insensitive Email ✅
  - Email login now works regardless of case (e.g., "TEST@GMAIL.COM" matches "test@gmail.com")
  - Uses MongoDB regex with case-insensitive flag
  - Files: `/app/backend/server.py` (login function ~line 845)

- **FIX**: Login - Phone Number Normalization ✅
  - Users can now login with phone number in ANY format:
    - Just 10 digits: `9876543210`
    - With +91 prefix: `+919876543210`
    - With spaces: `+91 98765 43210`
    - With 91 prefix (no plus): `919876543210`
  - Uses MongoDB aggregation to normalize stored contacts during comparison
  - Files: `/app/backend/server.py` (login function ~line 845)

- **NEW**: Contact Normalization Endpoint ✅
  - Added `/api/users/normalize-contacts` endpoint for admin to normalize all existing user contacts and emails
  - Removes spaces, dashes, and +91 prefix from contacts
  - Converts emails to lowercase
  - Files: `/app/backend/server.py` (~line 1050)

- **IMPROVEMENT**: User Creation/Update Normalization ✅
  - New users' contact numbers are now normalized on creation
  - Emails are stored in lowercase for consistent searching
  - Files: `/app/backend/server.py` (create_user, update_user functions)

### June 1, 2025 (Session 9) - Part 2
- **FEATURE**: Partial Reimbursement for Employee-Paid Procurements ✅
  - Added editable "Reimbursement Amount" field to settlement modal
  - Supports partial reimbursement (any amount up to or exceeding paid amount)
  - Creates employee credit when reimbursement exceeds purchase amount
  - Shows "Full Amount" quick-fill button
  - Displays real-time credit calculation in modal
  - Files: `/app/frontend/src/pages/admin/Procurement.js` (lines 206-225, 998-1040, 4137-4230)

- **FEATURE**: Expandable Farmer-wise Date Summary in Pending Payments ✅
  - Click farmer name or chevron icon to expand row
  - Shows date-wise purchase breakdown: Date | Purchase Amount | Paid | Pending | Pay Amount
  - Checkboxes for selecting individual purchases
  - Editable partial payment amounts per purchase
  - "Pay Selected" button appears when dates are selected
  - Shows totals row at bottom
  - Files: `/app/frontend/src/pages/admin/Procurement.js` (lines 3291-3596)

- **FEATURE**: Bulk Payment Tracking & Display ✅
  - Updated Bulk Payment Modal to show date-wise breakdown
  - Shows "(Partial)" indicator for partial amounts
  - Displays total payment amount with summary
  - Records payment reference against all selected purchases
  - Added `bulk_payment_reference`, `last_payment_reference`, `last_payment_mode` fields
  - Shows "Bulk Payment" badge on paid dates
  - Files: `/app/frontend/src/pages/admin/Procurement.js` (lines 1703-1757, 4070-4160)

### June 1, 2025 (Session 9)
- **FIX**: Retailer Portal Product Images ✅
  - Fixed API call to include `include_images=true` parameter
  - Catalogue API now correctly returns image_url field
  - Note: Products don't have images uploaded yet (showing placeholder icons is correct behavior)
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (line 303)

- **FEATURE**: Staff Attendance Enhancements ✅
  - **Date Restriction**: Date picker now limited to current month and last month only
    - Shows "(Editable: current & last month)" helper text
    - Uses min/max attributes on date input
  - **Daily Hours Column**: Renamed "WORKING HRS" to "DAILY HOURS"
    - Default value: 9 hours
    - Editable per labourer (range 0-12, step 0.5)
    - Appears before OT Hours column as requested
  - **Daily Hours Summary Card**: New purple summary card showing total daily hours
    - Added to the 4-card summary grid (Total, Present, Daily Hrs, OT Hours)
  - **Wage Calculation**: Daily hours affects wage calculation (hourly_rate × daily_hours)
  - Files: `/app/frontend/src/pages/admin/LaborCosts.js`, `/app/backend/routes/labour.py`

## Changelog (May 2025)

### May 29, 2025 (Session 8) - Part 5
- **FEATURE**: Payment Ledger in Admin Panel ✅
  - Added "Payment Ledger" button in Admin → Retailer Orders → Invoices tab (after Payment Summary)
  - Requires retailer selection first
  - Opens modal with same functionality as Retailer Portal:
    - Date range filter
    - Summary cards: Total Received, Credit Notes Applied, Total Transactions
    - Date-wise payment list (grouped by reference number)
    - Expandable dates showing invoice adjustments and credit notes
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

### May 29, 2025 (Session 8) - Part 4
- **FEATURE**: Payment Ledger Section in Retailer Portal ✅
  - Added "Payment Ledger" option in hamburger menu (between My Orders and Closing)
  - Shows all payments received from retailer, grouped by date
  - Payments with same reference number are summed and shown as one amount
  - Click on any date to expand and see:
    - Payment groups (by reference number) with mode and total amount
    - Which invoices each payment was adjusted against
    - Credit notes applied on that date
  - Date range filter to select custom period
  - Summary cards: Total Received, Credit Notes Applied, Total Transactions
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js`, `/app/backend/server.py`
  - New API: `GET /api/retailer-payment-ledger`

### May 29, 2025 (Session 8) - Part 3
- **FEATURE**: Complete Payment Details in Invoice PDF ✅
  - Downloaded invoice PDF now shows detailed payment history table:
    - Columns: #, Date, Mode, Reference, Amount
    - Total Paid row at bottom
  - Shows Credit Notes Applied section if any credits were used:
    - Columns: Credit Note #, Original Invoice, Applied Date, Amount
    - Total Credit Applied row at bottom
  - Payment mode and reference numbers now visible in PDF
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (downloadInvoicePdf function)

- **FEATURE**: Complete Payment Details in Expanded Invoice View ✅
  - Expanded invoice view now shows detailed payment history table (same format as PDF)
  - Credit Notes section fetches data dynamically when invoice is expanded
  - Shows: Credit Note #, Original Invoice, Applied Date, Amount in table format
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js` (toggleInvoiceExpand function updated to async)

### May 29, 2025 (Session 8) - Part 2
- **FEATURE**: "Excess Paid" Status Badge ✅
  - Invoices where `paid_amount > net_payable` now display:
    - Purple animated "Excess Paid" badge in the STATUS column
    - Pending column shows excess amount in purple (e.g., "₹288.25 excess")
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Credit Notes in Payment Details Modal ✅
  - "View Payment" modal now shows **Credit Notes Applied** section
  - Displays: Credit Note #, Original Invoice, Amount applied, Date applied
  - Both Admin panel (Payment History Modal) and Edit Invoice Modal updated
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Delete Credit Note Adjustments ✅
  - Edit Invoice modal now shows credit notes with delete option
  - New backend API: `POST /api/retailer-credit-notes/{credit_note_id}/remove-adjustment`
  - Removes credit adjustment and restores pending amount to credit note
  - Updates invoice paid_amount and payment status accordingly
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Invoice PDF with Payment Details ✅
  - Retailer invoice PDF now includes Payment Details section when paid:
    - Shows: Amount Paid, Payment Date, Payment Mode, Balance
    - Paid invoices show green "PAID" badge
    - Pending invoices show orange "PENDING" warning
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js`

- **FEATURE**: Payment Summary Button on Retailer Portal ✅
  - Added "Summary" button in Payment Details block header
  - Opens modal with SAME format as Admin panel:
    - Table columns: #, Date, Invoice #, Gross, Reject, MRP, Comm., Payable, Paid, Net Due
    - Green TOTAL footer row with all column sums
    - Net Receivable display at bottom
    - Download CSV button for export
    - Back button to close modal
  - New backend API: `GET /api/retailer-payment-summary` returns full invoice breakdown
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/retailer/Dashboard.js`

### May 29, 2025 (Session 8)
- **FEATURE**: Retailer Portal - 100% Upfront Payment Block ✅
  - For retailers with `upfront_collection_percentage = 100`, the Payment Details block now shows:
    - Purple/blue gradient theme (vs. green for standard retailers)
    - "(100% Upfront)" label in header
    - Two expandable cards: **Total Payable** and **Credit Notes**
    - Total Payable shows net amount after credit notes applied
    - Credit Notes shows pending credits with count
    - Date-wise breakdown when "Total Payable" is expanded (clickable to view item details)
    - Credit note details when "Credit Notes" is expanded
  - Standard retailers (50% upfront) retain the original layout with "50% Upfront" and "Final Payment" columns
  - Mobile-responsive design with optimized touch targets and text sizes
  - Files: `/app/frontend/src/pages/retailer/Dashboard.js`

- **BACKEND**: Updated APIs for 100% Upfront Support ✅
  - `/api/retailer-dashboard` now returns `upfront_collection_percentage` in retailer info
  - `/api/retailer-payment-details` now includes:
    - `upfront_collection_percentage` and `is_full_upfront` flags
    - `credit_notes` array for 100% upfront retailers
    - `totals.total_pending_credit` and `totals.net_payable` for credit-adjusted amounts
    - Correct upfront calculation: 100% upfront shows ALL pending as immediately due
  - Files: `/app/backend/server.py`

### May 28, 2025 (Session 7)
- **FIXED**: 100% Upfront Retailers Payment Calculation ✅
  - Backend APIs (`get_retailer_immediately_payable`, `get_all_retailers_immediately_payable`) now respect `upfront_collection_percentage`
  - For 100% upfront retailers: Full pending amount is due immediately on delivery (no 5-day credit split)
  - For standard retailers: Original 50% upfront + 5-day credit period logic preserved
  - Files: `/app/backend/server.py`

- **FEATURE**: Daily Purchase PDF - Category Segregation ✅
  - PDF now groups items by category: **Vegetables, Fruits, Exotic, Sprouts**
  - Each category shows:
    - Category header with item count
    - Items table with Serial #, Product Name, Purchase Req, Remarks
    - Category subtotal
  - Grand total shown at bottom
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Combined "Stickers & MRP" Tab ✅
  - Merged separate Stickers and MRP tabs into single "Stickers & MRP" tab
  - Table columns: **S No, Product, Variant, Sticker Quantity, MRP (₹), Blinkit (₹), Actions**
  - Sticker Qty shown in blue, pulled from indent data
  - Retained all MRP functionality: Copy from Previous Date, Fetch Blinkit Prices, Save MRP
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **IMPROVED**: Stock Status Error Handling ✅
  - Added detailed error messages showing actual failure reason
  - Added 30-second timeout for API calls
  - Files: `/app/frontend/src/pages/admin/StockStatus.js`

### May 27, 2025 (Session 6)
- **FEATURE**: Retailer Payment & Invoicing Upgrade - Credit Notes System ✅
  - **Credit Note Creation**: Generate credit notes from rejections against old invoices
  - **Models Added**: `RetailerCreditNote` with fields: credit_note_number, retailer_id, original_invoice_id, rejection_id, amount, status (pending/partial/adjusted), adjusted_amount, pending_amount, adjusted_against_invoices
  - **API Endpoints**:
    - `GET /api/retailer-credit-notes` - List all credit notes with filters
    - `GET /api/retailer-credit-notes/pending/{retailer_id}` - Get pending credits for payment
    - `POST /api/retailer-credit-notes` - Create credit note from rejection
    - `PUT /api/retailer-credit-notes/{id}` - **Edit credit note** (amount, remarks)
    - `POST /api/retailer-credit-notes/adjust` - Adjust credits against invoice
    - `DELETE /api/retailer-credit-notes/{id}` - Delete pending credit note
  - **Payment with Credit Adjustment**: 
    - `POST /api/retailer-invoices/{invoice_id}/payment` now accepts `credit_adjustments` array
    - Automatically updates credit note status and links to adjusted invoice
    - Payment record tracks: cash amount, credit applied, total settled, credit adjustments
  - **Auto Credit Note Generation** (NEW):
    - For **100% upfront retailers**, rejections automatically generate credit notes
    - Credit note is linked to the rejection's invoice
    - Toast notification shows auto-generated CN number and amount
    - Credit notes marked with `auto_generated: true` flag
  - **UI Components**:
    - **Credit Notes Tab** in Retailer Orders: Summary cards (Total Issued, Pending, Adjusted, Count) + table with all credit notes
    - **Payment Modal Enhancement**: "Available Credit Notes" section with checkboxes to select credits, amount input, "Total Credit Applied" summary
    - **Create Credit Note Button** in Rejections tab (CreditCard icon)
    - **Credit Note Creation Modal**: Shows rejection details, associated invoice, and creates credit note
    - **Edit Credit Note Modal** (NEW): Edit amount and remarks, shows rejection details, auto-generated indicator
    - **Edit/Delete buttons** in Credit Notes table (Edit visible for pending/partial, Delete only for pending)
  - Files: `/app/backend/server.py`, `/app/backend/models.py`, `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Upfront Collection Percentage ✅
  - Added `upfront_collection_percentage` field to User model (default 50% for retailers)
  - DB migration script on startup patches existing retailers with 50% default
  - Supports 100% upfront collection workflow where rejections generate credit notes

### May 25, 2025 (Session 5)
- **FEATURE**: Full Production Sync with Images ✅
  - New "Full Sync with Images" feature under Data Backup page
  - **Sync Modes**: Merge/Update (keep existing, update/add new) OR Replace All (fresh import)
  - **Include Images**: Option to sync all product images from production
  - Syncs ALL collections: products, retailers, indents, dispatches, invoices, catalogue, etc.
  - API: `POST /api/sync-from-production-full`
  - Files: `/app/backend/server.py`, `/app/frontend/src/pages/admin/Backup.js`

- **FIXED**: Dispatch Issues ✅
  - "Done" checkbox auto-checks when "Fill All Quantities" is clicked
  - Dispatch items now match correctly by `product_id` only (consistent with backend)
  - Fixed issue where unit-based variants (Pieces/Packets) weren't matching dispatches

- **FIXED**: Indent Variant Display for Pieces/Packets ✅
  - Now shows weight info: "Pieces (500+ gm)" instead of just "Pieces"
  - Dispatch modal auto-loads weight variants from catalogue for Pieces/Packets

### May 24, 2025 (Session 4)
- **UPDATED**: PDF & Excel Export for Daily Purchase Requirement ✅
  - **Removed "Qty (Units)" column** as per user request
  - PDF/Excel now shows: Serial, Product Name, **Purchase Req**, Remarks
  - Purchase Req format based on unit type:
    - **Piece**: "X Pcs of [weight]"
    - **Packet**: "X Pkts of [weight]"
    - **Bunch**: "X Bunches of [weight]"
    - **Default (Kg)**: "X.X Kg"
  - Trilingual support: English, Hindi (पीस, पैकेट, गुच्छे), Marathi (नग, पॅकेट, जुडे)

- **UPDATED**: Indent Variant Display Enhancement ✅
  - Indent tables now show enhanced variant descriptions:
    - "Piece of 500+ gm" instead of just "Pieces"
    - "Packet of 200+ gm" instead of just "Packets"
    - "Bunch of 350+ gm" instead of just "Bunches"
  - Works for products with `purchase_weights` configured in Retailer Catalogue
  - Applied to: Indent table, Dispatch table, Invoice table, Print/Export functions
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

### May 24, 2025 (Session 3)
- **FEATURE**: Retailer Catalogue Bulk Edit System ✅
  - **"Edit Catalogue"** mode with **"Save All Changes"** button for bulk editing
  - **Searchable Weight Multi-Select** - Type to search & select multiple weights
  - **Column renamed**: "Variants" → "Customer Display Variant"
  - **Multiple Weights support** - Unit is single, weights can be multiple
  - **Auto-sync logic**: Customer Display Variant auto-populates from Purchase Variant weights
  
- **FEATURE**: Unit-Based Variant Display ✅
  - When Purchase Variant unit is **"Piece"** or **"Packet"**, it displays as a variant on retailer portal
  - Blue-styled buttons for unit variants, green for weight variants
  - Backward compatible with legacy data (shows unit even if not in variants array)
  - Files: `/app/frontend/src/pages/admin/Products.js`, `/app/frontend/src/pages/retailer/Dashboard.js`, `/app/backend/server.py`

### May 24, 2025 (Session 2)
- **VALIDATED**: High/Low Selling Logic with 5% Threshold ✅
  - Threshold now calculated against **total overall supplied** (not just rejected products)
  - Example: If total supplied qty = 3,256 → 5% threshold = 163 units
  - Summary cards show: Total Supplied Qty, Total Supplied Value, 5% Threshold values
  - High Selling (4 products) and Low Selling (54 products) correctly segmented
  - Files: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **VALIDATED**: Customer Details Modal Working ✅
  - Flow: Dashboard → Customers tab → Retail "View Details" → Customer row "Details"
  - Shows date-wise P&L breakdown with all metrics
  - Added data-testid to QC/Retail cards for better testability
  - Files: `/app/frontend/src/pages/admin/Dashboard.js`

### May 24, 2025 (Session 1)
- **FEATURE**: High/Low Selling Product Tabs & Alphabetical Dropdown ✅
  - **Product Deep Dive Dropdown**:
    - Now sorted alphabetically (A-Z) for easier searching
    - Shows product name only (no percentage)
  - **High Selling / Low Selling Tabs** (Both Count % and Value % blocks):
    - **High Selling**: Products with ≥5% of total units supplied
    - **Low Selling**: Products with <5% of total units supplied
    - Shows count of products in each category (e.g., "High Selling (1)" / "Low Selling (57)")
    - Each product row shows: Name, Sales % contribution, Rejection %, qty details
    - Sorted by highest rejection % within each category
    - Scrollable list to see all products in each category
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Product-Level Rejection Analysis Deep Dive ✅
  - **Split "Highest Single Rejection" Block**:
    - Left side: Shows highest single rejection (product, shop, date, value, reason)
    - Right side: "Product Deep Dive" with dropdown selector + View button
  - **New Product Drilldown Modal** (select any product):
    - **Summary Row**: Supplied Qty, Supplied Value, Rejected Qty, Rejection Loss
    - **Rejection % Cards**:
      - By Count: Rejected Qty / Supplied Qty (e.g., 70.0% = 7/10)
      - By Value: Rejection Value / Supplied Value (e.g., 67.4% = ₹155/₹230)
    - **Rejection % by Shop**: Ranked list showing which shops reject this product most
    - **Rejection Reasons**: Breakdown by reason (Damaged, Rotten, etc.)
    - **Rejection by Day of Week**: Visual bar chart
    - **Rejection by Date**: Expandable rows showing daily breakdown with details
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Enhanced Rejection Analytics with Proper % Calculations and Expandable Dates ✅
  - **Fixed Rejection % Calculation**:
    - Now properly loads ALL dispatches within the rejection date range (not just single-day filter)
    - Rejection % = (Rejected Qty / Supplied Qty) × 100
    - Value % = (Rejection Value / Supplied Value) × 100
    - Shows actual numbers: "7 / 10 qty" format
  - **Two Product Ranking Sections**:
    - **By Product (Count %)**: Sorted by rejected qty / supplied qty, descending
    - **By Product (Value %)**: Sorted by rejection value / supplied value, descending
  - **Shop Names Throughout**:
    - All displays use `company_name` (shop name) instead of owner name
  - **Clickable Shop Rows with Drill-down**:
    - Shows Rejection %, Rejected, Supplied, Total Loss summary cards
    - Products ranked by % contribution at that shop
    - Date-wise rejection table for that shop
  - **Expandable Date Rows**:
    - Each date row shows: Date, Day, Count, Qty, Value
    - Click to expand and see detailed table:
      - Product, Shop, Qty, Reason, Value columns
      - All individual rejection entries for that day
  - **Visual Day-of-Week Chart**: Bar chart showing rejection values per day
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FEATURE**: Enhanced Rejection Analytics Modal with Advanced Insights ✅
  - **Improved Rejection Loss Block Layout**:
    - Fixed date picker alignment with dedicated "Period:" row
    - Added "View Details" button in header
    - Shows top rejected product in bottom-right corner
    - Better visual hierarchy with icon, stats, and metadata
  - **New Rejection Analytics Modal** (triggered by View Details button):
    - **Summary Cards**: Total Loss, Total Qty, Rejections count, Avg/Day
    - **Highest Single Rejection Highlight**: Product, Retailer, Date, Value, Reason
    - **By Product (Max to Min)**: Ranked list with qty and value
    - **By Retailer (Max to Min)**: Ranked list with rejection count
    - **By Reason**: Aggregated by rejection reason (Damaged, Rotten, Quality Issue, etc.)
    - **By Day of Week**: Visual bar chart showing which days have most rejections
    - **Date-wise Breakdown**: Table with Date, Day, Count, Qty, Value (latest first)
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FIX**: Hamburger Menu Auto-Open on Mobile ✅
  - Fixed race condition where sidebar could auto-open on mobile due to incorrect state initialization
  - Changed `isMobile` initial state to calculate immediately from `window.innerWidth`
  - Modified useEffect to explicitly close sidebar on mobile, open on desktop
  - Files modified: `/app/frontend/src/components/Layout.js`

- **FIX**: "Failed to Load Data" Error with Retry Logic ✅
  - Added `fetchWithRetry` helper with 3 retry attempts and exponential backoff
  - Changed from `Promise.all` to `Promise.allSettled` so partial failures don't break entire load
  - Increased API timeout from 30s to 45s for cold starts
  - Added automatic retry after 3 seconds if all data sources fail
  - Files modified: `/app/frontend/src/hooks/useQCData.js`, `/app/frontend/src/utils/api.js`

- **REVERTED**: AI Demand Forecasting removed per user request
  - Removed backend API `/api/reports/demand-forecast`
  - Removed frontend states and fetch logic from Dashboard.js

### May 23, 2025
- **FIX**: Customer Detail Modal - Correct P&L Calculations & Column Order ✅
  - **Gross P/L formula corrected**: Sales - COGS - Wastage - Rejection (per day)
  - **Net P/L added**: Gross P/L - Commission (per day)
  - **Column order updated to match summary**: DATE, SALES, QTY, COGS, WASTAGE, REJECTION, GROSS P/L, GM%, COMMISSION, NET P/L, NM%, ₹/UNIT
  - **Exact rejection per date**: Fetches rejection data by retailer_id and date from API
  - Backend: `/api/retailer-rejections` queried for date-wise rejection by retailer
  - Files modified: `/app/frontend/src/pages/admin/Dashboard.js`

- **FEATURE**: Language Toggle for Indent & Dispatch Tabs ✅
  - **Indent tab**: Added language dropdown (English/Hindi/Marathi) - affects expanded view and PDF export
  - **Dispatch tab**: Added language dropdown before Export button - affects expanded view and CSV export
  - Uses product translations from products collection (name_hi, name_mr)
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js`

- **FIX**: Currency Format & Date-wise Rejection Display ✅
  - **Indian Currency Format**: All amounts now use Lakhs (L) format from `formatCurrency()` function
    - ₹6.3L instead of ₹6.3K for amounts ≥1 Lakh
    - Applied to vertical cards and modal header summary
  - **Date-wise Rejection**: Added REJECTION column in Customer Detail modal
    - Shows rejection amount and % distributed proportionally by daily sales
    - Formula: `day_rejection = total_rejection × (day_sales / total_sales)`
  - **Date Sorting**: Customer detail date-wise breakdown now sorted descending (latest first)
    - 23 May appears on top, then 22 May, etc.
  - Files modified: `/app/frontend/src/pages/admin/Dashboard.js`

- **FIX**: Customer-wise Sales Dashboard - Accurate Metrics Per Retailer ✅
  - **Avg Profit/Day in Cards**: Changed from "Avg Sales/Day" to "Avg Gross Profit/Day" (based on actual sales days)
  - **Avg Sales/Day per Customer**: Now uses customer's actual `sales_days` from API instead of date range
    - Tamanna Mart: ₹51,720 / 22 days = ₹2,351/day (was incorrectly using 23 days)
  - **Actual Rejection per Retailer**: Backend now tracks rejection by `retailer_id` instead of proportional distribution
    - Tamanna Mart: 13.0% rejection, Savtamali: 6.3% rejection (was all showing 12.5%)
  - **GM% and NM% now vary per customer**: Based on their actual rejection, not proportional distribution
  - **Customer names now show sales days**: e.g., "Tamanna Mart (Retail) (22d)"
  - Backend files modified: `/app/backend/server.py` (rejection_by_retailer tracking, retailer_id in sales_by_customer)
  - Frontend files modified: `/app/frontend/src/pages/admin/Dashboard.js`

- **FIX**: Customer-wise Sales Dashboard P&L Formula Corrections ✅
  - **Gross P/L**: Corrected to Sales - COGS - Wastage - Rejection (was using API's gross_profit which excluded rejection)
  - **Net P/L**: Corrected to Gross P/L - Commission (was using API's net_profit which included variable expenses)
  - **GM%**: Now calculated from corrected Gross P/L / Sales
  - **NM%**: Now calculated from corrected Net P/L / Sales
  - **Avg/Day**: Fixed to show Sales/Days (was showing Gross Profit/Days incorrectly)
  - **Added Rejection %**: New column showing Rejection/Sales * 100
  - **Removed comparison charts**: Simplified to text notification when retailers are selected
  - Verified: Tamanna Mart (₹51,720 sales, 23 days) → Avg/Day = ₹2,249 ✅

- **FEATURE**: Customer-wise Sales Dashboard Redesign ✅ (P0 - VERIFIED)
  - **Vertical Grouping**: Customers tab now shows two clickable vertical cards (Quick Commerce vs Retail)
  - **Vertical Cards Display**: Sales, COGS, Wastage, Gross P/L (%), ₹/Unit, Avg/Day for each vertical
  - **Date Picker**: Added date range filter at top of Customers tab
  - **Drill-down Modal**: Clicking a vertical card opens modal with comprehensive metrics:
    - Header: Sales, Qty, Avg Sales/Day, COGS, Wastage, Rejection, Gross P/L (%), Commission, Net P/L (%), ₹/Unit
    - Customer Table: All above metrics per customer with comparison checkboxes
    - TOTAL row with aggregated values
  - **Multi-Customer Comparison**: Retail modal includes "Select retailers to compare" with checkboxes
  - **Bug Fix**: Fixed COGS showing ₹0 - was using wrong field `cogs` instead of `cogs_share` from API
  - **React Hook Fix**: Fixed conditional useMemo error by moving hooks before loading conditional return
  - Files modified: `/app/frontend/src/pages/admin/Dashboard.js`
  - All features verified working via screenshots

### May 22, 2025
- **FEATURE**: Added Partial Reimbursement support in Variable Expenses
  - New "Reimbursement Amount" field in modal with ₹ prefix
  - Tracks `total_reimbursed` and `settlement_status` (pending/partial/settled)
  - Shows amber warning for partial payments
  - Settlement column displays progress (e.g., "₹2,500 / ₹5,000")
  - Updated pending reimbursement calculation to show remaining amounts
  - Files modified: `/app/frontend/src/pages/admin/VariableExpenses.js`

- **BUG FIX**: Fixed Employee Reimbursement calculation showing ₹0 in Variable Expenses
  - Root cause: Filter incorrectly required `payment_status === 'paid'` for employee-paid expenses
  - Solution: Changed filter to only check `paid_by_type === 'employee' && settlement_status !== 'settled'`
  - Files modified: `/app/frontend/src/pages/admin/VariableExpenses.js` (4 locations)
  - Result: Pending Reimbursement now correctly shows remaining amounts

- **BUG FIX**: Fixed Marathi product names not appearing in Daily Purchase PDF/Excel
  - Root cause: Export functions used cached translations from dailyReqData instead of fresh product data
  - Solution: Modified `printDailyRequirement()` and `exportDailyReqToExcel()` to build fresh translation map from products array
  - Files modified: `/app/frontend/src/pages/admin/RetailerOrders.js` (2 functions updated)
  - Result: PDF/Excel now shows latest translations immediately after updating in Products page

- **FIX**: Added `product_name_hi` and `product_name_mr` to saveDailyRequirement payload

### Previous Session (May 21-22, 2025)
- Mobile remarks layout (card-based) for Daily Purchase table
- GRN Date filters with 5-day default span
- Remarks carry-forward via `/api/retailer-daily-requirement/saved` endpoint
- Purchase Qty rounding (minimum 1kg, Math.ceil for decimals)
- "Paid To" filter in Variable Expenses
- Payment Details redesign in Retailer Portal
- Rejection Qty bug fix (item-level sync)

---

## Original Problem Statement
End-to-end full-stack system for a fruits and vegetables retail and quick commerce business. The system manages inventory, procurement, sales, wastage tracking, and comprehensive P&L reporting.

## User Personas
- **Admin**: Full system access, P&L reporting, user management
- **Staff**: Daily operations, stock status, procurement
- **Retailer**: Order management, dispatch tracking

## Core Features

### Implemented ✅
- Multi-portal system (Admin, Staff, Retailer)
- Automated indent generation
- Variant-based inventory (QC Packaging)
- Daily stock status tracking with mandatory closing validation
- Wastage Dashboard with correct % formula: `Wastage / (Opening + Purchase)`
- Product-level P&L with consistent wastage calculations
- Customer P&L (QC: GRN Loss, Retail: Commission)
- Variable expenses by vertical (QC/Retail isolation)
- Fixed expenses (excluded from Customer P&L)
- Data backup system (29 collections)
- Direct API Sync for production data
- Historical wastage value fix mechanism
- Dual language support (English/Hindi)
- Excel export functionality
- Size field for Bunch, Packet, Piece units in Procurement
- Auto-recalculate wastage when procurement is updated for closed days
- **Unified GRN Loss calculation across QC Dashboard and P&L** (shared helper function)
- **Date-wise Retail Rejection tracking with historical display**
- **Paid By filters with employee dropdown in Variable Expenses**
- **Unit conversion: Bunches/Packets/Pieces to kg for stock tracking**

### Completed (This Session - 17 May 2026 - Continued)
- **Daily MRP Tab for Retail Products** ✅ (Verified)
  - New "MRP" sub-tab added in Daily Requirement section (after Purchase and Stickers)
  - **Products filtered by day's indents**: Only shows unique products present in that day's combined retailer indents (mirrors Stickers tab logic)
  - Products grouped by category with **all categories expanded by default** (click to collapse)
  - Table columns: S.No (#), Product Name, Variant (dropdown), MRP (₹ input), **Blinkit (₹)** (comparison price), Actions (delete)
  - **Variants pre-populated from last sold variants** - fetched from recent dispatches
  - Variant dropdown filtered to show only retail-applicable variants
  - Inline editing: MRP values and variants editable directly in the table
  - Delete functionality: Remove individual entries with trash icon
  - Add new products: "+" button per product row and "Add product with specific variant" section
  - **Same product can be added with multiple variants** (for different pack sizes)
  - **Duplicate product+variant validation** - prevents same combo being added twice
  - Date selector: Pick date to view/edit MRP for that date
  - **Footer shows**: "X items with MRP | Y products without MRP | **Z items with ₹0 MRP**" (in red)
  - **Category header shows**: "X items with ₹0 MRP" instead of total sum
  - "Save MRP" button: Batches all pending changes and saves at once
  - "Copy from Previous Date" button: Copies all MRP entries from the previous day
  - "Initialize (X Products)" button: Auto-populates products from day's indents with their last sold variants
  - **Empty state**: Shows helpful message when no indents exist for selected date
  - Admin-only editing for past dates: Staff can only edit today/future, Admins can edit any date
  
- **Blinkit Price Scraper Integration** ✅ (Verified)
  - **"Fetch Blinkit Prices" button** in MRP tab to manually trigger scraping
  - **Blinkit (₹) column** added to MRP table showing competitor prices
  - Price comparison color coding: Green (we're cheaper), Red (we're expensive), Orange (same/no data)
  - **Automated daily scraping at 6 AM IST** using APScheduler
  - Location-aware scraping based on **retailer pincode** (default: 411045)
  - Playwright-based web scraper for Blinkit website
  - Backend APIs:
    - `GET /api/blinkit-prices?date=YYYY-MM-DD` - Fetch scraped prices for a date
    - `GET /api/blinkit-prices/latest?pincode=XXXXXX` - Get latest prices per product
    - `POST /api/blinkit-prices/scrape?pincode=XXXXXX` - Trigger manual scrape
    - `GET /api/blinkit-prices/mapping` - Get product name mappings
    - `PUT /api/blinkit-prices/mapping/{product_id}` - Update Blinkit search term for a product
  - New MongoDB collection: `blinkit_prices` storing scraped prices with date, pincode, product mapping
  - Scraper file: `/app/backend/blinkit_scraper.py`

### Completed (This Session - 18 May 2026)
- **Immediately Payable Feature (5-Day Credit Period)** ✅
  - **Backend APIs**: 
    - `GET /api/retailer-immediately-payable` for individual retailer
    - `GET /api/admin/all-retailers-immediately-payable` for admin summary
  - **Logic**: 50% on delivery day + Remaining 50% after 5 days + Overdue amounts
  - **Admin Portal**: Shows shop names (company_name), 3-card breakdown, retailer-wise summary
  - **Retailer Portal**: 
    - Fixed card title to "Immediately Payable" (was showing translation key)
    - Changed Invoices link from span to button for proper click handling
    - All 3 cards always visible (50% Upfront, 5-Day Credit Due, Overdue) with empty state messages

- **Shop Name Display Fix** ✅
  - Admin portal now shows `company_name` (shop name like "Tamanna Mart") instead of owner name

### Completed (This Session - 19 May 2026)
- **Dynamic Rejection Calculation Fix for Immediately Payable** ✅ (P0 - VERIFIED)
  - **Problem**: `net_payable` stored in invoices doesn't account for rejections (stored separately by date+retailer)
  - **Fix**: Both `/api/retailer-immediately-payable` AND `/api/admin/all-retailers-immediately-payable` now:
    1. Fetch rejections from `retailer_rejections` collection by date+retailer_id
    2. Calculate: `Net after rejection = Gross - Rejections`
    3. Calculate: `Commission = Net after rejection × commission_percentage`
    4. Calculate: `Final Payable = Net after rejection - Commission`
  - **Verified**: Jai Bhawani May 13 overdue now correctly shows ₹240.10 (was ₹537)

- **MRP Tab - Complete Rewrite** ✅
  - Variants load directly from indents (product+variant combinations)

- **Stickers Tab - Collapsible Categories & Customer Details** ✅

- **Marathi Translation Fix & PDF/Excel Export Simplified** ✅

### Completed (This Session - 19 May 2026)
- **Daily Purchase Requirement Multilingual PDF/Excel Export** ✅
  - Added language selector dropdown (English/Hindi/Marathi) next to PDF and Excel buttons
  - PDF export now uses selected language for all labels: title, date, headers, column names, totals
  - Product names display in Hindi when translation exists, falls back to English with `*` marker if missing
  - Excel export also respects selected language with proper Unicode (BOM) support
  - Shows note on PDF when products have missing translations (e.g., "* 5 product(s) missing Hindi translation")
  - Date formatting uses locale-appropriate format (hi-IN, mr-IN, en-IN)
  
- **All Product Translations Populated** ✅
  - Auto-populated Hindi and Marathi translations for all 86 products
  - Created `/api/admin/populate-all-translations` endpoint for production use
  - Coverage: 86/86 Hindi (100%), 86/86 Marathi (100%)

- **Dispatch "Done" Checkbox Feature** ✅
  - Added "Done" checkbox column in dispatch modal (next to Total column)
  - Auto-checks when Supply Qty >= Indent Qty
  - Users can manually check for partial supply scenarios (short supply)
  - Items marked as "Done" won't appear in subsequent "Dispatch Remaining" actions
  - Backend API: `POST /api/retailer-indents/{id}/mark-items-done`
  - Row highlighting: Green background when marked done

### Note on 50% Today's Delivery
The 50% upfront amount only shows for **invoices**, not dispatches. If a dispatch was created but no invoice was generated, the amount won't appear. Invoices need to be created separately from dispatches.

### In Progress
- **Codebase refactoring Phase 2** (server.py ~13,800 lines - CRITICAL)
  - ✅ Labour Management routes moved to `/app/backend/routes/labour.py`
  - Pending: More route extractions to reach target <8,000 lines
- Labor "Inactive" UI clarity improvements (soft-delete confusion)

### Blocked
- WhatsApp Integration (awaiting credentials)
- APScheduler reliability (architectural decision needed)

### Backlog
- Hindi language E2E testing
- AI-powered demand forecasting

### Completed (This Session - 17 May 2026)
- **Daily Requirement Auto-Load Feature** ✅ (Verified)
  - Daily Requirement tab now auto-calculates on tab selection (no manual "Calculate" click needed)
  - Date defaults to today's date on load
  - Auto-refreshes when date is changed
  - Both Purchase and Stickers sub-tabs auto-load their respective data
  - "Calculate" button renamed to "Refresh" for optional manual refresh

- **Category-Based Collapsible Grouping** ✅ (Verified)
  - Purchase and Stickers tabs now group items by category (Vegetables, Leafy, Fruits, Exotic, Other)
  - Categories are sorted in predefined order for consistency
  - Click to expand/collapse each category
  - Category headers show summary totals (Units, Qty Kg, Requirement Kg for Purchase; Qty for Stickers)
  - Each category has category-total row at bottom when expanded
  - Grand total row at bottom shows overall totals
  - Categories auto-expand when data loads

- **Dynamic Categories & Types Management** ✅ (Verified)
  - New "Categories & Types" tab added in Products page
  - Admins can add, edit, and delete Product Categories and Product Types
  - Categories and Types are stored in MongoDB (`product_categories`, `product_types` collections)
  - Backend auto-seeds default Categories and Types on startup (Vegetables, Leafy, Fruits, Exotic, Herbs, Mushrooms, Others)
  - Product edit/add form now uses dropdown selects for both Category and Type (populated from database)
  - Product list already displays both TYPE and CATEGORY columns
  - When a category/type is renamed, all products using it are automatically updated

- **Retailer Self-Service Indent System** ✅ (Verified)
  - Renamed "Pending Orders" tab to "Orders" in Retailer Portal
  - Added "Create Indent" button in Orders section
  - Create Indent modal with:
    - Date picker (defaults to next day)
    - Products grouped by Type in collapsible sections
    - Variant dropdown and Quantity input for each product
    - "0 items selected" counter
  - Time restriction: Retailers can edit indents only until 10 PM IST on the indent date
  - Indents created by retailer are marked with `created_by_retailer: true` in database
  - Admin portal shows "Generated by Retailer" marker on retailer-created indents
  - Edit button shown for pending indents within edit window

- **Vertical-Specific Packaging Variants** ✅ (Verified)
  - Added "Applicable For" field to packaging variants with options: QC Only, Retail Only, Both
  - Packaging table now shows "Applicable For" column with colored badges (Blue=Both, Orange=QC, Green=Retail)
  - Edit Packaging dialog includes "Applicable For" dropdown with helper text
  - Retailer Portal Create Indent modal only shows variants marked for "Retail" or "Both"
  - Admin Retailer Orders indent form only shows retail-applicable variants
  - Backend POST/PUT endpoints updated to accept and store `verticals` array

- **Product Image Upload** ✅ (Verified)
  - Added image upload capability when creating or editing products
  - Upload area with dashed border and "Upload Image" placeholder
  - Image preview with remove button (X) after selection
  - File validation: JPEG, PNG, WebP only, max 5MB
  - Product list shows image thumbnails (or placeholder icon if no image)
  - Backend endpoint `/api/products/upload-image` for file uploads
  - Static files served from `/uploads/products/` directory
  - Product model updated with `image_url` field

- **Retailer Indent: Product Images & Hindi Support** ✅ (Verified)
  - Create Indent modal shows product images (48x48 thumbnails)
  - Click on image to enlarge (opens full-screen modal with product name)
  - Zoom icon overlay appears on hover
  - Hindi translations shown when language is set to Hindi:
    - Primary name shows Hindi (e.g., "हरा चौलाई")
    - English name shown as secondary text below
  - Placeholder icon shown for products without images
  - Variant dropdown and Qty input labels also translate to Hindi

- **Mobile Responsive Retailer Orders** ✅ (Verified)
  - Orders tab with compact icon-based tabs (mobile shows icons + badges only)
  - "New" button on mobile (full "Create Indent" on desktop)
  - Create Indent modal optimized for mobile:
    - Full-screen modal with proper padding
    - Stacked date picker layout
    - Compact type headers with checkmark count
    - Product rows with image, name, variant dropdown and qty input
    - Fixed footer with Cancel/Submit buttons
  - Products grouped by type with collapsible sections
  - Image enlargement modal with full-screen view

### Completed (Previous Session - 16 May 2026)
- **Employee Procurement Payment Tracking Fixes** ✅ (Verified)
  - **Issue**: Newly recorded partial payments by employees were NOT showing purple highlighting
  - **Issue**: Reimbursement summary in Cashflow NOT updating for employee payments
  - **Issue**: View button missing for partially paid procurements
  - **Backend Fix**: `create_procurement_payment` endpoint now sets `paid_by_type` and `paid_by` on parent procurement document (not just on payment record)
  - **Backend Fix**: `update_procurement_payment` and `delete_procurement_payment` endpoints now recalculate `paid_by_type` based on all remaining payments
  - **Backend Fix**: Added new `/api/procurement-payments` endpoint with date filtering for Cashflow reimbursement tracking
  - **Frontend Fix**: View button (Eye icon) now shows for partial payments alongside Pay button (both visible when `pending_amount > 0` AND `paid_amount > 0`)
  - **Frontend Fix**: Purple row highlighting via inline styles for employee pending settlements
  - **Frontend Fix**: Cashflow Reimbursements tab now fetches payment-level data for accurate employee reimbursement tracking
  - Test data verified: Procurement with ₹200 partial payment by Shradha Salunke shows correct purple highlighting and appears in Cashflow Reimbursements

### Completed (Previous Session - 15 May 2026)
- **Retailer Portal Enhancements** ✅ (Verified)
  - **Serial Number in Invoice Details**: Added `#` column showing 1, 2, 3... for each item in expanded invoices
  - **Pending Orders Date-wise Collapsible View**: Replaced scrollable list with expandable date rows showing Date, Count of Orders, No of Items, Status columns
  - **Invoice Tab - Paid Amount Column**: Added PAID AMOUNT column between Commission and Net Payable
  - **PDF Download Restriction**: Download PDF icon only enabled for fully paid invoices (grayed out for pending)
  - **Payment Timestamp in Expanded Invoice**: Shows "Payment Details:" section at bottom with payment date, time, amount, and payment mode

- **Dashboard P&L Table Column Alignment & Sticky Header** ✅ (Verified)
  - Fixed QC and Retail vertical rows to have 14 columns (was 12-13)
  - Fixed QC Customer rows and Product/Item rows column alignment
  - Added **sticky header** that stays visible when scrolling through expanded rows
  - Added `max-h-[70vh] overflow-y-auto` container for table scrollability

- **Retailer Invoice "Final Payable" Inline Display** ✅ (Verified)
  - "Final Payable" now displays inline with Commission in 5-column grid
  - Styled with `font-bold text-blue-700` for visibility

- **Edit Payment & Timestamp Display Feature for Retailer Orders** ✅ (Verified)
  - Added **Edit Payment functionality** in Payment History modal
  - Added **View button for Partial invoices**
  - Added **Earlier Payments section** with timestamps

- **Procurement Payment Edit/Delete & History Feature** ✅ (Verified)
  - Created new `procurement_payments` collection
  - Added CRUD APIs for procurement payments
  - Updated Procurement.js with edit/delete buttons and payment history display
  - Partial payment status now shows employee name and settlement status

- **Dispatch Edit Enhancements** ✅ (Verified)
  - Added **Delete button (X)** for each dispatch line item when editing
  - Added **Variant dropdown** to edit packaging variant in dispatch
  - Added **"Fill Yesterday's MRP" button** to auto-populate MRP from yesterday's dispatches (matched by product + variant)
  - Added backend API: `GET /api/retailer-dispatches/yesterday-mrp`
  - Widened dispatch modal from `max-w-2xl` to `max-w-4xl` to fit all columns

### Completed (Previous Session - 11 May 2026)
- **Labor Costs Export & Payroll Processing Features** ✅ (Verified)
  - Added **Export CSV button** on Daily Costs tab for attendance download (name, days present, overtime hours, total payment)
  - Added **Payroll Processing tab** next to Manage Labourers with:
    - Date range selector
    - Summary cards (Total Payroll, Labourers count, Man Days, OT Hours)
    - Detailed payroll table with: #, Name, Bank A/C, IFSC, Days, OT Hrs, Amount
    - **Export for Netbanking** button with customizable field selection modal
  - Export modal allows selecting fields based on bank requirements (Name, Bank Account, IFSC, Amount, Days, OT Hours, Daily Rate, OT Rate, Date Range, Phone)
  - CSV download for uploading to netbanking portals

- **Dashboard P&L Wastage Fix** ✅ (Verified)
  - Fixed `/api/reports/pnl` endpoint to use fresh procurement data for wastage calculation
  - Dashboard Overview, Products tab, and Date-wise Details popup now show correct wastage
  - Apple - Royal Gala on May 8: Was showing ₹1,599 (68.3%), Now shows ₹39 (5.0%) ✅
  - Created `fresh_purchases_by_date_product` lookup to recalculate wastage dynamically
  - Both wastage total calculation and product_wastage_summary now use fresh procurement data

- **Stock Status Wastage Calculation Bug Fix** ✅ (Verified)
  - ROOT CAUSE: `purchase_qty` was being corrupted (multiplied ~3x) in `daily_stock_status` collection due to duplicate API calls or race conditions
  - FIX: Modified `/stock-status/close` endpoint to use FRESH procurement data instead of stored `purchase_qty`
  - FIX: Modified `/stock-status/closable-products` to also use fresh procurement data for closed entries
  - Created new endpoint `/api/stock-status/fix-corrupted-purchase-qty` to repair existing corrupted data
  - Fixed 17 corrupted records including: Apple (9→3), Mango (9→3), Watermelon (36→12), Muskmelon (7.5→2.5)
  - Wastage now correctly calculated: e.g., Apple 0.15kg (was 6.15kg), Watermelon 0kg (was 24kg)

- **Retailer Invoice Rejection Enrichment** ✅ (Verified)
  - Older invoices created before rejection tracking now show rejection data
  - Dynamic enrichment queries `retailer_rejections` collection using `dispatch_ids`
  - Handles legacy string-serialized `dispatch_ids` via `ast.literal_eval`
  - Invoice modal displays: Rejection total (-₹665.00), per-item rejection counts (-3, -1)

### Completed (Previous Session - 05 May 2026)
- **Record Rejection Performance Fix** ✅
  - Created batch API endpoint `/api/retailer-rejections/history-batch` 
  - Fetches rejection history for ALL products in one call instead of N individual calls
  - Modal now loads within 3 seconds instead of 15-30+ seconds
- **Rejection Recorded Timestamp Display** ✅
  - Rejections tab now shows "Recorded: DD MMM YYYY at HH:MM" when date row is expanded
  - Record Rejection modal history shows "(Recorded: DD MMM at HH:MM)"
- **Previous Rejections Now Filter by Date** ✅
  - Fixed: "Previous Rej." column now ONLY shows rejections for the SELECTED dispatch date
  - Previously showed ALL historical rejections across all dates (incorrect behavior)
  - API now accepts `rejection_date` parameter to filter correctly
- **Rejection Quantity Display Fixed** ✅
  - Changed from "X kg" to "X units" in all displays
  - Shows proper unit count, not misleading kg values
- **Rejection Validation Added** ✅
  - New rejection qty cannot exceed (supplied_qty - already_rejected_for_this_date)
  - Error message shows: "Cannot exceed remaining qty. Supplied: X, Already rejected: Y"
- **P&L grn_qty_kg Revert** ✅
  - Reverted selling_price_per_kg calculation to use supplied_kg instead of grn_qty_kg
  - User requested this change to be reversed

### Completed (Previous Session - 27 Apr 2026)
- **OCR QC Order Processing** ✅
  - GPT-4o integration via emergentintegrations library for image OCR
  - Extracts NC SKU ID, UOM, CA (unit type), UNITS (total demand), Mr Organix (order qty)
  - 100% product matching rate with existing database products
  - Preview modal with editable fields (quantity, lot size)
  - Checkbox selection for items to include in indent
  - Create Indent button generates QC indent with source='ocr' marker
- **Cashflow Receivables Date Filter Fix** ✅
  - Summary cards now correctly filter retail invoices by selected date range
  - Previously showed all-time totals (₹16.5K) instead of date-filtered amounts (₹2.6K)
- **Labour-wise Summary Expandable Rows** ✅
  - Click on any labour name to expand and view day-wise attendance details
  - Shows DATE, HOURS, OVERTIME, PAYMENT columns for each day
  - Inline editing: click edit icon to edit hours/overtime
  - Save updates attendance record via API with success toast

## Technical Architecture

### Backend
- FastAPI with MongoDB
- APScheduler for cron jobs (reliability issues noted)
- Resend for email notifications
- **Modular routes in `/app/backend/routes/`** (partial - labour.py active)

### Frontend
- React with Shadcn/UI components
- Tailwind CSS styling
- i18next for internationalization

### Key Data Models
- `daily_stock_status`: Opening, Purchase, Wastage, Dispatch, Closing
- `qc_packaging`: QC variants
- `variable_expenses`: Vertical field (qc/retail/all), paid_by field
- `labours`: Soft delete with `is_active` flag
- `retailer_rejections`: Date-wise rejection tracking with `rejection_date`

## Recent Changes (April 2026)

### Current Session (21 Apr 2026) - Part 2
1. **GRN Mark All Paid Popup** - Shows payment details modal instead of confirm dialog
   - Payment Date, Payment Mode, Reference/Transaction ID, Remarks fields
   - Button changes to "All Paid" badge after successful marking
2. **View/Edit GRN Payments** - Added Eye icon to view/edit payment details for paid items
3. **Fixed Expenses Date Field** - Changed from month/year dropdowns to full date picker
   - Backward compatible with existing month/year data
4. **Cashflow Fixed Expenses Filter** - Now correctly filters by date field
   - Shows ₹75.0K for April Fixed Expenses
5. **Variable Expenses Migration** - Added migration endpoint to set `paid_by_type` for past entries
   - 25 company expenses + 33 employee expenses migrated
   - All past Ankush expenses now show "Settled" status

### Current Session (21 Apr 2026) - Part 1
1. **Fixed Cashflow QC GRN ₹0.00 Bug** - Changed `item.date` to `item.dispatch_date` in Cashflow.js
   - QC (Ninjacart) now correctly shows receivables (₹4.99L for Apr 1-21)
2. **Fixed Variable Expenses Settlement Logic** - Employee-paid expenses now correctly show "Pending" status
   - Added `settlement_status='pending_reimbursement'` when paid_by_type='employee'
   - Checkbox enabled for employee-paid pending reimbursement rows
   - Green rupee icon shows next to "Pending" badge to record reimbursement
3. **Fixed Mark All Paid Visual Feedback** - GRN payments now properly saved and display "All Paid" badge
   - Added `payment_received`, `payment_date`, `payment_mode` fields to `QCGRNItem` model in models.py
   - Loading state with spinner ("Marking...") while processing
   - "All Paid" badge shows after successful marking
4. **Fixed Cashflow Fixed Expenses** - Now uses date field with month/year fallback
5. **All files linted and verified** - No ESLint errors

### Session 20 Apr 2026
1. **Verified GRN Loss Unification** - P&L Dashboard loads correctly with shared calculation
2. **Started Codebase Refactoring Phase 2**
   - Extracted Labour Management routes to `/app/backend/routes/labour.py` (~357 lines)
   - Updated `dependencies.py` with `get_db()` helper
   - server.py reduced from 12,207 to 11,850 lines

### Previous Sessions
1. Unified GRN Loss calculation using `calculate_grn_loss()` helper
2. Implemented Date-wise Retail Rejection tracking
3. Added Paid By filters with employee dropdown to Variable Expenses
4. Fixed unit conversion (bunches to kg)
5. Updated Invoice phone number
6. Fixed Wastage % consistency across dashboards

### Completed (This Session - 20 May 2026)
- **Retailer Portal "Create Order" Restructuring** ✅
  - **Removed "Place Order" from hamburger menu** - Menu now shows: Home, My Orders, Closing, My Account
  - **Added "Create New Order" card at top of My Orders tab** - Prominent green card with delivery date and "Create Order" button
  - **Removed "Yesterday's Closing Not Recorded" banner** - Closing inventory feature cleaned up
  - **Orders now show unique Order IDs** - Each order displays #XXXXXX format ID derived from MongoDB ObjectId
  - **Single Edit/Delete per order** - Replaced multiple edit buttons per product with single Edit + Delete buttons per order
  - **Expandable order details** - Orders are collapsible cards showing item details when expanded
  - **Title changed from translation key to "Create Order"** - Fixed the "retailer.placeOrder" display issue

### Completed (This Session - 20 May 2026 - Continued)
- **Retailer Portal UX Improvements (Part 2)** ✅
  - **View Cart button moved to bottom center** - Fixed position, always visible regardless of scroll
  - **Product images now showing** - Backend enriches catalogue items with product images from products collection
  - **Auto-redirect after placing order** - User is redirected to Orders tab under My Orders after successful order placement
  - **Order items displayed vertically** - Changed from grid layout to vertical list (one item per row) for better readability
  - **Edit order uses cart-based interface** - Clicking Edit opens the same Create Order interface with items pre-loaded in cart
  - **Create Order button on Home page** - Added prominent "Create New Order" card above Your Earnings on the retailer dashboard home
  - **Edit mode indicators** - Header shows "Edit Order" and "Editing order for: [date]", floating button shows "Review Changes (X)"
  - **Cancel Edit option** - Added "Cancel Edit" button when in edit mode to discard changes and return to Orders

## Key API Endpoints
- `GET /api/reports/pnl` - P&L with unified GRN Loss calculation
- `GET /api/qc-grn/summary` - QC GRN Loss summary (uses shared helper)
- `GET /api/stock-status/wastage-dashboard` - Wastage analytics
- `GET /api/labours` - Labour list (modular route)
- `GET /api/labour-attendance` - Attendance tracking (modular route)
- `GET /api/labour-costs/summary` - Labour costs summary (modular route)
- `GET /api/rejections` - Historical date-wise rejections
- `GET /api/retailer-rejections/history` - Single product rejection history
- `POST /api/retailer-rejections/history-batch` - Batch rejection history for multiple products
- `POST /api/qc-indents/ocr` - OCR image upload for Ninjacart indent extraction
- `POST /api/qc-indents/create-from-ocr` - Create indent from OCR extracted data
- `GET /api/retailer-catalogue` - Now enriches with product images from products collection

### Completed (This Session - 20 May 2026 - Part 3)
- **Retailer Portal UX Refinements** ✅
  - **Product images now use full URLs** - Frontend constructs proper URL with `REACT_APP_BACKEND_URL` prefix for relative image paths
  - **ERP-style Order ID format** - Changed from `#XXXXXX` to `Order Id: ORD-YYYYMMDD-XXXX` (e.g., `Order Id: ORD-20260519-225E`)
  - **Language toggle on Create Order page** - Added English/हिंदी/मराठी button group with localStorage persistence (`retailerCatalogueLanguage`)
  - **Categories collapsed by default** - Product categories on Create Order page now start collapsed (user clicks to expand)
  - **Cart Modal shows translated names** - Product names in cart modal respect selected catalogue language

### Completed (This Session - 21 May 2026)
- **Payment Details Redesign (Replaces "Immediately Payable")** ✅ (P0 - VERIFIED)
  - **New Component**: Renamed "Immediately Payable" to "Payment Details" on Retailer Dashboard
  - **Date Filters**: Added date range filters with "Apply" and "Reset" buttons
  - **Aggregate Table**: Shows dates with pending payments in columns: Date | 50% Upfront | Final Payment | Total
  - **Clickable Rows**: Each row opens a mobile-friendly scrollable modal
  - **Item-Level Modal**: 
    - **Header**: Gross Value, Rejection, Net Value, Commission, Final Payable
    - **Item Table**: S.No, Product Name, Supplied Qty, Rejection Qty, Rejection Amount, Billable Qty, Amount
    - Invoice-level breakdown with totals
    - Footer shows payment status and total due
  - **Mobile Responsive**: Modal scrollable with sticky headers on mobile
  - **Backend API**: New `GET /api/retailer-payment-details` endpoint with date filtering
    - Aggregates invoices by date
    - Calculates 50% upfront vs final payment based on days since invoice (5-day credit period)
    - Returns complete item-level details for modal display

## Test Credentials
- Admin: admin@freshflow.com / admin123
- Retailer: tamannamart08@gmail.com / admin123
- Retailer: bhaveshdewasi803@gmail.com / 12345
- Staff: samrat@freshflow.com / admin123

## Refactoring Status
| File | Original Lines | Current Lines | Target | Status |
|------|---------------|---------------|--------|--------|
| server.py | 12,207 | 14,700+ | <8,000 | CRITICAL - Bloated |
| RetailerOrders.js | 5,400+ | 8,101 | <2,000 | CRITICAL - Bloated |
| Dashboard.js (Retailer) | 4,000+ | 4,500+ | <2,000 | NEEDS REFACTOR |

## Active Modular Routes
- `/app/backend/routes/labour.py` - Labour Management (ACTIVE)
- `/app/backend/ocr_indent_processor.py` - OCR Indent Processing (ACTIVE)

## Known Limitations
- **Product images may not persist after server restarts** - Images uploaded to `/app/uploads/products/` may be cleared during deployments. This is a preview environment limitation. Production deployments should use cloud storage (S3/GCS) for persistence.
