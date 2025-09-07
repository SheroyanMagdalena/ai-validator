from datetime import datetime
from io import BytesIO
from typing import Dict, List

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.graphics.shapes import Drawing, Rect
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.textlabels import Label
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_RIGHT, TA_LEFT, TA_CENTER

def generate_pdf_bytes(data: Dict, title_fallback: str = "API Validation Report") -> bytes:
    # Create a buffer to hold the PDF data
    buf = BytesIO()
    
    # Define page layout with margins
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=0.7*inch,
        bottomMargin=0.7*inch,
        leftMargin=0.7*inch,
        rightMargin=0.7*inch
    )
    
    # Get default styles and create custom ones
    styles = getSampleStyleSheet()
    
    # Create a custom style for the main title
    styles.add(ParagraphStyle(
        name='CustomTitle',
        parent=styles['Title'],
        fontSize=16,
        spaceAfter=12,
        alignment=TA_LEFT
    ))
    
    # Create a custom style for section headings
    styles.add(ParagraphStyle(
        name='SectionHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.darkblue,
        spaceAfter=6,
        spaceBefore=12,
        borderBottom=1,
        borderBottomColor=colors.lightgrey,
        borderBottomPadding=3
    ))
    
    # Create a custom style for the recommendation box
    styles.add(ParagraphStyle(
        name='Recommendation',
        parent=styles['BodyText'],
        backColor=colors.lightgrey,
        borderPadding=10,
        borderColor=colors.grey,
        borderWidth=1,
        leftIndent=0,
        rightIndent=0
    ))
    
    elements = []
    width = A4[0] - 2 * doc.leftMargin  # Calculate available width

    # --- TITLE SECTION ---
    api_name = data.get("api_name") or title_fallback
    elements.append(Paragraph(f"API Validation Report: {api_name}", styles['CustomTitle']))
    
    # Validation date
    dt = data.get("validation_date")
    if dt:
        try:
            date_disp = datetime.fromisoformat(dt.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            date_disp = dt
        elements.append(Paragraph(f"Validation Date: {date_disp}", styles['Normal']))
    
    elements.append(Spacer(1, 24))

    # --- VALIDATION SUMMARY TABLE ---
    # Summary variables
    total = int(data.get("total_fields_compared", 0))
    matched = int(data.get("matched_fields", 0))
    unmatched = int(data.get("unmatched_fields", 0))
    extra = int(data.get("extra_fields", 0))
    missing = int(data.get("missing_fields", 0))
    accuracy = data.get("accuracy_score", "")
    
    summary_data = [
        ["Metric", "Value"],
        ["Total Fields Compared", str(total)],
        ["Matched Fields", str(matched)],
        ["Unmatched Fields", str(unmatched)],
        ["Extra Fields (API-only)", str(extra)],
        ["Missing Fields (Model-only)", str(missing)],
        ["Accuracy Score", f"{accuracy}%" if accuracy != "" else "N/A"],
    ]
    
    # Create summary table with improved styling
    summary_table = Table(summary_data, colWidths=[width * 0.7, width * 0.3])
    summary_table.setStyle(TableStyle([
        # Header row
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#003366")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 11),
        ("ALIGN", (0, 0), (-1, 0), "LEFT"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        
        # Data rows
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("ALIGN", (1, 1), (1, -1), "RIGHT"),  # Right-align values
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("PADDING", (0, 0), (-1, -1), 6),
        
        # Zebra striping for rows
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")])
    ]))
    
    elements.append(Paragraph("Validation Summary", styles['SectionHeading']))
    elements.append(summary_table)
    elements.append(Spacer(1, 24))

    # --- FIELD COMPARISON CHART ---
    # Create a more prominent chart
    chart_height = 180
    drawing = Drawing(width, chart_height)
    
    # Create bar chart
    chart = VerticalBarChart()
    chart.x = 80  # Increased left margin for y-axis labels
    chart.y = 40
    chart.height = chart_height - 60
    chart.width = width - 120  # Adjust width to accommodate labels
    
    # Chart data - using all four metrics
    chart.data = [[matched, unmatched, extra, missing]]
    chart.categoryAxis.categoryNames = ["Matched", "Unmatched", "Extra", "Missing"]
    
    # Set appropriate scale
    max_val = max(matched, unmatched, extra, missing, 1)
    # Round up to nearest multiple of 5 for clean axis
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = ((max_val // 5) + 1) * 5
    
    # Customize bar appearance
    chart.bars[0].fillColor = colors.HexColor("#4f81bd")  # Pleasant blue
    
    # Add value labels on top of bars
    for i, value in enumerate([matched, unmatched, extra, missing]):
        label = Label()
        label.setOrigin(chart.x + (i * (chart.width / 4)) + 15, chart.y + chart.height + 10)
        label.setText(str(value))
        label.fontSize = 9
        label.textAnchor = "middle"
        drawing.add(label)
    
    # Add chart title
    chart_title = Label()
    chart_title.setOrigin(width / 2, chart_height - 5)
    chart_title.setText("Field Comparison Overview")
    chart_title.fontSize = 11
    chart_title.fontName = "Helvetica-Bold"
    chart_title.textAnchor = "middle"
    drawing.add(chart_title)
    
    drawing.add(chart)
    elements.append(drawing)
    elements.append(Spacer(1, 24))

    # --- FIELD DETAILS TABLES ---
    all_fields = data.get("fields") or []
    
    # Process fields by category with improved formatting
    field_categories = [
        ("unmatched", "Unmatched Fields", colors.HexColor("#fff2cc")),  # Light orange
        ("missing", "Missing Fields", colors.HexColor("#fce5cd")),      # Light red
        ("extra", "Extra Fields", colors.HexColor("#fff9d6"))           # Light yellow
    ]
    
    for status_key, title, color in field_categories:
        category_fields = [f for f in all_fields if f.get("status") == status_key]
        
        if category_fields:
            elements.append(Paragraph(title, styles['SectionHeading']))
            
            # Define table data with simplified columns
            table_data = [["Field", "Issue", "Expected", "Actual", "Suggestion"]]
            
            for field in category_fields:
                # Format confidence if available
                confidence = field.get("confidence")
                conf_text = f" ({confidence}%)" if confidence else ""
                
                # Create table row
                table_data.append([
                    Paragraph(f"<b>{field.get('field_name', '')}</b>{conf_text}", styles['Normal']),
                    Paragraph(field.get('issue', '') or "—", styles['Normal']),
                    Paragraph(f"{field.get('expected_type', '')} {field.get('expected_format', '')}", styles['Normal']),
                    Paragraph(f"{field.get('actual_type', '')} {field.get('actual_format', '')}", styles['Normal']),
                    Paragraph(field.get('suggestion', '') or "—", styles['Normal'])
                ])
            
            # Create table with proportional column widths
            field_table = Table(table_data, colWidths=[width * 0.15, width * 0.2, width * 0.2, width * 0.2, width * 0.25])
            
            # Apply table styling
            field_table.setStyle(TableStyle([
                # Header row
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#003366")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 10),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                
                # Data rows
                ("BACKGROUND", (0, 1), (-1, -1), color),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 1), (-1, -1), 9),
                ("ALIGN", (0, 1), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                ("PADDING", (0, 0), (-1, -1), 5),
                ("WORDWRAP", (0, 0), (-1, -1), True),
            ]))
            
            elements.append(field_table)
            elements.append(Spacer(1, 16))

    # --- RECOMMENDATION SECTION ---
    recommendation = data.get("summary_recommendation", "No specific recommendations provided.")
    
    elements.append(Paragraph("Recommendation", styles['SectionHeading']))
    
    # Create a highlighted recommendation box
    recommendation_table = Table([[Paragraph(recommendation, styles['Normal'])]], 
                                colWidths=[width])
    recommendation_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f5f5")),
        ("BOX", (0, 0), (-1, -1), 1, colors.grey),
        ("PADDING", (0, 0), (-1, -1), 10),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
    ]))
    
    elements.append(recommendation_table)
    elements.append(Spacer(1, 12))

    # --- GENERATE PDF ---
    doc.build(elements)
    pdf = buf.getvalue()
    buf.close()
    
    return pdf