from fastapi import APIRouter, HTTPException
from app.models.schemas import TranslateRequest, TranslateResponse
from app.services.openai_service import OpenAIService

router = APIRouter()
openai_service = OpenAIService()

@router.post("", response_model=TranslateResponse)
async def translate_text(request: TranslateRequest):
    try:
        return TranslateResponse(
            original_text=request.text,
            braille_unicode="⠠⠓⠠⠑⠠⠇⠠⠇⠠⠕",
            decoded_text="Hello",
            processing_time_ms=50.0
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))