"""
app/api/routes/health.py
=========================
🎯 SYSTEM HEALTH ENDPOINT — TRANSIT RESILIENT
"""

import logging
from fastapi import APIRouter
from app.models import schemas

# redirect_slashes=True lagane se trailing slash wala jhanjhat khatam ho jata hai
router = APIRouter(redirect_slashes=True)
logger = logging.getLogger(__name__)

@router.get("/health", response_model=schemas.HealthResponse)
async def health_check():
    logger.info("📡 System Health status requested.")
    return schemas.HealthResponse(
        status="healthy",
        yolo_loaded=True,
        openai_ready=True,
        version="1.0.0"
    )