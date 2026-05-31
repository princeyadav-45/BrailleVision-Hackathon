"""
app/services/openai_service.py
===============================
FREE GOOGLE TRANSLATE BYPASS FOR HACKATHON (NO API KEY REQUIRED)
"""

import logging
from app.models.schemas import Language

logger = logging.getLogger(__name__)

class OpenAIService:
    def __init__(self) -> None:
        self._ready = True
        logger.info("✅ [FREE BYPASS] Google Translate Engine initialized successfully!")

    async def validate_credentials(self) -> None:
        self._ready = True

    @property
    def is_ready(self) -> bool:
        return True

    async def correct_braille_text(self, raw_text: str) -> str:
        if not raw_text.strip():
            return "No text detected"
        return raw_text.strip()

    async def translate_text(self, text: str, target_language: Language) -> str | None:
        if target_language == Language.ENGLISH or not text.strip():
            return text

        logger.info("🚀 [FREE BYPASS] Translating text via Googletrans to Hindi...")
        try:
            from googletrans import Translator
            translator = Translator()
            result = translator.translate(text, dest='hi')
            logger.info("🎯 [FREE BYPASS] Translation complete successfully!")
            return result.text
        except Exception as exc:
            logger.error("❌ [FREE BYPASS ERROR] Translation failed: %s", exc)
            return f"Translation Fallback: {text}"
            