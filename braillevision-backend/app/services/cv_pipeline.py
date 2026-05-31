"""
app/services/cv_pipeline.py
============================
Core Computer-Vision pipeline for physical Braille detection.

WHY SHADOW-BASED DETECTION?
────────────────────────────
Physical Braille dots are embossed in paper — they are the EXACT same colour
as the surrounding sheet.  Standard OCR fails completely here.  Instead we
exploit the tiny shadows that dots cast under raking or diffuse light.

This pipeline uses:
  1. CLAHE   – local contrast enhancement to amplify shadow contrast
  2. Gaussian blur   – suppress sensor noise without destroying shadow edges
  3. Perspective transform   – flatten warped / hand-held paper
  4. Adaptive thresholding   – binarise shadow vs. non-shadow regions
  5. Morphological ops   – clean isolated noise and close broken dot circles
  6. (Optional) Depth-map fusion – use LiDAR/ToF elevation to bypass lighting

Vibe-Coding Disclosure:
  Pipeline architecture co-designed with Claude (Anthropic); OpenCV
  parameter values empirically tuned by human developer on test dataset.
"""

import base64
import logging
from dataclasses import dataclass
from typing import Optional, Tuple

import cv2
import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------

@dataclass
class ProcessedFrame:
    """
    Carries every intermediate image produced during pipeline execution.
    Keeping all stages available enables rich debugging and the future
    ability to stream intermediate frames to the admin/debug UI.
    """
    original:       np.ndarray   # Decoded colour image (BGR)
    gray:           np.ndarray   # Single-channel grayscale
    clahe_enhanced: np.ndarray   # After local contrast enhancement
    denoised:       np.ndarray   # After Gaussian blur
    warped:         np.ndarray   # After perspective correction
    binary:         np.ndarray   # After adaptive thresholding (0/255 mask)
    cleaned:        np.ndarray   # After morphological open/close
    depth_fused:    Optional[np.ndarray] = None  # Depth-map overlay (if supplied)


# ---------------------------------------------------------------------------
# Public service class
# ---------------------------------------------------------------------------

class CVPipeline:
    """
    Stateless OpenCV processing service.

    Usage:
        pipeline = CVPipeline()
        frame    = pipeline.process(image_b64, depth_map_b64)
        # frame.binary is ready for YOLO cell detection
    """

    def __init__(self) -> None:
        # CLAHE object is cheap to keep alive; avoids re-creation per request
        self._clahe = cv2.createCLAHE(
            clipLimit=settings.CV_CLAHE_CLIP_LIMIT,
            tileGridSize=(settings.CV_CLAHE_TILE_GRID, settings.CV_CLAHE_TILE_GRID),
        )
        logger.info("CVPipeline initialised (CLAHE clip=%.1f, tile=%d)",
                    settings.CV_CLAHE_CLIP_LIMIT, settings.CV_CLAHE_TILE_GRID)

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def process(
        self,
        image_b64: str,
        depth_map_b64: Optional[str] = None,
    ) -> ProcessedFrame:
        """
        Run the full shadow-detection pipeline on a base-64 encoded image.

        Args:
            image_b64:     Base-64 JPEG/PNG string from the React Native camera.
            depth_map_b64: Optional base-64 depth map from LiDAR/ToF sensor.

        Returns:
            ProcessedFrame with all intermediate stages populated.

        Raises:
            ValueError: If the image cannot be decoded.
        """
        logger.debug("CVPipeline.process() — decoding image …")

        # Step 1 – Decode base-64 → numpy array
        original = self._decode_b64_image(image_b64)
        h, w = original.shape[:2]
        logger.debug("Image decoded: %dx%d px", w, h)

        # Step 2 – Grayscale conversion
        gray = self._to_grayscale(original)

        # Step 3 – CLAHE local contrast enhancement
        #   Amplifies subtle shadow contrast caused by Braille bump elevation.
        #   Critical step — without this, dots vanish in flat/diffuse lighting.
        clahe_enhanced = self._apply_clahe(gray)

        # Step 4 – Denoise (preserve shadow edges; kill sensor speckle)
        denoised = self._denoise(clahe_enhanced)

        # Step 5 – Perspective correction
        #   Flattens trapezoidal distortion when paper is held at an angle.
        warped = self._correct_perspective(denoised)

        # Step 6 – Adaptive thresholding
        #   Shadow pixels → 255 (white); paper pixels → 0 (black).
        #   Adaptive (not global) threshold handles uneven illumination.
        binary = self._adaptive_threshold(warped)

        # Step 7 – Morphological cleanup
        #   Removes isolated noise pixels and reinforces dot blob circularity.
        cleaned = self._morphological_cleanup(binary)

        # Step 8 – Optional depth-map fusion (LiDAR / ToF)
        depth_fused = None
        if depth_map_b64 and settings.DEPTH_ENABLED:
            depth_fused = self._fuse_depth_map(cleaned, depth_map_b64)
            logger.debug("Depth map fused into binary mask")

        return ProcessedFrame(
            original=original,
            gray=gray,
            clahe_enhanced=clahe_enhanced,
            denoised=denoised,
            warped=warped,
            binary=binary,
            cleaned=cleaned,
            depth_fused=depth_fused,
        )

    # ------------------------------------------------------------------
    # Pipeline stages (each is a pure function on numpy arrays)
    # ------------------------------------------------------------------

    @staticmethod
    def _decode_b64_image(image_b64: str) -> np.ndarray:
        """Decode a base-64 string to a BGR numpy array."""
        try:
            # Strip data-URI prefix if present (e.g. "data:image/jpeg;base64,")
            if "," in image_b64:
                image_b64 = image_b64.split(",", 1)[1]

            raw_bytes = base64.b64decode(image_b64)
            buf = np.frombuffer(raw_bytes, dtype=np.uint8)
            img = cv2.imdecode(buf, cv2.IMREAD_COLOR)

            if img is None:
                raise ValueError("cv2.imdecode returned None — invalid image data")

            return img
        except Exception as exc:
            logger.error("Image decode failure: %s", exc)
            raise ValueError(f"Could not decode image: {exc}") from exc

    @staticmethod
    def _to_grayscale(bgr: np.ndarray) -> np.ndarray:
        """Convert BGR image to single-channel grayscale."""
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)

    def _apply_clahe(self, gray: np.ndarray) -> np.ndarray:
        """
        Contrast Limited Adaptive Histogram Equalisation.

        Divides the image into small tiles and equalises each independently.
        This is essential for Braille because lighting is typically uneven
        across a physical page (bright centre, dark edges from hand-shadow).
        """
        return self._clahe.apply(gray)

    @staticmethod
    def _denoise(gray: np.ndarray) -> np.ndarray:
        """
        Gaussian blur to suppress high-frequency sensor noise.

        Kernel size (5,5) preserves the low-frequency shadow gradients
        while removing the salt-and-pepper noise common in mobile sensors.
        """
        return cv2.GaussianBlur(gray, (5, 5), sigmaX=0)

    @staticmethod
    def _correct_perspective(gray: np.ndarray) -> np.ndarray:
        """
        Detect the largest quadrilateral (the paper) and warp it to a
        top-down rectangular view.

        Algorithm:
          1. Edge detection (Canny)
          2. Contour finding → keep the largest 4-corner polygon
          3. warpPerspective to standard output size

        If no clear quadrilateral is detected (e.g. paper fills entire frame),
        the original image is returned unchanged with a logged warning.
        """
        # Canny edge map
        edges = cv2.Canny(gray, threshold1=50, threshold2=150)

        # Find external contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            logger.warning("Perspective correction: no contours found — skipping warp")
            return gray

        # Sort by area descending; the paper should be the largest contour
        contours = sorted(contours, key=cv2.contourArea, reverse=True)

        for cnt in contours[:5]:
            peri = cv2.arcLength(cnt, closed=True)
            approx = cv2.approxPolyDP(cnt, epsilon=0.02 * peri, closed=True)

            if len(approx) == 4:
                # Found a quadrilateral — apply perspective warp
                return CVPipeline._four_point_transform(gray, approx.reshape(4, 2))

        logger.warning("Perspective correction: no quadrilateral found — using original")
        return gray

    @staticmethod
    def _four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
        """
        Given four corner points (in any order), warp the image region they
        define into a canonical top-down rectangle.

        Point ordering: top-left, top-right, bottom-right, bottom-left.
        """
        # Order points: TL, TR, BR, BL
        rect = np.zeros((4, 2), dtype=np.float32)
        s = pts.sum(axis=1)
        rect[0] = pts[np.argmin(s)]   # Top-left  → smallest sum
        rect[2] = pts[np.argmax(s)]   # Bot-right → largest sum
        diff = np.diff(pts, axis=1)
        rect[1] = pts[np.argmin(diff)]  # Top-right → smallest diff
        rect[3] = pts[np.argmax(diff)]  # Bot-left  → largest diff

        (tl, tr, br, bl) = rect
        width_a  = np.linalg.norm(br - bl)
        width_b  = np.linalg.norm(tr - tl)
        max_w    = int(max(width_a, width_b))
        height_a = np.linalg.norm(tr - br)
        height_b = np.linalg.norm(tl - bl)
        max_h    = int(max(height_a, height_b))

        dst = np.array([
            [0, 0], [max_w - 1, 0],
            [max_w - 1, max_h - 1], [0, max_h - 1],
        ], dtype=np.float32)

        M = cv2.getPerspectiveTransform(rect, dst)
        return cv2.warpPerspective(image, M, (max_w, max_h))

    @staticmethod
    def _adaptive_threshold(gray: np.ndarray) -> np.ndarray:
        """
        Binarise the image using locally adaptive Gaussian thresholding.

        WHY ADAPTIVE (not global)?
          A single global threshold fails when one half of the page is in
          shadow from the user's hand.  Adaptive thresholding computes an
          independent threshold for each small region, making it robust to
          uneven illumination — the primary real-world failure mode.

        THRESHOLD_MEAN_C subtracted from weighted mean:
          Positive C → threshold is LOWER than mean → catches fainter shadows.
          We use CV_ADAPTIVE_C = 4 as default; decrease for low-contrast scans.
        """
        return cv2.adaptiveThreshold(
            gray,
            maxValue=255,
            adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            thresholdType=cv2.THRESH_BINARY_INV,   # Shadows → white
            blockSize=settings.CV_ADAPTIVE_BLOCK_SIZE,
            C=settings.CV_ADAPTIVE_C,
        )

    @staticmethod
    def _morphological_cleanup(binary: np.ndarray) -> np.ndarray:
        """
        Remove noise and reinforce Braille dot blobs via morphological ops.

        Strategy:
          • Opening (erode→dilate):  kills isolated 1-2 pixel noise specks
          • Closing (dilate→erode):  fills small gaps inside dot blobs
            caused by specular highlights on the dome of each bump

        The elliptical kernel approximates the circular cross-section of a
        Braille dot, making the operation naturally shape-aware.

        INTERPOINT NOTE:
          Double-sided Braille creates "craters" on the reverse side.
          These register as dark rings rather than bright blobs in the binary
          mask.  The closing step partially suppresses these artefacts; full
          suppression requires the INTERPOINT scan mode (depth-map fusion).
        """
        # Elliptical kernel sized ~1 Braille dot diameter
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

        opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN,  kernel, iterations=1)
        closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel, iterations=1)

        return closed

    @staticmethod
    def _fuse_depth_map(binary: np.ndarray, depth_map_b64: str) -> np.ndarray:
        """
        [STUB — Phase 5 / LiDAR hardware]

        Fuse a ToF/LiDAR depth map with the binary shadow mask.

        Physical principle:
          A Braille dot has a ~0.48 mm elevation above the paper surface.
          The depth map assigns higher values to closer (elevated) regions.
          By multiplying the normalised depth map with the binary mask, we
          suppress flat-surface false positives and amplify true dot regions,
          completely bypassing the need for shadow detection.

        This stub returns the unmodified binary mask until LiDAR data
        becomes available on the target hardware (iPhone 12 Pro+, iPad Pro).
        """
        logger.info("[STUB] depth_fuse called — returning unmodified binary mask")
        return binary

    # ------------------------------------------------------------------
    # Utility: encode processed image back to base-64 (for debug endpoint)
    # ------------------------------------------------------------------

    @staticmethod
    def encode_to_b64(image: np.ndarray) -> str:
        """Encode a numpy array back to a base-64 JPEG string."""
        success, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not success:
            raise RuntimeError("Failed to encode image to JPEG")
        return base64.b64encode(buffer).decode("utf-8")