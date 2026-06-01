"""
main.py
=======
🎯 FASTAPI CORE APPLICATION ROUTER — TRANSIT RESILIENT MULTI-ROUTE CONFIG
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 🛡️ GLOBAL ROUTING LOCK: redirect_slashes=True yahan lagane se scan, translate sab fixed!
app = FastAPI(
    title="BrailleVision Backend",
    description="Real-Time Computer Vision & ML Braille Translator API",
    version="1.0.0",
    redirect_slashes=True
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.routes import scan, translate, health

# Strict Explicit Prefix Routing
app.include_router(health.router, prefix="/api/v1", tags=["System Health"])
app.include_router(scan.router, prefix="/api/v1", tags=["Real-Time Scan Engine"])
app.include_router(translate.router, prefix="/api/v1", tags=["Translation Matrix"])

@app.get("/")
async def root_redirect():
    return {
        "status": "online",
        "engine": "YOLOv8 + OpenCV Hybrid Layer",
        "endpoints": "/api/v1/scan"
    }

if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 Starting production-grade engine thread on port 8000...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)