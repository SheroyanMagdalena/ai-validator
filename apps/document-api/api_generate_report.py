import requests
import json
from datetime import datetime
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
)
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.graphics.shapes import Drawing
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.textlabels import Label
from reportlab.lib.units import inch

# Function to generate PDF
def generate_pdf(data, output_filename="ai_validation_report.pdf"):
    doc = SimpleDocTemplate(output_filename, pagesize=A4, 
                          topMargin=0.5*inch, bottomMargin=0.5*inch,
                          leftMargin=0.5*inch, rightMargin=0.5*inch)
    styles = getSampleStyleSheet()
    elements = []

    title = f"API Validation Report: {data['api_name']}"
    date = datetime.fromisoformat(data["validation_date"].replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M UTC")
    elements.append(Paragraph(title, styles['Title']))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph(f"Validation Date: {date}", styles['Normal']))
    elements.append(Spacer(1, 20))

    summary_data = [
        ["Metric", "Value"],
        ["Total Fields Compared", str(data["total_fields_compared"])],
        ["Matched Fields", str(data["matched_fields"])],
        ["Unmatched Fields", str(data["unmatched_fields"])],
        ["Accuracy Score", f"{data['accuracy_score']}%"]
    ]
    
    available_width = A4[0] - 2*inch
    summary_table = Table(summary_data, colWidths=[available_width*0.6, available_width*0.4])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
        ("ALIGN", (0, 0), (-1, -1), 'LEFT'),
        ("FONTNAME", (0, 0), (-1, 0), 'Helvetica-Bold'),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), 'MIDDLE'),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    
    elements.append(Paragraph("Validation Summary", styles['Heading2']))
    elements.append(Spacer(1, 6))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
 
    drawing = Drawing(available_width, 200)
    chart = VerticalBarChart()
    chart.x = 50
    chart.y = 30
    chart.height = 125
    chart.width = available_width - 100
    chart.data = [[data["matched_fields"], data["unmatched_fields"]]]
    chart.categoryAxis.categoryNames = ["Matched", "Unmatched"]
    chart.bars[0].fillColor = colors.lightblue
    chart.barWidth = 20
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = max(data["total_fields_compared"], 1)
    chart.valueAxis.valueStep = max(data["total_fields_compared"] // 5, 1)

    label = Label()
    label.setOrigin(available_width//2, 180)
    label.boxAnchor = 'n'
    label.setText("Field Match Distribution")
    drawing.add(chart)
    drawing.add(label)
    elements.append(drawing)
    elements.append(Spacer(1, 20))

    unmatched = [f for f in data["fields"] if f["status"] == "unmatched"]
    if unmatched:
        elements.append(Paragraph("Unmatched Fields", styles['Heading2']))
        elements.append(Spacer(1, 6))
        
        table_data = [["Field Name", "Issue", "Expected Type", "Actual Type", "Suggestion"]]
        for f in unmatched:
            table_data.append([
                Paragraph(f.get("field_name", ""), styles['Normal']),
                Paragraph(f.get("issue", ""), styles['Normal']),
                Paragraph(f.get("expected_type", ""), styles['Normal']),
                Paragraph(f.get("actual_type", "N/A") if f.get("actual_type") else "N/A", styles['Normal']),
                Paragraph(f.get("suggestion", ""), styles['Normal'])
            ])
        
        col_widths = [
            available_width * 0.18,
            available_width * 0.25,
            available_width * 0.15,
            available_width * 0.15,
            available_width * 0.27
        ]
        
        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
            ("ALIGN", (0, 0), (-1, -1), 'LEFT'),
            ("FONTNAME", (0, 0), (-1, 0), 'Helvetica-Bold'),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), 'TOP'),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 20))

    elements.append(Paragraph("Recommendation", styles['Heading2']))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(data.get("summary_recommendation", "No recommendations provided."), styles['Normal']))

    doc.build(elements)
    print(f"✅ PDF generated: {output_filename}")


def fetch_data_from_api(api_url):
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"❌ Failed to fetch data: {e}")
        return None


def create_sample_data():
    """Create sample data for testing"""
    return {
        "api_name": "Test API",
        "validation_date": "2025-08-07T10:30:00Z",
        "total_fields_compared": 10,
        "matched_fields": 7,
        "unmatched_fields": 3,
        "accuracy_score": 70,
        "fields": [
            {
                "field_name": "user_id",
                "status": "unmatched",
                "issue": "Type mismatch",
                "expected_type": "integer",
                "actual_type": "string",
                "suggestion": "Convert to integer"
            },
            {
                "field_name": "email",
                "status": "unmatched",
                "issue": "Missing validation",
                "expected_type": "email",
                "actual_type": "string",
                "suggestion": "Add email validation"
            }
        ],
        "summary_recommendation": "Fix type mismatches and add proper validation for email fields."
    }


if __name__ == "__main__":
    API_URL = "http://localhost:3000/api/validation"
    json_data = fetch_data_from_api(API_URL)
    
    if not json_data:
        print("API not available, using sample data...")
        json_data = create_sample_data()
    
    if json_data:
        generate_pdf(json_data)
