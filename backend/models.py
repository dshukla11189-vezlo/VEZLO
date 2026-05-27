from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Literal, Union
from datetime import datetime, timezone
import uuid

# Base Models
class ProductItem(BaseModel):
    product_id: str
    product_name: str
    quantity: float
    unit: str  # Kg, Bunch, Piece, Pack
    unit_size: Optional[str] = None  # For bunches: "100g", "250g", "350g"
    rate: float
    total: float

class RejectionItem(BaseModel):
    product_id: str
    product_name: str
    packets: int
    reason: str

# User Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "retailer", "staff"]
    company_name: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None
    commission_percentage: Optional[float] = 0  # For retailers: their commission %
    upfront_collection_percentage: Optional[float] = 50  # For retailers: 50%, 100%, etc.
    referral_code: Optional[str] = None  # Auto-generated for retailers
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "retailer", "staff"]
    company_name: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None
    commission_percentage: Optional[float] = 0
    upfront_collection_percentage: Optional[float] = 50

class LoginRequest(BaseModel):
    identifier: str  # Can be email or mobile number
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: str
    company_name: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None
    commission_percentage: Optional[float] = 0

class AuthResponse(BaseModel):
    token: str
    user: UserResponse

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    role: Optional[Literal["admin", "retailer", "staff"]] = None
    company_name: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None
    commission_percentage: Optional[float] = None
    upfront_collection_percentage: Optional[float] = None

# Product Models
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    name_hi: Optional[str] = None  # Hindi translation of product name
    name_mr: Optional[str] = None  # Marathi translation of product name
    category: str
    product_type: Optional[str] = None  # Fruits, Vegetables, Exotic, Leafy, etc.
    unit: str
    current_stock: float = 0
    price_per_kg: Optional[float] = None
    price_per_packet: Optional[float] = None
    lifecycle_duration: Optional[str] = None  # "low" (3 days), "medium" (5 days), "high" (7 days)
    cost_alias_product_id: Optional[str] = None  # For P&L: use this product's purchase cost (e.g., Spinach uses Palak's cost)
    image_url: Optional[str] = None  # Product image URL
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    name: str
    name_hi: Optional[str] = None  # Hindi translation
    name_mr: Optional[str] = None  # Marathi translation
    category: str
    product_type: Optional[str] = None  # Fruits, Vegetables, Exotic, Leafy, etc.
    unit: str
    current_stock: float = 0
    price_per_kg: Optional[float] = None
    price_per_packet: Optional[float] = None
    lifecycle_duration: Optional[str] = None  # "low", "medium", "high"
    cost_alias_product_id: Optional[str] = None  # For P&L: use this product's purchase cost
    image_url: Optional[str] = None  # Product image URL

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    name_hi: Optional[str] = None  # Hindi translation
    name_mr: Optional[str] = None  # Marathi translation
    category: Optional[str] = None
    product_type: Optional[str] = None  # Fruits, Vegetables, Exotic, Leafy, etc.
    unit: Optional[str] = None
    current_stock: Optional[float] = None
    price_per_kg: Optional[float] = None
    price_per_packet: Optional[float] = None
    lifecycle_duration: Optional[str] = None
    cost_alias_product_id: Optional[str] = None  # For P&L: use this product's purchase cost
    image_url: Optional[str] = None  # Product image URL

# Farmer Models
class Farmer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    contact: str
    address: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    bank_name: Optional[str] = None
    branch_name: Optional[str] = None
    upi_id: Optional[str] = None
    materials_supplied: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FarmerCreate(BaseModel):
    name: str
    contact: str
    address: Optional[str] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    bank_name: Optional[str] = None
    branch_name: Optional[str] = None
    upi_id: Optional[str] = None
    materials_supplied: Optional[str] = None

# Procurement Models
class Procurement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: datetime
    farmer_id: str
    farmer_name: str
    products: List[ProductItem]
    total_amount: float
    paid_amount: float = 0
    pending_amount: float = 0
    payment_status: str = "pending"  # pending, partial, paid
    remark: Optional[str] = None
    status: str = "completed"
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Payment detail fields
    payment_date: Optional[str] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None
    paid_by_type: Optional[str] = None  # 'company' or 'employee'
    paid_by: Optional[str] = None
    paid_by_employee_id: Optional[str] = None
    # Settlement fields (for employee-paid procurements)
    settlement_status: Optional[str] = None  # 'settled' or 'pending_reimbursement'
    settlement_date: Optional[str] = None
    settlement_mode: Optional[str] = None
    settlement_reference: Optional[str] = None
    settlement_remarks: Optional[str] = None
    is_settled: Optional[bool] = None

class ProcurementCreate(BaseModel):
    date: datetime
    farmer_id: str
    farmer_name: str
    products: List[ProductItem]
    total_amount: float
    paid_amount: float = 0
    pending_amount: float = 0
    payment_status: str = "pending"
    remark: Optional[str] = None
    status: str = "completed"


# Procurement Template Models (for quick entry)
class ProcurementTemplateItem(BaseModel):
    product_id: str
    product_name: str
    unit: str

class ProcurementTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    farmer_id: str
    farmer_name: str
    items: List[ProcurementTemplateItem]
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProcurementTemplateCreate(BaseModel):
    name: str
    farmer_id: str
    farmer_name: str
    items: List[ProcurementTemplateItem]


# QC Order Models
class QCOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_date: datetime
    company_name: str
    products: List[ProductItem]
    total_amount: float
    status: str = "pending"
    delivery_date: Optional[datetime] = None
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCOrderCreate(BaseModel):
    order_date: datetime
    company_name: str
    products: List[ProductItem]
    total_amount: float
    status: str = "pending"
    delivery_date: Optional[datetime] = None

# QC Indent Item (for Quick Commerce orders)
class QCIndentItem(BaseModel):
    product_id: str
    product_name: str
    product_unit: str
    packaging_id: Optional[str] = None  # ID of the packaging variant
    packaging_name: Optional[str] = None  # e.g., "100gm without roots", "250gm with roots"
    required_qty: float
    lot_size: int  # packets per crate
    no_of_crates: float  # auto-calculated: required_qty / lot_size
    rate: Optional[float] = None  # price per unit (optional)

# QC Indent Models
class QCIndent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    indent_date: datetime
    customer_name: str  # e.g., Blinkit, Zepto, Instamart
    items: List[QCIndentItem]
    status: str = "pending"  # pending, dispatched, partial, completed
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCIndentCreate(BaseModel):
    indent_date: datetime
    customer_name: str
    items: List[QCIndentItem]
    status: str = "pending"

class QCIndentUpdate(BaseModel):
    indent_date: Optional[datetime] = None
    customer_name: Optional[str] = None
    items: Optional[List[QCIndentItem]] = None
    status: Optional[str] = None

# QC Dispatch Item (for log-based dispatch entries)
class QCDispatchItem(BaseModel):
    product_id: str
    product_name: str
    product_unit: str
    packaging_id: Optional[str] = None
    packaging_name: Optional[str] = None
    indent_qty: Optional[float] = None  # Original indent quantity (optional)
    required_qty: Optional[float] = None  # Alias for indent_qty
    supplied_qty: float  # Quantity supplied in this dispatch
    lot_size: Optional[int] = 1  # packets per crate (optional, default 1)
    no_of_crates: Optional[float] = 0  # Auto-calculated from supplied_qty (optional)
    rate: Optional[float] = None  # Rate per unit (optional, for invoicing)

# QC Dispatch Models (Log-based - multiple dispatches per indent)
class QCDispatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dispatch_date: datetime
    dispatch_time: str = ""  # e.g., "09:00 AM", "05:30 PM"
    indent_id: str
    customer_name: str
    items: List[QCDispatchItem]
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    remarks: Optional[str] = None
    status: str = "dispatched"  # dispatched, delivered, partial_received
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCDispatchCreate(BaseModel):
    dispatch_date: datetime
    dispatch_time: str = ""
    indent_id: str
    customer_name: str
    items: List[QCDispatchItem]
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    remarks: Optional[str] = None

# QC Invoice Item
class QCInvoiceItem(BaseModel):
    product_id: str
    product_name: str
    product_unit: str
    packaging_id: Optional[str] = None
    packaging_name: Optional[str] = None
    indent_qty: Optional[float] = None
    supplied_qty: float
    lot_size: int = 0
    no_of_crates: float = 0
    receiving_qty: Optional[float] = None  # For Ninjacart format
    rate: Optional[float] = None  # Rate per unit
    amount: Optional[float] = None  # supplied_qty * rate
    # Track source dispatch for avoiding duplicate invoicing
    dispatch_id: Optional[str] = None
    item_index: Optional[int] = None

# QC Invoice Models
class QCInvoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str  # Format: CUS-DDMMMYYYY-001 (e.g., NIN-26MAR2026-001)
    invoice_date: datetime
    customer_name: str
    customer_type: str = "standard"  # "ninjacart" or "standard"
    dispatch_ids: List[str] = []  # Link to dispatch entries
    indent_id: str
    items: List[QCInvoiceItem]
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    total_amount: Optional[float] = None
    remarks: Optional[str] = None
    status: str = "draft"  # draft, finalized, cancelled
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCInvoiceCreate(BaseModel):
    invoice_date: datetime
    customer_name: str
    customer_type: str = "standard"
    dispatch_ids: List[str] = []
    indent_id: str
    items: List[QCInvoiceItem]
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    total_amount: Optional[float] = None
    remarks: Optional[str] = None

class QCInvoiceUpdate(BaseModel):
    invoice_date: Optional[datetime] = None
    items: Optional[List[QCInvoiceItem]] = None
    subtotal: Optional[float] = None
    discount: Optional[float] = None
    total_amount: Optional[float] = None
    remarks: Optional[str] = None
    status: Optional[str] = None

# QC GRN (Goods Receipt Note) Item - for Ninjacart
class QCGRNItem(BaseModel):
    dispatch_id: str
    dispatch_date: str  # Original dispatch date
    product_id: str
    product_name: str
    product_unit: str
    packaging_id: Optional[str] = None
    packaging_name: Optional[str] = None
    packaging_weight_gm: Optional[float] = None  # Packaging weight in grams
    supplied_qty: float  # Quantity we supplied (in units)
    grn_qty: float  # GRN quantity from Ninjacart (converted to units)
    grn_qty_kg: Optional[float] = None  # Original GRN qty in Kg from file
    difference: float  # grn_qty - supplied_qty
    rate_per_kg: Optional[float] = None  # Rate per kg from file
    rate_per_unit: Optional[float] = None  # Calculated rate per unit
    amount: Optional[float] = None  # grn_qty * rate_per_unit
    rate_change: Optional[float] = None  # Rate change from previous day (₹)
    rate_change_percent: Optional[float] = None  # Rate change percentage
    # Payment tracking fields
    payment_received: Optional[bool] = None
    payment_date: Optional[str] = None
    payment_mode: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_remarks: Optional[str] = None
    # Short/Excess payment tracking (only stored on first item of date)
    amount_received: Optional[float] = None  # Actual amount received for the date
    payment_difference: Optional[float] = None  # Positive = excess, negative = short
    grn_date_total: Optional[float] = None  # Total GRN amount for the date

# QC GRN Models - Ninjacart specific
class QCGRN(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    grn_date: datetime  # Date when GRN was recorded
    customer_name: str = "Ninjacart"
    file_name: Optional[str] = None  # Original uploaded file name
    items: List[QCGRNItem]
    total_supplied: float
    total_grn: float
    total_difference: float
    status: str = "completed"
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCGRNCreate(BaseModel):
    grn_date: datetime
    customer_name: str = "Ninjacart"
    file_name: Optional[str] = None
    items: List[QCGRNItem]
    total_supplied: float
    total_grn: float
    total_difference: float

# QC Customer Model
class QCCustomer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Blinkit, Zepto, Instamart, etc.
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCCustomerCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    address: Optional[str] = None

# Customer Product Settings (Lot Size per Customer-Product)
class CustomerProductSetting(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    customer_name: str
    product_id: str
    product_name: str
    packaging_id: Optional[str] = None
    packaging_name: Optional[str] = None
    lot_size: float  # Units per crate for this customer-product combo
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CustomerProductSettingCreate(BaseModel):
    customer_id: str
    customer_name: str
    product_id: str
    product_name: str
    packaging_id: Optional[str] = None
    packaging_name: Optional[str] = None
    lot_size: float

# Retailer Order Models
class RetailerOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_date: datetime
    retailer_id: str
    retailer_name: str
    products: List[ProductItem]
    total_amount: float
    status: str = "pending"
    delivery_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerOrderCreate(BaseModel):
    order_date: datetime
    retailer_id: Optional[str] = None
    retailer_name: str
    products: List[ProductItem]
    total_amount: float
    status: str = "pending"
    delivery_date: Optional[datetime] = None

class OrderStatusUpdate(BaseModel):
    status: str

# Rejection Models
class Rejection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: datetime
    retailer_id: str
    order_id: str
    products: List[RejectionItem]
    total_deduction: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RejectionCreate(BaseModel):
    date: datetime
    retailer_id: Optional[str] = None
    order_id: str
    products: List[RejectionItem]
    total_deduction: float

# Wastage Models
class Wastage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: datetime
    products: List[ProductItem]
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WastageCreate(BaseModel):
    date: datetime
    products: List[ProductItem]

# Payment Models
class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: datetime
    party_type: Literal["retailer", "farmer", "qc"]
    party_id: str
    party_name: str
    amount: float
    payment_mode: str
    reference: Optional[str] = None
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PaymentCreate(BaseModel):
    date: datetime
    party_type: Literal["retailer", "farmer", "qc"]
    party_id: str
    party_name: str
    amount: float
    payment_mode: str
    reference: Optional[str] = None

# Invoice Models
class Invoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str
    date: datetime
    party_type: Literal["retailer", "qc"]
    party_id: str
    party_name: str
    order_id: str
    items: List[ProductItem]
    total_amount: float
    paid_amount: float = 0
    pending_amount: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InvoiceCreate(BaseModel):
    date: datetime
    party_type: Literal["retailer", "qc"]
    party_id: str
    party_name: str
    order_id: str
    items: List[ProductItem]
    total_amount: float
    paid_amount: float = 0
    pending_amount: float


# Daily Stock Status Models
class DailyStockStatus(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD format
    product_id: str
    product_name: str
    product_unit: str = "Kg"
    opening_qty: float = 0  # Opening quantity in Kg
    opening_price: float = 0  # Average price at opening
    purchase_qty: float = 0  # Total purchased today from procurement
    purchase_value: float = 0  # Total purchase value
    dispatch_qty: float = 0  # Total dispatched today (QC + Retail)
    dispatch_value: float = 0  # Total dispatch value
    closing_qty: Optional[float] = None  # Entered by staff at end of day
    wastage_qty: float = 0  # Auto-calculated: Opening + Purchase - Dispatch - Closing
    wastage_value: float = 0  # Wastage in rupees
    wastage_percent: float = 0  # Wastage as % of (Opening + Purchase)
    avg_price: float = 0  # Weighted average price
    status: Literal["open", "closed"] = "open"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: Optional[datetime] = None

class StockClosingEntry(BaseModel):
    product_id: str
    closing_qty: float  # Actual closing quantity in Kg

class StockClosingBulkEntry(BaseModel):
    entries: List[StockClosingEntry]



# ==================== RETAILER MODELS ====================

class RetailerIndentItem(BaseModel):
    product_id: str
    product_name: str
    variant_id: Optional[str] = None
    variant_name: Optional[str] = None  # e.g., "100g", "200g"
    quantity: float  # Number of packets/units
    status: Literal["pending", "dispatched", "received"] = "pending"

class RetailerIndent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    retailer_id: str
    retailer_name: str
    indent_date: datetime
    items: List[RetailerIndentItem]
    status: Literal["pending", "partial", "dispatched", "received"] = "pending"
    created_by: str  # user_id of creator (retailer or admin/staff)
    created_by_role: str  # "retailer", "admin", "staff"
    remarks: Optional[str] = None
    is_auto_generated: bool = False  # True if auto-generated by system
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerIndentCreate(BaseModel):
    retailer_id: Optional[str] = None  # Optional for retailer users (uses their own ID)
    indent_date: Union[datetime, str]  # Accept both datetime and string formats
    items: List[RetailerIndentItem]
    remarks: Optional[str] = None

class RetailerDispatchItem(BaseModel):
    product_id: str
    product_name: str
    variant_id: Optional[str] = None
    variant_name: Optional[str] = None
    indent_qty: float  # Original indent quantity
    supplied_qty: float  # Actually supplied
    mrp: float  # Mandatory MRP per unit
    total_value: float = 0  # supplied_qty × mrp

class RetailerDispatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    indent_id: str
    retailer_id: str
    retailer_name: str
    dispatch_date: datetime
    items: List[RetailerDispatchItem]
    total_mrp_value: float = 0  # Sum of all items' total_value
    commission_percentage: float = 0  # Retailer's commission at time of dispatch
    net_payable: float = 0  # total_mrp_value × (1 - commission/100)
    transport_charges: float = 0  # Optional transport charges
    dispatched_by: str  # staff/admin user_id
    invoice_number: Optional[str] = None
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerDispatchCreate(BaseModel):
    indent_id: str
    dispatch_date: datetime
    items: List[RetailerDispatchItem]
    remarks: Optional[str] = None
    transport_charges: Optional[float] = 0

class RetailerGRNItem(BaseModel):
    product_id: str
    product_name: str
    variant_name: Optional[str] = None
    supplied_qty: float
    received_qty: float
    difference: float = 0  # received - supplied

class RetailerGRN(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dispatch_id: str
    retailer_id: str
    retailer_name: str
    grn_date: datetime
    items: List[RetailerGRNItem]
    confirmed_by: str  # retailer user_id
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerGRNCreate(BaseModel):
    dispatch_id: str
    items: List[RetailerGRNItem]
    remarks: Optional[str] = None

class RetailerRejection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    retailer_id: str
    retailer_name: str
    rejection_date: datetime
    product_id: str
    product_name: str
    variant_name: Optional[str] = None
    quantity: float  # Rejected quantity
    reason: str  # e.g., "Rotten", "Damaged", "Quality issue"
    dispatch_id: Optional[str] = None  # Link to original dispatch if applicable
    recorded_by: str  # staff/admin user_id
    mrp: float = 0  # MRP at which it was sold
    rejection_value: float = 0  # quantity × mrp
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerRejectionCreate(BaseModel):
    retailer_id: str
    rejection_date: datetime
    product_id: str
    product_name: str
    variant_name: Optional[str] = None
    quantity: float
    reason: str
    dispatch_id: Optional[str] = None
    mrp: float = 0
    remarks: Optional[str] = None

class RetailerPayment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    retailer_id: str
    retailer_name: str
    payment_date: datetime
    amount: float
    payment_mode: Literal["cash", "upi", "bank_transfer", "cheque", "other"] = "cash"
    reference_number: Optional[str] = None  # UPI ref, cheque no, etc.
    recorded_by: str  # staff/admin user_id
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerPaymentCreate(BaseModel):
    retailer_id: str
    payment_date: datetime
    amount: float
    payment_mode: Literal["cash", "upi", "bank_transfer", "cheque", "other"] = "cash"
    reference_number: Optional[str] = None
    remarks: Optional[str] = None


# Retailer Invoice Models
class RetailerInvoiceItem(BaseModel):
    dispatch_id: str
    product_id: str
    product_name: str
    variant_name: Optional[str] = None
    quantity: float  # Net quantity (after rejection)
    supplied_qty: Optional[float] = None  # Original supplied quantity
    rejected_qty: Optional[float] = 0  # Rejected quantity
    mrp: float
    total_value: float  # Net value (after rejection)

class RetailerInvoice(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoice_number: str
    retailer_id: str
    retailer_name: str
    invoice_date: datetime
    dispatch_ids: List[str]  # Multiple dispatches can be in one invoice
    items: List[RetailerInvoiceItem]
    gross_value: float = 0  # Total MRP before rejections
    rejection_amount: float = 0  # Total rejection value
    total_mrp_value: float = 0  # Net value after rejections (gross - rejection)
    commission_percentage: float = 0
    commission_amount: float = 0
    net_payable: float = 0  # Amount retailer pays us (total_mrp_value - commission)
    status: Literal["pending", "partial", "paid"] = "pending"
    created_by: str
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerInvoiceSelectedItem(BaseModel):
    dispatch_id: str
    item_index: int
    product_id: str
    product_name: str
    variant_name: Optional[str] = None
    indent_qty: Optional[float] = 0
    supplied_qty: float
    rejected_qty: float = 0
    rejections: Optional[List[dict]] = []
    net_qty: float
    quantity: float  # Same as net_qty, used for invoice
    mrp: float
    total_value: float  # Net value after rejection deduction

class RetailerInvoiceCreate(BaseModel):
    retailer_id: str
    invoice_date: datetime
    dispatch_ids: List[str]
    selected_items: Optional[List[RetailerInvoiceSelectedItem]] = None
    remarks: Optional[str] = None


# ==================== RETAILER CREDIT NOTES ====================
class RetailerCreditNote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    credit_note_number: str  # CN-001, CN-002, etc.
    retailer_id: str
    retailer_name: str
    # Source: The old invoice/rejection this credit is from
    original_invoice_id: str
    original_invoice_number: str
    rejection_id: Optional[str] = None  # Link to rejection record
    rejection_date: Optional[datetime] = None
    # Credit details
    amount: float
    rejection_details: Optional[List[dict]] = []  # Product-wise breakdown
    # Adjustment tracking
    status: Literal["pending", "partial", "adjusted"] = "pending"
    adjusted_amount: float = 0  # How much has been adjusted so far
    pending_amount: float = 0  # Remaining to be adjusted
    # When adjusted against future invoice
    adjusted_against_invoices: List[dict] = []  # [{invoice_id, invoice_number, amount, date}]
    # Metadata
    remarks: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class RetailerCreditNoteCreate(BaseModel):
    retailer_id: str
    original_invoice_id: str
    rejection_id: Optional[str] = None
    amount: float
    rejection_details: Optional[List[dict]] = []
    remarks: Optional[str] = None

class CreditAdjustment(BaseModel):
    """Tracks credit note adjustments against an invoice"""
    credit_note_id: str
    credit_note_number: str
    amount_adjusted: float
    adjustment_date: datetime


# ==================== RETAILER INVENTORY ====================
class RetailerInventoryItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    retailer_id: str
    product_id: str
    product_name: str
    variant_name: Optional[str] = None
    date: str  # YYYY-MM-DD format
    opening_qty: float = 0
    received_qty: float = 0  # From dispatch
    sold_qty: float = 0  # User entered
    wastage_qty: float = 0  # User entered
    closing_qty: float = 0  # Calculated: opening + received - sold - wastage
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetailerInventoryItemUpdate(BaseModel):
    sold_qty: Optional[float] = None
    wastage_qty: Optional[float] = None
    closing_qty: Optional[float] = None
    remarks: Optional[str] = None


# ==================== LABOUR MANAGEMENT MODELS ====================

class Labour(BaseModel):
    """Model for labourers/workers"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: Optional[str] = None
    default_daily_rate: float = 0  # Default daily wage in ₹
    default_overtime_rate: float = 0  # Default overtime rate per hour in ₹
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    joining_date: Optional[str] = None  # YYYY-MM-DD format
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LabourCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    default_daily_rate: float = 0
    default_overtime_rate: float = 0
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    joining_date: Optional[str] = None
    is_active: bool = True

class LabourUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    default_daily_rate: Optional[float] = None
    default_overtime_rate: Optional[float] = None
    bank_account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    joining_date: Optional[str] = None
    is_active: Optional[bool] = None


class LabourAttendance(BaseModel):
    """Model for daily attendance records"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD format
    labour_id: str
    labour_name: str
    present: bool = False
    overtime_hours: float = 0  # Hours of overtime worked
    daily_rate: float = 0  # Rate applied for this day (may differ from default for historical tracking)
    overtime_rate: float = 0  # Overtime rate applied for this day
    total_payment: float = 0  # Calculated: daily_rate (if present) + (overtime_hours * overtime_rate)
    recorded_by: str  # user_id of supervisor who marked attendance
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LabourAttendanceCreate(BaseModel):
    date: str  # YYYY-MM-DD format
    labour_id: str
    labour_name: str
    present: bool = False
    overtime_hours: float = 0
    daily_rate: float = 0
    overtime_rate: float = 0
    remarks: Optional[str] = None

class LabourAttendanceUpdate(BaseModel):
    present: Optional[bool] = None
    overtime_hours: Optional[float] = None
    daily_rate: Optional[float] = None
    overtime_rate: Optional[float] = None
    remarks: Optional[str] = None
