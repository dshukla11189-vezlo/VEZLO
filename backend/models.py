from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List, Literal
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "retailer", "staff"]
    company_name: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
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

class AuthResponse(BaseModel):
    token: str
    user: UserResponse

# Product Models
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str
    unit: str
    current_stock: float = 0
    price_per_kg: Optional[float] = None
    price_per_packet: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    name: str
    category: str
    unit: str
    current_stock: float = 0
    price_per_kg: Optional[float] = None
    price_per_packet: Optional[float] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[float] = None
    price_per_kg: Optional[float] = None
    price_per_packet: Optional[float] = None

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

# QC Dispatch Item
class QCDispatchItem(BaseModel):
    product_id: str
    product_name: str
    product_unit: str
    dispatched_qty: float
    lot_size: int
    crates_dispatched: float

# QC Dispatch Models
class QCDispatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    dispatch_date: datetime
    indent_id: str
    customer_name: str
    items: List[QCDispatchItem]
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    status: str = "dispatched"  # dispatched, delivered, partial_received
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCDispatchCreate(BaseModel):
    dispatch_date: datetime
    indent_id: str
    customer_name: str
    items: List[QCDispatchItem]
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None

# QC GRN (Goods Receipt Note) Item
class QCGRNItem(BaseModel):
    product_id: str
    product_name: str
    product_unit: str
    dispatched_qty: float
    received_qty: float
    rejected_qty: float  # dispatched_qty - received_qty
    rejection_reason: Optional[str] = None

# QC GRN Models
class QCGRN(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    grn_date: datetime
    dispatch_id: str
    indent_id: str
    customer_name: str
    items: List[QCGRNItem]
    total_dispatched: float
    total_received: float
    total_rejected: float
    status: str = "completed"
    recorded_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class QCGRNCreate(BaseModel):
    grn_date: datetime
    dispatch_id: str
    indent_id: str
    customer_name: str
    items: List[QCGRNItem]
    total_dispatched: float
    total_received: float
    total_rejected: float

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