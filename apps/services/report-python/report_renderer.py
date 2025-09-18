from __future__ import annotations

import io
import re
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    LongTable,
    TableStyle,
)


# -------- Helpers for robust layout --------
_ZWSP = "\u200b"  # zero-width space to make long tokens wrappable


def _soft_wrap(text: str | None, every: int = 30) -> str:
    """Insert invisible break points in long unbroken tokens so ReportLab can wrap.
    E.g., 'averyverylongword' -> 'averyverylongword' with zero-width spaces.
    """
    if not text:
        return ""
    # Break only long runs of non-space characters.
    return re.sub(rf"(\S{{{every}}})", rf"\1{_ZWSP}", text)


def _clip(text: str, limit: int = 2000) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "…"


def _p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(_soft_wrap(_clip(text)), style)


# -------- Core rendering --------

def generate_pdf_bytes(data: Dict[str, Any]) -> bytes:
    """Builds a compact, safe-to-render PDF from the incoming dict.

    Expected top-level keys are flexible. If present, we use a few common ones:
      - api_name, validation_date, summary_recommendation, accuracy_score
      - fields: list of dicts with per-field info
    The function is defensive against missing keys and very long strings.
    """

    # Prepare buffer/doc
    buf = io.BytesIO()
    margin = 16 * mm
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

    # Styles
    styles = getSampleStyleSheet()
    title_style = styles["Heading1"]
    h_style = styles["Heading3"]
    normal = styles["BodyText"]

    # Create a smaller, wrap-friendly paragraph style
    wrap_style = ParagraphStyle(
        name="WrapBody",
        parent=normal,
        fontSize=9,
        leading=12,
        wordWrap="CJK",  # allows breaking long words, plus our ZWSP
    )

    elements: List[Any] = []

    # Header
    title = str(data.get("api_name") or "AI Validator Report")
    elements.append(_p(title, title_style))
    elements.append(Spacer(0, 4 * mm))

    # Summary block
    meta_lines: List[str] = []
    if data.get("validation_date"):
        meta_lines.append(f"Validation date: {data['validation_date']}")
    if data.get("total_fields_compared") is not None:
        meta_lines.append(f"Total fields compared: {data['total_fields_compared']}")
    if data.get("accuracy_score") is not None:
        meta_lines.append(f"Accuracy score: {data['accuracy_score']}")

    if meta_lines:
        elements.append(_p("<br/>".join(map(str, meta_lines)), normal))
        elements.append(Spacer(0, 3 * mm))

    if data.get("summary_recommendation"):
        elements.append(_p(f"<b>Summary:</b> {str(data['summary_recommendation'])}", normal))
        elements.append(Spacer(0, 5 * mm))

    # Fields table (single robust table instead of multiple fragile ones)
    fields: List[Dict[str, Any]] = list(data.get("fields") or [])

    if fields:
        elements.append(_p("Fields", h_style))

        # Table header
        table_header = [
            "Field",
            "Status",
            "Issue / Description",
            "Expected",
            "Actual",
            "Suggestion",
        ]

        # Compute available width to set column widths
        page_w, page_h = pagesize
        usable_w = page_w - doc.leftMargin - doc.rightMargin

        col_widths = [
            usable_w * 0.18,  # Field
            usable_w * 0.10,  # Status
            usable_w * 0.28,  # Issue / Description
            usable_w * 0.14,  # Expected
            usable_w * 0.14,  # Actual
            usable_w * 0.16,  # Suggestion
        ]

        data_rows = [table_header]
        for f in fields:
            field_name = str(f.get("field_name") or f.get("name") or "—")
            status = str(f.get("status") or "—")

            issue = (
                f.get("issue")
                or f.get("description")
                or f.get("rationale")
                or ""
            )
            expected = " ".join(
                str(x)
                for x in [f.get("expected_type"), f.get("expected_format")]
                if x not in (None, "")
            )
            actual = " ".join(
                str(x)
                for x in [f.get("actual_type"), f.get("actual_format"), f.get("actual_info")]
                if x not in (None, "")
            )
            suggestion = str(f.get("suggestion") or "")

            row = [
                _p(str(field_name), wrap_style),
                _p(str(status), wrap_style),
                _p(str(issue), wrap_style),
                _p(str(expected), wrap_style),
                _p(str(actual), wrap_style),
                _p(str(suggestion), wrap_style),
            ]
            data_rows.append(row)

        table = LongTable(
            data_rows,
            colWidths=col_widths,
            repeatRows=1,
            splitByRow=1,
            spaceBefore=4,
            spaceAfter=4,
        )

        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )

        elements.append(table)

    else:
        elements.append(_p("No field-level details provided.", normal))

    # Footer spacer
    elements.append(Spacer(0, 6 * mm))

    # Build the document (raise ValueError on empty elements to catch early)
    if not elements:
        raise ValueError("Nothing to render")

    doc.build(elements)

    buf.seek(0)
    return buf.getvalue()
