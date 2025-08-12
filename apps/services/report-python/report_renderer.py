from datetime import datetime
from io import BytesIO
from typing import Dict, List

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.textlabels import Label
from reportlab.lib.units import inch

def generate_pdf_bytes(data: Dict, title_fallback: str = "API Validation Report") -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=0.5*inch, bottomMargin=0.5*inch,
        leftMargin=0.5*inch, rightMargin=0.5*inch
    )
    styles = getSampleStyleSheet()
    elements: List = []

    # Title & date
    api_name = data.get("api_name") or title_fallback
    elements.append(Paragraph(f"{title_fallback}: {api_name}", styles["Title"]))
    dt = data.get("validation_date")
    if dt:
        try:
            date_disp = datetime.fromisoformat(dt.replace("Z","+00:00")).strftime("%Y-%m-%d %H:%M UTC")
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(f"Validation Date: {date_disp}", styles["Normal"]))
        except Exception:
            pass
    elements.append(Spacer(1, 18))

    # Summary table
    total = int(data.get("total_fields_compared", 0))
    matched = int(data.get("matched_fields", 0))
    unmatched = int(data.get("unmatched_fields", 0))
    extra = int(data.get("extra_fields", 0))
    missing = int(data.get("missing_fields", 0))
    accuracy = data.get("accuracy_score", "")

    width = A4[0] - 2*inch
    summary_rows = [
        ["Metric", "Value"],
        ["Total Fields Compared", str(total)],
        ["Matched Fields", str(matched)],
        ["Unmatched Fields", str(unmatched)],
        ["Extra Fields (API-only)", str(extra)],
        ["Missing Fields (Model-only)", str(missing)],
        ["Accuracy Score", f"{accuracy}%"] if accuracy != "" else ["Accuracy Score", "—"],
    ]
    summary = Table(summary_rows, colWidths=[width*0.6, width*0.4])
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("GRID", (0,0), (-1,-1), 0.5, colors.grey),
        ("ALIGN", (0,0), (-1,-1), "LEFT"),
    ]))
    elements += [Paragraph("Validation Summary", styles["Heading2"]), Spacer(1,6), summary, Spacer(1, 16)]

    # Bar chart
    drawing = Drawing(width, 200)
    chart = VerticalBarChart()
    chart.x, chart.y = 50, 30
    chart.height, chart.width = 125, width - 100
    chart.data = [[matched, unmatched, extra, missing]]
    chart.categoryAxis.categoryNames = ["Matched", "Unmatched", "Extra", "Missing"]
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(total, matched + unmatched + extra + missing, 1)
    chart.valueAxis.valueStep = max(chart.valueAxis.valueMax // 5, 1)
    chart.bars[0].fillColor = colors.lightblue

    label = Label(); label.setOrigin(width//2, 180); label.boxAnchor = "n"; label.setText("Field Comparison")
    drawing.add(chart); drawing.add(label)
    elements += [drawing, Spacer(1, 16)]

    # Unmatched table
    unmatched_list = [f for f in (data.get("fields") or []) if f.get("status") == "unmatched"]
    if unmatched_list:
        table_rows = [["Field Name", "Issue", "Expected Type", "Actual Type", "Suggestion"]]
        for f in unmatched_list:
            table_rows.append([
                f.get("field_name",""),
                f.get("issue",""),
                f.get("expected_type",""),
                f.get("actual_type","") or "N/A",
                f.get("suggestion",""),
            ])
        table = Table(table_rows, colWidths=[width*0.22, width*0.28, width*0.16, width*0.16, width*0.18], repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.lightgrey),
            ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
            ("GRID", (0,0), (-1,-1), 0.5, colors.grey),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
        ]))
        elements += [Paragraph("Unmatched Fields", styles["Heading2"]), Spacer(1,6), table, Spacer(1, 16)]

    # Recommendation
    elements += [
        Paragraph("Recommendation", styles["Heading2"]),
        Spacer(1, 6),
        Paragraph(data.get("summary_recommendation", "No recommendations provided."), styles["Normal"])
    ]

    doc.build(elements)
    pdf = buf.getvalue()
    buf.close()
    return pdf
