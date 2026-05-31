"""
app/models/schemas.py
======================
🎯 PYDANTIC V2 APP SCHEMAS WITH ABSOLUTE REGISTRY SHIELD
"""
from __future__ import annotations
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict

class ScanMode(str, Enum):
    STANDARD   = "standard"
    DEPTH      = "depth"
    INTERPOINT = "interpoint"

class Language(str, Enum):
    ENGLISH    = "en"
    HINDI      = "hi"
    FRENCH     = "fr"
    GERMAN     = "de"
    SPANISH    = "es"
    PORTUGUESE = "pt"
    ARABIC     = "ar"
    CHINESE    = "zh"
    JAPANESE   = "ja"
    KOREAN     = "ko"
    RUSSIAN    = "ru"
    ITALIAN    = "it"
    DUTCH      = "nl"
    TURKISH    = "tr"
    POLISH     = "pl"
    SWEDISH    = "sv"

class ScanRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, protected_namespaces=())
    image_b64:       str          = Field(..., description="Base-64 encoded image")
    target_language: Language     = Field(Language.ENGLISH)
    scan_mode:       ScanMode     = Field(ScanMode.STANDARD)
    depth_map_b64:   Optional[str] = Field(None)

    @field_validator("image_b64")
    @classmethod
    def image_must_not_be_empty(cls, v: str) -> str:
        if not v or len(v) < 100:
            raise ValueError("image_b64 must be a non-empty base-64 string")
        return v

class BrailleCell(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, protected_namespaces=(), populate_by_name=True, from_attributes=True)
    cell_id:      int   = Field(...)
    x:            int   = Field(...)
    y:            int   = Field(...)
    width:        int   = Field(...)
    height:       int   = Field(...)
    confidence:   float = Field(..., ge=0.0, le=1.0)
    raw_bits:     str   = Field(...)
    braille_char: str   = Field(...)

class ScanResponse(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, protected_namespaces=())
    scan_id:            str
    raw_braille_text:   str
    corrected_text:     str
    translated_text:    Optional[str]       = None
    detected_cells:     List[BrailleCell]   = Field(default_factory=list)
    cell_count:         int
    confidence_avg:     float
    processing_time_ms: float
    warnings:           List[str]           = Field(default_factory=list)

class TranslateRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, protected_namespaces=())
    text:            str      = Field(..., min_length=1, max_length=5000)
    source_language: Language = Field(Language.ENGLISH)
    target_language: Language = Field(Language.ENGLISH)
    direction:       str      = Field("text_to_braille", pattern="^(text_to_braille|braille_to_text)$")

class TranslateResponse(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, protected_namespaces=())
    original_text:      str
    braille_unicode:    Optional[str] = None
    decoded_text:       Optional[str] = None
    processing_time_ms: float

class HealthResponse(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, protected_namespaces=())
    status:       str
    yolo_loaded:  bool
    openai_ready: bool
    version:      str