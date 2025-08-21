from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional
from report_renderer import generate_pdf_bytes

app = FastAPI(title="AI Validator Report Service")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Updated FieldItem for new report structure
class FieldItem(BaseModel):
    field_name: str
    status: str  # matched, unmatched, extra, missing
    expected_type: Optional[str] = None
    actual_type: Optional[str] = None
    expected_format: Optional[str] = None
    actual_format: Optional[str] = None
    issue: Optional[str] = ""
    suggestion: Optional[str] = ""
    confidence: Optional[float] = None
    rationale: Optional[str] = ""


# Updated ReportInput for new report structure
class ReportInput(BaseModel):
    api_name: str = "Unnamed API"
    validation_date: Optional[str] = None
    total_fields_compared: int = 0
    matched_fields: int = 0
    unmatched_fields: int = 0
    extra_fields: int = 0
    missing_fields: int = 0
    accuracy_score: Optional[int] = None
    summary_recommendation: Optional[str] = ""
    fields: List[FieldItem] = Field(default_factory=list)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/render", response_class=Response)
def render(payload: ReportInput):
    pdf = generate_pdf_bytes(payload.model_dump())
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=report.pdf"},
    )
