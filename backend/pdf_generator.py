from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch, mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
import io
from datetime import datetime

# Company Details
COMPANY_NAME = "Mr Organix"
COMPANY_ADDRESS = """MR ORGANIX M.NO. 1638,
Taleranwadi, Kesnand Taluka - Haveli
Pune - 412207
Maharashtra"""
COMPANY_PHONE = "8530418069"
COMPANY_EMAIL = "mrorganixmushroom@gmail.com"
COMPANY_STATE = "27-Maharashtra"

# Bank Details
BANK_NAME = "Cosmos Bank Co-Op Bank Limited"
BANK_ACCOUNT = "128100101946"
BANK_IFSC = "COSB0000128"
ACCOUNT_HOLDER = "Mr Organix"

# Authorized Signatory
AUTHORIZED_SIGNATORY = "Ankush K."


def generate_invoice_pdf(invoice: dict, party_name: str, customer_address: str = None, is_ninjacart: bool = False) -> bytes:
    """
    Generate professional PDF invoice.
    
    Args:
        invoice: Invoice data dict
        party_name: Customer/Party name
        customer_address: Customer address for Bill To section
        is_ninjacart: If True, use Ninjacart format with crates/lot size
    
    Returns:
        PDF as bytes
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        rightMargin=30, 
        leftMargin=30, 
        topMargin=30, 
        bottomMargin=30
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Heading1'],
        fontSize=14,
        textColor=colors.black,
        alignment=TA_CENTER,
        spaceAfter=5
    )
    
    company_name_style = ParagraphStyle(
        'CompanyName',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1a1a2e'),
        alignment=TA_CENTER,
        spaceAfter=10,
        fontName='Helvetica-Bold'
    )
    
    small_style = ParagraphStyle(
        'Small',
        parent=styles['Normal'],
        fontSize=8,
        leading=10
    )
    
    # ========== HEADER ==========
    story.append(Paragraph("Tax Invoice", title_style))
    story.append(Paragraph(COMPANY_NAME, company_name_style))
    story.append(Spacer(1, 10))
    
    # ========== COMPANY & BILL TO SECTION ==========
    # Get invoice details
    invoice_date = invoice.get('date') or invoice.get('invoice_date')
    if isinstance(invoice_date, str):
        try:
            invoice_date = datetime.fromisoformat(invoice_date.replace('Z', '+00:00'))
        except:
            invoice_date = datetime.now()
    
    invoice_number = invoice.get('invoice_number', 'N/A')
    
    # Company details cell
    company_info = f"""<font size="8"><b>{COMPANY_ADDRESS}</b><br/>
Phone: {COMPANY_PHONE}<br/>
Email: {COMPANY_EMAIL}<br/>
State: {COMPANY_STATE}</font>"""
    
    # Bill To cell
    bill_to_address = customer_address or invoice.get('customer_address', '')
    if not bill_to_address:
        bill_to_address = f"{party_name}"
    
    bill_to_info = f"""<font size="8"><b>{party_name}</b><br/><br/>
{bill_to_address}</font>"""
    
    # Invoice details cell
    invoice_details = f"""<font size="8"><b>Invoice Details:</b><br/>
Invoice No: <b>{invoice_number}</b><br/>
Date: {invoice_date.strftime('%Y-%m-%d')}<br/>
Place Of Supply: {COMPANY_STATE}</font>"""
    
    # Create header table
    header_data = [
        [Paragraph(company_info, small_style), ''],
        ['', ''],
        [Paragraph("<b>Bill To:</b>", small_style), Paragraph("<b>Invoice Details:</b>", small_style)],
        [Paragraph(bill_to_info, small_style), Paragraph(invoice_details, small_style)]
    ]
    
    header_table = Table(header_data, colWidths=[3.5*inch, 3.5*inch])
    header_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('LINEBELOW', (0, 0), (-1, 0), 1, colors.black),
        ('LINEBELOW', (0, 2), (-1, 2), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('SPAN', (0, 0), (1, 0)),  # Company info spans both columns
    ]))
    
    story.append(header_table)
    story.append(Spacer(1, 15))
    
    # ========== ITEMS TABLE ==========
    if is_ninjacart:
        # Ninjacart format with crates and lot size
        items_header = ['#', 'Item name', 'Crates', 'Lot Size', 'Qty', 'Rate', 'Amount']
        col_widths = [0.3*inch, 2.2*inch, 0.7*inch, 0.8*inch, 0.7*inch, 0.8*inch, 1*inch]
    else:
        # Standard format with Indent, Supply, Rate, Amount, Receiving
        items_header = ['#', 'Item name', 'Indent', 'Supply', 'Rate', 'Amount', 'Receiving']
        col_widths = [0.3*inch, 2.5*inch, 0.7*inch, 0.7*inch, 0.8*inch, 1*inch, 0.8*inch]
    
    items_data = [items_header]
    total_amount = 0
    
    for idx, item in enumerate(invoice.get('items', []), 1):
        product_name = item.get('product_name', '') or item.get('name', '')
        variant = item.get('variant_name', '') or item.get('packaging_name', '') or item.get('unit', '')
        if variant and variant not in product_name:
            product_name = f"{product_name} - {variant}"
        
        qty = item.get('quantity', 0) or item.get('supplied_qty', 0) or 0
        indent_qty = item.get('indent_qty', qty) or qty
        rate = item.get('rate', 0) or item.get('mrp', 0) or item.get('rate_per_unit', 0) or 0
        amount = item.get('total', 0) or item.get('amount', 0) or (qty * rate)
        total_amount += amount
        
        if is_ninjacart:
            crates = item.get('crates', 0) or item.get('num_crates', 0) or 0
            lot_size = item.get('lot_size', 0) or item.get('pieces_per_crate', 0) or 0
            items_data.append([
                str(idx),
                product_name,
                str(crates),
                str(lot_size),
                str(int(qty)) if qty == int(qty) else str(qty),
                f"₹{rate:.2f}" if rate else '',
                f"₹{amount:.2f}" if amount else ''
            ])
        else:
            items_data.append([
                str(idx),
                product_name,
                str(int(indent_qty)) if indent_qty == int(indent_qty) else str(indent_qty),
                str(int(qty)) if qty == int(qty) else str(qty),
                f"₹{rate:.2f}" if rate else '',
                f"₹{amount:.2f}" if amount else '',
                ''  # Receiving column left empty for manual entry
            ])
    
    # Add total row
    if is_ninjacart:
        items_data.append(['', 'Total Amount', '', '', '', '', f"₹{total_amount:.2f}"])
    else:
        items_data.append(['', 'Total Amount', '', '', '', f"₹{total_amount:.2f}", ''])
    
    items_table = Table(items_data, colWidths=col_widths)
    items_table.setStyle(TableStyle([
        # Header styling
        ('BACKGROUND', (0, 0), (-1, 0), colors.white),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        
        # Body styling
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (0, -1), 'CENTER'),  # # column
        ('ALIGN', (2, 1), (-1, -1), 'CENTER'),  # Numeric columns
        
        # Grid
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.black),
        
        # Padding
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        
        # Total row styling
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f5f5f5')),
    ]))
    
    story.append(items_table)
    story.append(Spacer(1, 10))
    
    # ========== TOTAL IN WORDS ==========
    total_in_words = number_to_words(total_amount)
    story.append(Paragraph(f"<b>Total Amount in words:</b> {total_in_words}", small_style))
    story.append(Spacer(1, 30))
    
    # ========== FOOTER - TERMS & BANK DETAILS ==========
    terms_text = "Thanks for doing business with us!"
    
    bank_details = f"""<font size="8"><b>Bank Details:</b><br/>
Name: {BANK_NAME}<br/>
Account No.: {BANK_ACCOUNT}<br/>
IFSC code: {BANK_IFSC}<br/>
Account holder's name: {ACCOUNT_HOLDER}</font>"""
    
    signatory_text = f"""<font size="8"><b>For {COMPANY_NAME}:</b><br/><br/><br/><br/>
<b>Authorized Signatory</b><br/>
{AUTHORIZED_SIGNATORY}</font>"""
    
    footer_data = [
        [Paragraph("<b>Terms & Conditions:</b>", small_style), ''],
        [Paragraph(terms_text, small_style), ''],
        [Paragraph(bank_details, small_style), Paragraph(signatory_text, small_style)]
    ]
    
    footer_table = Table(footer_data, colWidths=[4*inch, 3*inch])
    footer_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.black),
        ('LINEBELOW', (0, 1), (-1, 1), 0.5, colors.black),
        ('LINEBEFORE', (1, 2), (1, 2), 0.5, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('VALIGN', (1, 2), (1, 2), 'BOTTOM'),
        ('ALIGN', (1, 2), (1, 2), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('SPAN', (0, 0), (1, 0)),  # Terms header spans
        ('SPAN', (0, 1), (1, 1)),  # Terms text spans (but we won't span to keep bank/signatory separate)
    ]))
    
    story.append(footer_table)
    
    # Build PDF
    doc.build(story)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes


def number_to_words(num):
    """Convert number to words (Indian format)"""
    if num == 0:
        return "Zero Rupees Only"
    
    ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
            'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
            'Seventeen', 'Eighteen', 'Nineteen']
    tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    
    def words_below_100(n):
        if n < 20:
            return ones[n]
        return tens[n // 10] + (' ' + ones[n % 10] if n % 10 else '')
    
    def words_below_1000(n):
        if n < 100:
            return words_below_100(n)
        return ones[n // 100] + ' Hundred' + (' and ' + words_below_100(n % 100) if n % 100 else '')
    
    num = int(num)
    if num < 0:
        return "Minus " + number_to_words(-num)
    
    if num < 1000:
        result = words_below_1000(num)
    elif num < 100000:
        result = words_below_1000(num // 1000) + ' Thousand' + (' ' + words_below_1000(num % 1000) if num % 1000 else '')
    elif num < 10000000:
        result = words_below_1000(num // 100000) + ' Lakh' + (' ' + number_to_words(num % 100000).replace(' Rupees Only', '') if num % 100000 else '')
    else:
        result = words_below_1000(num // 10000000) + ' Crore' + (' ' + number_to_words(num % 10000000).replace(' Rupees Only', '') if num % 10000000 else '')
    
    return result.strip() + ' Rupees Only'


# Backward compatibility function
def generate_qc_invoice_pdf(invoice: dict, customer_name: str, customer_address: str = None) -> bytes:
    """Generate QC invoice - auto-detects Ninjacart format"""
    is_ninjacart = 'ninjacart' in customer_name.lower() if customer_name else False
    return generate_invoice_pdf(invoice, customer_name, customer_address, is_ninjacart)


def generate_retailer_invoice_pdf(invoice: dict, retailer_name: str, retailer_address: str = None) -> bytes:
    """Generate retailer invoice - standard format"""
    return generate_invoice_pdf(invoice, retailer_name, retailer_address, is_ninjacart=False)
