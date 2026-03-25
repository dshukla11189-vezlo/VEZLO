from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
import io
from datetime import datetime

def generate_invoice_pdf(invoice: dict, party_name: str) -> bytes:
    """
    Generate PDF invoice from invoice data.
    Returns PDF as bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    
    story = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#14532D'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#14532D'),
        spaceAfter=12
    )
    
    # Title
    story.append(Paragraph("FreshFlow", title_style))
    story.append(Paragraph("INVOICE", heading_style))
    story.append(Spacer(1, 20))
    
    # Invoice details
    invoice_date = invoice.get('date')
    if isinstance(invoice_date, str):
        invoice_date = datetime.fromisoformat(invoice_date)
    
    details_data = [
        ['Invoice Number:', invoice.get('invoice_number', '')],
        ['Date:', invoice_date.strftime('%d %b %Y')],
        ['Party Name:', party_name],
        ['Party Type:', invoice.get('party_type', '').upper()],
    ]
    
    details_table = Table(details_data, colWidths=[2*inch, 3*inch])
    details_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#14532D')),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    
    story.append(details_table)
    story.append(Spacer(1, 30))
    
    # Items table
    items_data = [['Product', 'Quantity', 'Unit', 'Rate', 'Amount']]
    
    for item in invoice.get('items', []):
        items_data.append([
            item.get('product_name', ''),
            str(item.get('quantity', 0)),
            item.get('unit', ''),
            f"₹{item.get('rate', 0):.2f}",
            f"₹{item.get('total', 0):.2f}"
        ])
    
    items_table = Table(items_data, colWidths=[2.5*inch, 1*inch, 0.8*inch, 1*inch, 1.2*inch])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#14532D')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 1), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
    ]))
    
    story.append(items_table)
    story.append(Spacer(1, 30))
    
    # Totals
    totals_data = [
        ['Total Amount:', f"₹{invoice.get('total_amount', 0):.2f}"],
        ['Paid Amount:', f"₹{invoice.get('paid_amount', 0):.2f}"],
        ['Pending Amount:', f"₹{invoice.get('pending_amount', 0):.2f}"],
    ]
    
    totals_table = Table(totals_data, colWidths=[4.5*inch, 2*inch])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LINEABOVE', (0, 0), (-1, 0), 1, colors.HexColor('#E5E7EB')),
        ('LINEABOVE', (0, -1), (-1, -1), 2, colors.HexColor('#14532D')),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#14532D')),
    ]))
    
    story.append(totals_table)
    
    # Build PDF
    doc.build(story)
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    
    return pdf_bytes