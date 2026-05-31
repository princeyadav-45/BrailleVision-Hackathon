import os
from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "BrailleVision API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"

    ALLOWED_ORIGINS: List[str] = ["*"]

    # Ye rahi teri asli OpenAI Key! 👇
   OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    YOLO_MODEL_PATH: str = os.getenv("YOLO_MODEL_PATH", "best.pt")
    
    CV_CLAHE_CLIP_LIMIT: float = 2.0
    CV_CLAHE_TILE_GRID: int = 8
    CV_ADAPTIVE_BLOCK_SIZE: int = 15
    CV_ADAPTIVE_C: int = 10 
    CV_BLUR_KERNEL_SIZE: int = 5

    class Config:
        case_sensitive = True

settings = Settings()