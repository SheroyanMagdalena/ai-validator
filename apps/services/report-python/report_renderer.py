from datetime import datetime
from io import BytesIO
from typing import Dict

from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, LongTable
)
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.textlabels import Label
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
import math


def generate_pdf_bytes(data: Dict, title_fallback: str = "API Validation Report") -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch
    )

    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name='CustomTitle',
        parent=styles['Title'],
        fontSize=16,
        spaceAfter=12,
        alignment=TA_LEFT
    ))

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

    wrap_style = ParagraphStyle(
        name='Wrapped',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        wordWrap='LTR'
    )

    elements = []
    usable_width = A4[0] - doc.leftMargin - doc.rightMargin

    # Title and date
    api_name = data.get("api_name") or title_fallback
    elements.append(Paragraph(f"API Validation Report: {api_name}", styles['CustomTitle']))

    dt = data.get("validation_date")
    if dt:
        try:
            date_disp = datetime.fromisoformat(dt.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M UTC")
        except Exception:
            date_disp = dt
        elements.append(Paragraph(f"Validation Date: {date_disp}", wrap_style))

    elements.append(Spacer(1, 24))

    # Summary table
    total = int(data.get("total_fields_compared", 0))
    matched = int(data.get("matched_fields", 0))
    unmatched = int(data.get("unmatched_fields", 0))
    extra = int(data.get("extra_fields", 0))
    missing = int(data.get("missing_fields", 0))
    accuracy = data.get("accuracy_score", "")

    summary_data = [
        [Paragraph("<b>Metric</b>", wrap_style), Paragraph("<b>Value</b>", wrap_style)],
        [Paragraph("Total Fields Compared", wrap_style), Paragraph(str(total), wrap_style)],
        [Paragraph("Matched Fields", wrap_style), Paragraph(str(matched), wrap_style)],
        [Paragraph("Unmatched Fields", wrap_style), Paragraph(str(unmatched), wrap_style)],
        [Paragraph("Extra Fields (API-only)", wrap_style), Paragraph(str(extra), wrap_style)],
        [Paragraph("Missing Fields (Model-only)", wrap_style), Paragraph(str(missing), wrap_style)],
        [Paragraph("Accuracy Score", wrap_style), Paragraph(f"{accuracy}%" if accuracy != "" else "N/A", wrap_style)],
    ]

    summary_table = Table(summary_data, colWidths=[usable_width*0.6, usable_width*0.4])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#003366")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.whitesmoke),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 10),
        ("ALIGN", (0,0), (-1,0), "CENTER"),
        ("GRID", (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3)
    ]))

    elements.append(Paragraph("Validation Summary", styles['SectionHeading']))
    elements.append(summary_table)
    elements.append(Spacer(1, 24))

    # Chart
    chart_height = 180
    drawing = Drawing(usable_width, chart_height)
    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 40
    chart.height = chart_height - 60
    chart.width = usable_width - 100
    chart.data = [[matched, unmatched, extra, missing]]
    chart.categoryAxis.categoryNames = ["Matched", "Unmatched", "Extra", "Missing"]

    max_val = max(matched, unmatched, extra, missing, 1)
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = math.ceil(max_val / 10) * 10 if max_val > 10 else 10

    bar_colors = [colors.HexColor("#4f81bd"), colors.HexColor("#e69138"),
                  colors.HexColor("#6aa84f"), colors.HexColor("#cc0000")]
    for i, bar in enumerate(chart.bars):
        bar.fillColor = bar_colors[i % 4]

    for i, value in enumerate([matched, unmatched, extra, missing]):
        label = Label()
        label.setOrigin(chart.x + (i * chart.width / 4) + 15, chart.y + chart.height + 10)
        label.setText(str(value))
        label.fontSize = 9
        label.textAnchor = "middle"
        drawing.add(label)

    chart_title = Label()
    chart_title.setOrigin(usable_width / 2, chart_height - 5)
    chart_title.setText("Field Comparison Overview")
    chart_title.fontSize = 11
    chart_title.fontName = "Helvetica-Bold"
    chart_title.textAnchor = "middle"
    drawing.add(chart_title)

    drawing.add(chart)
    elements.append(drawing)
    elements.append(Spacer(1, 24))

    # Field tables
    all_fields = data.get("fields") or []
    field_categories = [
        ("unmatched", "Unmatched Fields", colors.HexColor("#fff2cc")),
        ("missing", "Missing Fields", colors.HexColor("#fce5cd")),
        ("extra", "Extra Fields", colors.HexColor("#fff9d6"))
    ]

    for status_key, title, color in field_categories:
        category_fields = [f for f in all_fields if f.get("status") == status_key]
        if category_fields:
            elements.append(Paragraph(title, styles['SectionHeading']))

            table_data = [[
                Paragraph("<b>Field</b>", wrap_style),
                Paragraph("<b>Issue</b>", wrap_style),
                Paragraph("<b>Expected</b>", wrap_style),
                Paragraph("<b>Actual</b>", wrap_style),
                Paragraph("<b>Suggestion</b>", wrap_style)
            ]]

            for field in category_fields:
                confidence = field.get("confidence")
                conf_text = f" ({confidence}%)" if confidence else ""
                table_data.append([
                    Paragraph(f"<b>{field.get('field_name','')}</b>{conf_text}", wrap_style),
                    Paragraph(field.get('issue','') or "—", wrap_style),
                    Paragraph(f"{field.get('expected_type','')} {field.get('expected_format','')}", wrap_style),
                    Paragraph(f"{field.get('actual_type','')} {field.get('actual_format','')}", wrap_style),
                    Paragraph(field.get('suggestion','') or "—", wrap_style)
                ])

            col_widths = [usable_width*0.18, usable_width*0.24, usable_width*0.16, usable_width*0.16, usable_width*0.26]
            field_table = LongTable(table_data, colWidths=col_widths, repeatRows=1, splitByRow=1)
            field_table.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#003366")),
                ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                ('FONTNAME', (0,0), (-1,0), "Helvetica-Bold"),
                ('FONTSIZE', (0,0), (-1,0), 8),
                ('ALIGN', (0,0), (-1,0), "CENTER"),
                ('BOTTOMPADDING', (0,0), (-1,0), 6),
                ('BACKGROUND', (0,1), (-1,-1), color),
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('LEFTPADDING', (0,0), (-1,-1), 2),
                ('RIGHTPADDING', (0,0), (-1,-1), 2),
                ('TOPPADDING', (0,0), (-1,-1), 2),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ('FONTSIZE', (0,1), (-1,-1), 7),
                ('WORDWRAP', (0,0), (-1,-1), 'LTR'),
                ('GRID', (0,0), (-1,-1), 0.5, colors.lightgrey),
            ]))

            elements.append(field_table)
            elements.append(Spacer(1, 10))

    # Recommendation
    recommendation = data.get("summary_recommendation", "No specific recommendations provided.")
    elements.append(Paragraph("Recommendation", styles['SectionHeading']))
    rec_table = Table([[Paragraph(recommendation, wrap_style)]], colWidths=[usable_width])
    rec_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#f5f5f5")),
        ("BOX", (0,0), (-1,-1), 1, colors.grey),
        ("PADDING", (0,0), (-1,-1), 10),
        ("ALIGN", (0,0), (-1,-1), "LEFT"),
    ]))
    elements.append(rec_table)
    elements.append(Spacer(1, 12))

    doc.build(elements)
    pdf = buf.getvalue()
    buf.close()
    return pdf
