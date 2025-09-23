from __future__ import annotations

import io
import re
from typing import Any, Dict, List
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    LongTable,
    Table,
    TableStyle,
)

# -------- Color Scheme & Constants --------
COLORS = {
    "primary": colors.HexColor("#2C5AA0"),   
    "success": colors.HexColor("#28A745"),    
    "warning": colors.HexColor("#FFC107"),    
    "error": colors.HexColor("#DC3545"),        
    "background": colors.HexColor("#F8F9FA"), 
    "text": colors.HexColor("#212529"),         
    "light_text": colors.HexColor("#6C757D"),   
}

# -------- Helper Functions --------
def _soft_wrap(text: str | None, every: int = 30) -> str:
    """Insert soft hyphens in very long unbroken tokens only."""
    if not text:
        return ""
    
    words = text.split()
    wrapped_words = []
    
    for word in words:
        if len(word) > every:
            wrapped_word = '­'.join([word[i:i+every] for i in range(0, len(word), every)])
            wrapped_words.append(wrapped_word)
        else:
            wrapped_words.append(word)
    
    return ' '.join(wrapped_words)

def _clip(text: str, limit: int = 1000) -> str:
    """Safely truncate very long text with ellipsis."""
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "…"

def _p(text: str, style: ParagraphStyle) -> Paragraph:
    """Create a Paragraph with safe text handling."""
    return Paragraph(_soft_wrap(_clip(text)), style)

def _fmt_date(dt: str | None) -> str:
    """Format date string to readable format."""
    if not dt:
        return ""
    try:
        if "T" in dt:
            dt = dt.replace("Z", "+00:00")
            return datetime.fromisoformat(dt).strftime("%Y-%m-%d %H:%M")
        else:
            return str(dt)
    except Exception:
        return str(dt)[:20]

def _safe_int(x: Any, default: int = 0) -> int:
    """Safely convert to integer with default fallback."""
    try:
        return int(x)
    except (TypeError, ValueError):
        return default

def _safe_float(x: Any, default: float = 0.0) -> float:
    """Safely convert to float with default fallback."""
    try:
        return float(x)
    except (TypeError, ValueError):
        return default

def _format_accuracy_score(score: Any) -> str:
    """Format accuracy score consistently."""
    if score is None:
        return "N/A"
    try:
        score_float = float(score)
        return f"{score_float:.1%}" if score_float <= 1.0 else f"{score_float:.1f}%"
    except (TypeError, ValueError):
        return str(score)

def _compute_status_counts(fields: List[Dict[str, Any]]) -> Dict[str, int]:
    """Calculate statistics for field statuses."""
    stats = {"matched": 0, "missing": 0, "extra": 0, "unmatched": 0, "other": 0}
    for f in fields:
        s = str(f.get("status") or "").lower()
        if s in stats:
            stats[s] += 1
        elif s:
            stats["other"] += 1
    return stats

def _create_text_chart(stats: Dict[str, int], width: int = 20) -> str:
    """Create a text-based visualization."""
    total = sum(stats.values())
    if total == 0:
        return "No data available"
    
    chart = []
    for status, count in stats.items():
        if status != "other" and count > 0:
            percentage = (count / total) * 100
            chart.append(f"{status.capitalize():<10} {count} fields ({percentage:.1f}%)")
    
    return "<br/>".join(chart)

def _generate_recommendations(stats: Dict[str, int], total_fields: int) -> str:
    """Generate actionable recommendations based on validation results."""
    recommendations = []
    
    if stats['missing'] > 0:
        recommendations.append(f"• Add {stats['missing']} missing required fields")
    if stats['extra'] > 0:
        recommendations.append(f"• Review {stats['extra']} unexpected fields")
    if total_fields > 0:
        success_rate = (stats['matched'] / total_fields) * 100
        if success_rate < 80:
            recommendations.append("• Consider field mapping improvements")
        if success_rate > 95:
            recommendations.append("• Excellent field mapping quality")
    
    return "<br/>".join(recommendations) if recommendations else "• No immediate actions required"

def _create_executive_summary(stats: Dict[str, int], total_fields: int) -> tuple[str, colors.Color]:
    """Create an executive summary with status assessment."""
    if total_fields == 0:
        return "No fields to validate", COLORS["light_text"]
    
    success_rate = (stats['matched'] / total_fields) * 100
    
    if stats['matched'] == total_fields:
        summary = "Perfect - All fields validated successfully"
        color = COLORS["success"]
    elif success_rate >= 90:
        summary = "Excellent - Minimal validation issues"
        color = COLORS["success"]
    elif success_rate >= 80:
        summary = "Good - Some improvements needed"
        color = COLORS["warning"]
    elif success_rate >= 60:
        summary = "Fair - Significant improvements needed"
        color = COLORS["warning"]
    else:
        summary = "Poor - Major validation issues detected"
        color = COLORS["error"]
    
    return summary, color

def _group_fields_by_priority(fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Group fields by priority (issues first)."""
    priority_order = ["missing", "extra", "unmatched", "matched", "other"]
    grouped = {status: [] for status in priority_order}
    
    for field in fields:
        status = str(field.get("status", "")).lower()
        grouped.get(status, grouped["other"]).append(field)
    
    return [field for status in priority_order for field in grouped[status]]

# -------- Core Rendering Function --------
def generate_pdf_bytes(data: Dict[str, Any]) -> bytes:
    """Generate professional PDF report with clean, minimal design."""

    buf = io.BytesIO()
    margin = 14 * mm
    pagesize = A4

    doc = SimpleDocTemplate(
        buf,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=margin,
        title=str(data.get("api_name") or "AI Validator Report"),
        author="AI Validator",
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        name="Title",
        parent=styles["Heading1"],
        fontSize=20,
        textColor=COLORS["primary"],
        spaceAfter=6,
        alignment=1,  
        fontName="Helvetica-Bold",
    )
    
    h_style = ParagraphStyle(
        name="Heading",
        parent=styles["Heading3"],
        fontSize=12,
        textColor=COLORS["primary"],
        spaceAfter=6,
        fontName="Helvetica-Bold",
    )
    
    normal = ParagraphStyle(
        name="Normal",
        parent=styles["BodyText"],
        fontSize=10,
        textColor=COLORS["text"],
        leading=12,
    )
    
    small = ParagraphStyle(
        name="Small",
        parent=normal,
        fontSize=9,
        textColor=COLORS["light_text"],
        leading=11,
    )
    
    wrap_style = ParagraphStyle(
        name="WrapBody",
        parent=normal,
        fontSize=9,
        leading=12,
        wordWrap="CJK",
        splitLongWords=True,
    )
    
    highlight_style = ParagraphStyle(
        name="Highlight",
        parent=normal,
        fontSize=11,
        textColor=COLORS["primary"],
        leading=13,
        fontName="Helvetica-Bold",
    )

    elements: List[Any] = []

    # --- Header Section ---
    title = str(data.get("api_name") or "AI Validation Report")
    elements.append(_p(title, title_style))
    
    # Minimal metadata
    metadata = []
    if data.get("validation_date"):
        metadata.append(f"Validated: {_fmt_date(data['validation_date'])}")
    if data.get("api_version"):
        metadata.append(f"Version: {data['api_version']}")
    
    if metadata:
        elements.append(_p(" • ".join(metadata), small))
    
    elements.append(Spacer(0, 8 * mm))

    # --- Fields Data ---
    fields: List[Dict[str, Any]] = list(data.get("fields") or [])
    stats = _compute_status_counts(fields)
    total_fields = _safe_int(data.get("total_fields_compared", len(fields)))

    # --- Executive Summary ---
    summary_text, summary_color = _create_executive_summary(stats, total_fields)
    
    summary_style = ParagraphStyle(
        name="Summary",
        parent=highlight_style,
        textColor=summary_color,
        backColor=COLORS["background"],
        borderPadding=8,
        leftIndent=10,
    )
    
    elements.append(_p(summary_text, summary_style))
    elements.append(Spacer(0, 6 * mm))

    # --- Key Metrics ---
    elements.append(_p("Key Metrics", h_style))
    
    success_rate = (stats['matched'] / total_fields * 100) if total_fields > 0 else 0
    
    kpi_rows = [
        ["Accuracy", _format_accuracy_score(data.get("accuracy_score"))],
        ["Matched", f"{stats['matched']} of {total_fields} fields"],
        ["Missing Fields", f"{stats['missing']}"],
        ["Extra Fields", f"{stats['extra']}"],
        ["Success Rate", f"{success_rate:.1f}%"],
    ]
    
    try:
        kpi_table = Table(kpi_rows, colWidths=[50 * mm, 45 * mm])
        kpi_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("ALIGN", (0, 0), (0, -1), "LEFT"),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("PADDING", (0, 0), (-1, -1), 6),
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, COLORS["background"]),
        ]))
        elements.append(kpi_table)
        elements.append(Spacer(0, 4 * mm))
    except Exception:
    
        elements.append(_p(f"Matched: {stats['matched']} | Missing: {stats['missing']} | Extra: {stats['extra']}", normal))

    # --- Field Distribution ---
    if total_fields > 0:
        elements.append(_p("Field Distribution", h_style))
        elements.append(_p(_create_text_chart(stats), small))
        elements.append(Spacer(0, 6 * mm))

    # --- Detailed Table ---
    if fields:
        elements.append(_p("Field Details", h_style))
        elements.append(Spacer(0, 2 * mm))
        sorted_fields = _group_fields_by_priority(fields)

        table_header = ["Field", "Status", "Issue", "Expected", "Actual", "Suggestion"]

        page_w, _ = pagesize
        usable_w = page_w - doc.leftMargin - doc.rightMargin
        col_widths = [
            usable_w * 0.16,  
            usable_w * 0.12,  
            usable_w * 0.24,  
            usable_w * 0.14,  
            usable_w * 0.14,  
            usable_w * 0.20,  
        ]

        data_rows: List[List[Any]] = [table_header]
        status_list: List[str] = []

        for f in sorted_fields:
            field_name = str(f.get("field_name") or f.get("name") or "—")
            status_raw = str(f.get("status") or "—")
            status_list.append(status_raw.lower())

            issue = f.get("issue") or f.get("description") or f.get("rationale") or ""
            expected = " ".join(
                str(x) for x in [f.get("expected_type"), f.get("expected_format")]
                if x not in (None, "", "None")
            ).strip()
            actual = " ".join(
                str(x) for x in [f.get("actual_type"), f.get("actual_format"), f.get("actual_info")]
                if x not in (None, "", "None")
            ).strip()
            suggestion = str(f.get("suggestion") or "")

            row = [
                _p(field_name, wrap_style),
                _p(status_raw.capitalize(), wrap_style),
                _p(issue, wrap_style),
                _p(expected or "—", wrap_style),
                _p(actual or "—", wrap_style),
                _p(suggestion or "—", wrap_style),
            ]
            data_rows.append(row)

        try:
            table = LongTable(
                data_rows,
                colWidths=col_widths,
                repeatRows=1,
                splitByRow=1,
                spaceBefore=2,
                spaceAfter=2,
            )

           
            style_cmds = [
           
                ("BACKGROUND", (0, 0), (-1, 0), COLORS["primary"]),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                

                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLORS["background"]]),
             
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DEE2E6")),
                ("PADDING", (0, 0), (-1, -1), 6),
            ]

            status_colors = {
                "matched": colors.HexColor("#D4EDDA"),
                "missing": colors.HexColor("#F8D7DA"),
                "extra": colors.HexColor("#FFF3CD"),
                "unmatched": colors.HexColor("#E2E3E5"),
            }

            for i, status in enumerate(status_list, start=1):
                status_lower = status.lower()
                for key, color in status_colors.items():
                    if key in status_lower:
                        style_cmds.append(("BACKGROUND", (1, i), (1, i), color))
                        break

            table.setStyle(TableStyle(style_cmds))
            elements.append(table)
            
        except Exception as e:
            elements.append(_p("Error displaying detailed table. Showing summary:", normal))
            for i, f in enumerate(sorted_fields[:10]):
                field_name = str(f.get("field_name") or f.get("name") or "Unknown")
                status = str(f.get("status") or "—")
                elements.append(_p(f"{i+1}. {field_name}: {status}", wrap_style))
            if len(sorted_fields) > 10:
                elements.append(_p(f"... and {len(sorted_fields) - 10} more fields", wrap_style))
    else:
        elements.append(_p("No field-level details provided.", normal))

    # --- Recommendations Section ---
    elements.append(Spacer(0, 6 * mm))
    elements.append(_p("Recommended Actions", h_style))
    
    recommendations = _generate_recommendations(stats, total_fields)
    elements.append(_p(recommendations, wrap_style))

    # --- Footer ---
    elements.append(Spacer(0, 8 * mm))
    
    footer_style = ParagraphStyle(
        name="Footer",
        parent=small,
        alignment=1,  # Center
        textColor=COLORS["light_text"],
    )
    
    footer_text = f"Generated on {datetime.now().strftime('%Y-%m-%d at %H:%M')} • AI Validator Report"
    elements.append(_p(footer_text, footer_style))

    # --- Build Document ---
    if not elements:
        raise ValueError("Nothing to render")
    
    try:
        doc.build(elements)
        buf.seek(0)
        return buf.getvalue()
    except Exception as e:
        error_buf = io.BytesIO()
        error_doc = SimpleDocTemplate(error_buf, pagesize=A4)
        error_elements = [
            _p("Error Generating Report", title_style),
            _p(f"An error occurred: {str(e)}", normal),
            _p("Please check the input data and try again.", normal),
        ]
        error_doc.build(error_elements)
        error_buf.seek(0)
        return error_buf.getvalue()