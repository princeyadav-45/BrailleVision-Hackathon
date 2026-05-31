"""
app/api/routes/scan.py  — FIXED FOR SENTENCE DETECTION
========================================================
Your YOLO outputs A-Z class names directly.
This scan route assembles them into a full sentence,
then passes through OpenAI for correction + translation.
"""

import logging
import time
import base64
import numpy as np
import cv2
from fastapi import APIRouter, HTTPException
from app.models import schemas
from app.services.yolo_service import YOLOService, DOT_TO_CHAR
from app.services.openai_service import OpenAIService

router     = APIRouter()
logger     = logging.getLogger(__name__)
yolo       = YOLOService()
openai_svc = OpenAIService()

@router.post("/scan", response_model=schemas.ScanResponse)
async def scan_braille(request: schemas.ScanRequest):
    start_time = time.time()
    try:
        # ── Decode image ──────────────────────────────────────────────────
        try:
            img_data = base64.b64decode(request.image_b64)
            nparr    = np.frombuffer(img_data, np.uint8)
            img      = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

        if img is None:
            raise HTTPException(status_code=400, detail="Could not decode image")

        # ── Run YOLO ─────────────────────────────────────────────────────
        cells = yolo.detect_cells(img)

        # ── Assemble raw sentence from detected cells ─────────────────────
        # Each cell's raw_bits maps to a letter via DOT_TO_CHAR
        raw_chars = []
        for cell in cells:
            char = DOT_TO_CHAR.get(cell.raw_bits, '')
            raw_chars.append(char)

        raw_text = "".join(raw_chars).strip()

        if not raw_text or raw_text == "":
            raw_text      = "no braille detected"
            corrected_text = "No Braille Detected"
            translated_text = "No Braille Detected"
        else:
            logger.info("📝 Raw sentence: '%s'", raw_text)

            # ── OpenAI error correction ───────────────────────────────────
            corrected_text = await openai_svc.correct_braille_text(raw_text)
            logger.info("✅ Corrected: '%s'", corrected_text)

            # ── OpenAI translation ────────────────────────────────────────
            translated_text = await openai_svc.translate_text(
                corrected_text, request.target_language
            )
            if translated_text is None:
                translated_text = corrected_text

        # ── Confidence average ────────────────────────────────────────────
        conf_list = [float(c.confidence) for c in cells if c.raw_bits != '000000']
        avg_conf  = sum(conf_list) / len(conf_list) if conf_list else 0.0

        processing_time = round((time.time() - start_time) * 1000, 2)

        logger.info(
            "🎯 DONE | raw='%s' corrected='%s' cells=%d time=%.0fms",
            raw_text, corrected_text, len(cells), processing_time
        )

        # Build raw Braille Unicode string for display
        braille_unicode = "".join(
            c.braille_char for c in cells if c.raw_bits != '000000'
        )

        return schemas.ScanResponse(
            scan_id=f"scan-{int(time.time())}",
            raw_braille_text=braille_unicode if braille_unicode else raw_text,
            corrected_text=corrected_text,
            translated_text=translated_text,
            detected_cells=cells,
            cell_count=len([c for c in cells if c.raw_bits != '000000']),
            confidence_avg=round(float(avg_conf), 4),
            processing_time_ms=float(processing_time),
            warnings=[] if raw_text != "no braille detected"
                     else ["No Braille cells detected — check lighting and paper position"]
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error("❌ Scan failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))