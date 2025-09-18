from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from report_renderer import generate_pdf_bytes


# ---- Logging ----
logger = logging.getLogger("report-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


# ---- FastAPI app ----
app = FastAPI(title="AI Validator Report Service", version="0.1.1")

# CORS (tune origins as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Timing middleware ----
@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    from time import perf_counter

    start = perf_counter()
    logger.info(f"→ {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        return response
    finally:
        dur_ms = (perf_counter() - start) * 1000
        logger.info(f"← {request.method} {request.url.path} in {dur_ms:.1f}ms")


class RenderInput(BaseModel):
    """Accept any JSON payload; keep keys for downstream renderer.

    This model is permissive (allows extra fields) so your existing clients
    continue to work. If you want strict validation, declare explicit fields
    and set `model_config = ConfigDict(extra='forbid')`.
    """

    # Minimal commonly used fields; the rest are allowed and forwarded.
    api_name: str | None = None

    model_config = {
        "extra": "allow",  # allow arbitrary additional fields
    }


@app.get("/health", summary="Health")
async def health():
    return {"status": "ok"}


@app.post("/render", summary="Render", response_class=Response)
async def render(payload: RenderInput) -> Response:
    """Generate a PDF from the incoming JSON.

    - Offloads CPU/IO work to a thread (so the event loop never stalls).
    - Applies an overall timeout to prevent infinite hangs.
    """
    # Convert to plain dict for the renderer
    data: Dict[str, Any] = payload.model_dump()

    try:
        pdf_bytes: bytes = await asyncio.wait_for(
            run_in_threadpool(generate_pdf_bytes, data),
            timeout=30.0,  # seconds; adjust based on expected payload size
        )
    except asyncio.TimeoutError as e:
        logger.exception("PDF generation timed out")
        raise HTTPException(status_code=504, detail="PDF generation timed out") from e
    except ValueError as e:
        # Renderer raised a known validation problem
        logger.exception("Bad input for PDF generation")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # defensive: convert unexpected errors to 500
        logger.exception("Unhandled error during PDF generation")
        raise HTTPException(status_code=500, detail="Failed to generate PDF") from e

    headers = {
        "Content-Disposition": "inline; filename=report.pdf",
        "Cache-Control": "no-store",
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


