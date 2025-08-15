from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional
from report_renderer import generate_pdf_bytes

app = FastAPI(title="AI Validator Report Service")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FieldItem(BaseModel):
    field_name: str
    status: str                        
    expected_type: Optional[str] = ""
    actual_type: Optional[str] = ""
    issue: Optional[str] = ""
    suggestion: Optional[str] = ""

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
