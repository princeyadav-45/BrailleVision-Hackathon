"""
app/services/yolo_service.py
=============================
UPDATED: Full A-Z + Numbers (0-9) support
==========================================
How numbers work in Braille:
  - A special "number indicator" cell (dots 3,4,5,6) appears before digits
  - After the indicator, letters A-J map to numbers 1-9,0
  - A space ends number mode

Your model detects A-Z directly as class names.
Numbers are handled by the number indicator logic in code.
No retraining needed!
"""

import logging
from typing import List
import numpy as np
import cv2
from app.models.schemas import BrailleCell

logger = logging.getLogger(__name__)

BRAILLE_UNICODE_OFFSET = 0x2800

# Your model's 26 classes → letters
CLASS_TO_CHAR = {
    0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e', 5: 'f',
    6: 'g', 7: 'h', 8: 'i', 9: 'j', 10: 'k', 11: 'l',
    12: 'm', 13: 'n', 14: 'o', 15: 'p', 16: 'q', 17: 'r',
    18: 's', 19: 't', 20: 'u', 21: 'v', 22: 'w', 23: 'x',
    24: 'y', 25: 'z'
}

# Letter → Braille dot pattern bits
CHAR_TO_BRAILLE_BITS = {
    'a':'100000','b':'110000','c':'100100','d':'100110','e':'100010',
    'f':'110100','g':'110110','h':'110010','i':'010100','j':'010110',
    'k':'101000','l':'111000','m':'101100','n':'101110','o':'101010',
    'p':'111100','q':'111110','r':'111010','s':'011100','t':'011110',
    'u':'101001','v':'111001','w':'010111','x':'101101','y':'101111',
    'z':'101011',' ':'000000',
    # Number indicator special cell (dots 3,4,5,6)
    '#':'001111',
}

# Bits → char lookup
DOT_TO_CHAR: dict[str, str] = {v: k for k, v in CHAR_TO_BRAILLE_BITS.items()}

# Number indicator bit pattern
NUMBER_INDICATOR_BITS = '001111'

# When in number mode: letter A-J → digit 1-9,0
LETTER_TO_NUMBER = {
    'a': '1', 'b': '2', 'c': '3', 'd': '4', 'e': '5',
    'f': '6', 'g': '7', 'h': '8', 'i': '9', 'j': '0',
}

def _char_to_braille_unicode(char: str) -> str:
    bits    = CHAR_TO_BRAILLE_BITS.get(char.lower(), '000000')
    dot_map = [1, 2, 4, 8, 16, 32]
    offset  = sum(int(b) * v for b, v in zip(bits, dot_map))
    return chr(BRAILLE_UNICODE_OFFSET + offset)

def _bits_to_braille_unicode(bits: str) -> str:
    dot_map = [1, 2, 4, 8, 16, 32]
    offset  = sum(int(b) * v for b, v in zip(bits, dot_map))
    return chr(BRAILLE_UNICODE_OFFSET + offset)


class YOLOService:
    def __init__(self) -> None:
        self._model = None

    def detect_cells(self, image: np.ndarray) -> List[BrailleCell]:
        if self._model is None:
            from ultralytics import YOLO
            self._model = YOLO(r"C:\Users\prince\Desktop\BrailleVision_Hackathon\braillevision-backend\best.pt")
            logger.info("✅ YOLO loaded. Classes: %s", self._model.names)
        return self._pipeline(image)

    def _pipeline(self, image: np.ndarray) -> List[BrailleCell]:

        # ── Ensure BGR 3-channel ───────────────────────────────────────────
        if image.ndim == 2:
            bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        elif image.shape[2] == 4:
            bgr = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        else:
            bgr = image.copy()

        h, w = bgr.shape[:2]
        logger.info("[YOLO] Image: %dx%d", w, h)

        # ── Also build binary mask for number indicator detection ──────────
        gray    = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        clahe   = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        blurred  = cv2.GaussianBlur(enhanced, (5, 5), 0)
        _, binary_mask = cv2.threshold(
            blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        binary_mask = cv2.morphologyEx(binary_mask, cv2.MORPH_CLOSE, kernel)

        cells: List[BrailleCell] = []

        # ── Run YOLO ──────────────────────────────────────────────────────
        try:
            results = self._model.predict(
                source=bgr,
                conf=0.25,
                iou=0.35,
                verbose=False,
            )

            for result in results:
                boxes = result.boxes
                if boxes is None or len(boxes) == 0:
                    logger.warning("[YOLO] No detections at conf=0.25")
                    continue

                logger.info("[YOLO] Detected %d boxes", len(boxes))

                for i, box in enumerate(boxes):
                    xc, yc, bw, bh = box.xywhn[0].tolist()
                    x     = int((xc - bw / 2) * w)
                    y     = int((yc - bh / 2) * h)
                    bw_px = int(bw * w)
                    bh_px = int(bh * h)
                    conf  = float(box.conf[0])

                    # Get letter directly from YOLO class
                    class_id = int(box.cls[0])
                    char     = CLASS_TO_CHAR.get(class_id, '?').lower()
                    bits     = CHAR_TO_BRAILLE_BITS.get(char, '000000')

                    # Check if this cell could be a number indicator
                    # by reading actual dot pattern from binary mask
                    actual_bits = self._extract_dot_pattern(
                        binary_mask, x, y, bw_px, bh_px
                    )
                    if actual_bits == NUMBER_INDICATOR_BITS:
                        # Override: this is a number indicator, not a letter
                        bits = NUMBER_INDICATOR_BITS
                        char = '#'

                    logger.info(
                        "[YOLO] Cell %d: char=%s conf=%.2f",
                        i, char, conf
                    )

                    cells.append(BrailleCell(
                        cell_id=i,
                        x=x, y=y,
                        width=bw_px, height=bh_px,
                        confidence=round(conf, 4),
                        raw_bits=bits,
                        braille_char=_char_to_braille_unicode(char),
                    ))

        except Exception as e:
            logger.error("[YOLO] Prediction failed: %s", e)

        # ── Sort reading order ─────────────────────────────────────────────
        cells = self._sort_reading_order(cells)

        # ── Insert spaces between words ────────────────────────────────────
        cells = self._insert_spaces(cells, w)

        # ── Log final output ───────────────────────────────────────────────
        sentence = self._cells_to_sentence(cells)
        logger.info("[YOLO] ✅ Final output: '%s'", sentence)

        return cells

    # ─────────────────────────────────────────────────────────────────────────
    # Sentence assembly WITH number mode
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _cells_to_sentence(cells: List[BrailleCell]) -> str:
        """
        Convert cells → readable text.
        Handles number mode: after # indicator, A-J → 1-9,0
        """
        result      = ""
        number_mode = False

        for cell in cells:
            bits = cell.raw_bits
            char = DOT_TO_CHAR.get(bits, '?')

            # Space → always end number mode
            if bits == '000000':
                result      += ' '
                number_mode  = False
                continue

            # Number indicator detected
            if bits == NUMBER_INDICATOR_BITS:
                number_mode = True
                continue  # Don't add indicator to output

            # In number mode → map letter to digit
            if number_mode:
                digit = LETTER_TO_NUMBER.get(char)
                if digit:
                    result += digit
                else:
                    # Non A-J letter ends number mode
                    number_mode = False
                    result += char
            else:
                result += char

        return result

    # ─────────────────────────────────────────────────────────────────────────
    # Dot pattern extraction (used for number indicator detection)
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _extract_dot_pattern(
        binary: np.ndarray,
        x: int, y: int,
        w: int, h: int,
    ) -> str:
        h_max, w_max = binary.shape[:2]
        x1 = max(0, x);       y1 = max(0, y)
        x2 = min(w_max, x+w); y2 = min(h_max, y+h)
        roi = binary[y1:y2, x1:x2]
        if roi.size == 0:
            return '000000'

        rh = roi.shape[0] // 3
        cw = roi.shape[1] // 2
        if rh == 0 or cw == 0:
            return '000000'

        regions = [
            roi[0:rh,      0:cw],
            roi[rh:2*rh,   0:cw],
            roi[2*rh:3*rh, 0:cw],
            roi[0:rh,      cw:2*cw],
            roi[rh:2*rh,   cw:2*cw],
            roi[2*rh:3*rh, cw:2*cw],
        ]

        THRESHOLD = 0.15
        bits = ""
        for region in regions:
            if region.size == 0:
                bits += "0"
            else:
                density = np.count_nonzero(region) / region.size
                bits += "1" if density > THRESHOLD else "0"
        return bits

    # ─────────────────────────────────────────────────────────────────────────
    # Space insertion between words
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _insert_spaces(cells: List[BrailleCell], frame_width: int) -> List[BrailleCell]:
        if len(cells) < 2:
            return cells

        avg_width       = sum(c.width for c in cells) / len(cells)
        space_threshold = avg_width * 1.5
        result          = [cells[0]]
        cell_id         = 1

        for prev, curr in zip(cells, cells[1:]):
            gap = curr.x - (prev.x + prev.width)
            if gap > space_threshold:
                result.append(BrailleCell(
                    cell_id=cell_id,
                    x=prev.x + prev.width, y=prev.y,
                    width=int(gap), height=prev.height,
                    confidence=1.0,
                    raw_bits='000000',
                    braille_char='⠀',
                ))
                cell_id += 1
            curr.cell_id = cell_id
            result.append(curr)
            cell_id += 1

        return result

    # ─────────────────────────────────────────────────────────────────────────
    # Reading order sort
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _sort_reading_order(cells: List[BrailleCell]) -> List[BrailleCell]:
        if not cells:
            return cells

        ROW_TOLERANCE = 15
        cells_sorted  = sorted(cells, key=lambda c: c.y)
        rows: List[List[BrailleCell]] = []
        current_row   = [cells_sorted[0]]

        for cell in cells_sorted[1:]:
            if abs(cell.y - current_row[0].y) <= ROW_TOLERANCE:
                current_row.append(cell)
            else:
                rows.append(sorted(current_row, key=lambda c: c.x))
                current_row = [cell]
        rows.append(sorted(current_row, key=lambda c: c.x))

        flat: List[BrailleCell] = []
        for i, cell in enumerate([c for row in rows for c in row]):
            cell.cell_id = i
            flat.append(cell)
        return flat