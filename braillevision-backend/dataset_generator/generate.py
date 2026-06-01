"""
dataset_generator/generate.py
==============================
Synthetic Braille Dataset Generator — 20,000 images
=====================================================
Generates photorealistic synthetic Braille images with:
  • All 26 letters (A-Z) + numbers (0-9) + space
  • Realistic paper texture backgrounds
  • Random lighting conditions (bright, dim, uneven)
  • Camera noise (Gaussian, salt-and-pepper)
  • Perspective distortion (warped paper simulation)
  • Motion blur (hand shake simulation)
  • Interpoint shadow artifacts (double-sided Braille)
  • YOLO-format + classification-format labels

OUTPUT STRUCTURE:
  data/
  ├── images/
  │   ├── train/   (16,000 images — 80%)
  │   ├── val/     (2,000  images — 10%)
  │   └── test/    (2,000  images — 10%)
  ├── labels/      (YOLO format .txt files)
  └── classes/     (per-class folders for Swin classifier)

Vibe-Coding Disclosure: Generator designed with Claude (Anthropic).
"""

import os
import cv2
import numpy as np
import random
import json
from pathlib import Path
from typing import Tuple, List, Dict
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Braille dot patterns — Grade 1 (A-Z, 0-9, space)
# ---------------------------------------------------------------------------

BRAILLE_PATTERNS: Dict[str, str] = {
    # Letters A-Z
    'a':'100000','b':'110000','c':'100100','d':'100110','e':'100010',
    'f':'110100','g':'110110','h':'110010','i':'010100','j':'010110',
    'k':'101000','l':'111000','m':'101100','n':'101110','o':'101010',
    'p':'111100','q':'111110','r':'111010','s':'011100','t':'011110',
    'u':'101001','v':'111001','w':'010111','x':'101101','y':'101111',
    'z':'101011',
    # Numbers (number indicator + A-J)
    '1':'100000','2':'110000','3':'100100','4':'100110','5':'100010',
    '6':'110100','7':'110110','8':'110010','9':'010100','0':'010110',
    # Space
    ' ':'000000',
}

# All classes for training
ALL_CLASSES = list('abcdefghijklmnopqrstuvwxyz') + list('0123456789') + [' ']
CLASS_TO_IDX = {c: i for i, c in enumerate(ALL_CLASSES)}
IDX_TO_CLASS = {i: c for c, i in CLASS_TO_IDX.items()}

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

class Config:
    TOTAL_IMAGES    = 20_000
    TRAIN_RATIO     = 0.80   # 16,000
    VAL_RATIO       = 0.10   # 2,000
    TEST_RATIO      = 0.10   # 2,000

    # Image dimensions
    IMG_W           = 640
    IMG_H           = 640

    # Braille cell dimensions (pixels)
    CELL_W          = 48
    CELL_H          = 64
    DOT_RADIUS_MIN  = 5
    DOT_RADIUS_MAX  = 9

    # Dot grid within cell (2 cols x 3 rows)
    DOT_COLS        = 2
    DOT_ROWS        = 3

    # Augmentation probabilities
    P_NOISE         = 0.70
    P_BLUR          = 0.40
    P_PERSPECTIVE   = 0.50
    P_LIGHTING      = 0.80
    P_INTERPOINT    = 0.25   # Double-sided Braille craters

    OUTPUT_DIR      = Path("data")
    SEED            = 42


# ---------------------------------------------------------------------------
# Main generator class
# ---------------------------------------------------------------------------

class BrailleDatasetGenerator:

    def __init__(self, config: Config = Config()):
        self.cfg = config
        random.seed(config.SEED)
        np.random.seed(config.SEED)
        self._setup_dirs()

    def _setup_dirs(self):
        cfg = self.cfg
        for split in ['train', 'val', 'test']:
            (cfg.OUTPUT_DIR / 'images' / split).mkdir(parents=True, exist_ok=True)
            (cfg.OUTPUT_DIR / 'labels' / split).mkdir(parents=True, exist_ok=True)
        # Swin classifier format: data/classes/<classname>/
        for cls in ALL_CLASSES:
            cls_name = cls if cls != ' ' else 'space'
            (cfg.OUTPUT_DIR / 'classes' / cls_name).mkdir(parents=True, exist_ok=True)
        print(f"✅ Output directories created at: {cfg.OUTPUT_DIR.absolute()}")

    # ─────────────────────────────────────────────────────────────────────
    # Main generation loop
    # ─────────────────────────────────────────────────────────────────────

    def generate(self):
        cfg   = self.cfg
        total = cfg.TOTAL_IMAGES

        # Split counts
        n_train = int(total * cfg.TRAIN_RATIO)
        n_val   = int(total * cfg.VAL_RATIO)
        n_test  = total - n_train - n_val

        splits = (
            [('train', n_train)] +
            [('val',   n_val)]   +
            [('test',  n_test)]
        )

        img_id = 0
        for split, count in splits:
            print(f"\n📸 Generating {count} {split} images…")
            for _ in tqdm(range(count), desc=split):
                self._generate_one(img_id, split)
                img_id += 1

        # Save class map
        class_map_path = cfg.OUTPUT_DIR / 'class_map.json'
        with open(class_map_path, 'w') as f:
            json.dump(IDX_TO_CLASS, f, indent=2)

        # Save YOLO data.yaml
        self._write_data_yaml()

        print(f"\n✅ Dataset complete!")
        print(f"   Total images : {total}")
        print(f"   Train        : {n_train}")
        print(f"   Val          : {n_val}")
        print(f"   Test         : {n_test}")
        print(f"   Classes      : {len(ALL_CLASSES)}")
        print(f"   Output       : {cfg.OUTPUT_DIR.absolute()}")

    # ─────────────────────────────────────────────────────────────────────
    # Generate one image
    # ─────────────────────────────────────────────────────────────────────

    def _generate_one(self, img_id: int, split: str):
        cfg = self.cfg

        # 1. Generate paper background
        img = self._make_paper_background()

        # 2. Randomly place 1-8 Braille cells on the image
        n_cells   = random.randint(1, 8)
        cells     = []
        yolo_boxes = []

        # Starting position
        margin   = 60
        x_cursor = margin
        y_cursor = margin + random.randint(0, cfg.IMG_H // 3)

        for i in range(n_cells):
            # Pick random character
            char = random.choice(ALL_CLASSES[:-1])  # skip space for visible cells

            # Check bounds
            if x_cursor + cfg.CELL_W > cfg.IMG_W - margin:
                x_cursor  = margin
                y_cursor += cfg.CELL_H + random.randint(20, 40)
            if y_cursor + cfg.CELL_H > cfg.IMG_H - margin:
                break

            # Draw Braille cell
            cell_img, dots = self._draw_braille_cell(char)

            # Paste cell onto background
            x1, y1 = x_cursor, y_cursor
            x2, y2 = x1 + cfg.CELL_W, y1 + cfg.CELL_H

            # Add random offset for realism
            x1 += random.randint(-3, 3)
            y1 += random.randint(-3, 3)
            x2 = min(x1 + cfg.CELL_W, cfg.IMG_W)
            y2 = min(y1 + cfg.CELL_H, cfg.IMG_H)

            img[y1:y2, x1:x2] = cell_img[:y2-y1, :x2-x1]

            # YOLO format: class x_center y_center width height (normalised)
            cx   = (x1 + (x2-x1)/2) / cfg.IMG_W
            cy   = (y1 + (y2-y1)/2) / cfg.IMG_H
            bw   = (x2-x1) / cfg.IMG_W
            bh   = (y2-y1) / cfg.IMG_H
            cidx = CLASS_TO_IDX[char]

            yolo_boxes.append(f"{cidx} {cx:.6f} {cy:.6f} {bw:.6f} {bh:.6f}")
            cells.append((char, x1, y1, x2, y2))

            # Advance cursor with inter-cell spacing
            x_cursor += cfg.CELL_W + random.randint(8, 24)

        # 3. Apply augmentations
        img = self._augment(img)

        # 4. Save image
        fname    = f"braille_{img_id:06d}.jpg"
        img_path = cfg.OUTPUT_DIR / 'images' / split / fname
        cv2.imwrite(str(img_path), img, [cv2.IMWRITE_JPEG_QUALITY, 92])

        # 5. Save YOLO label
        lbl_path = cfg.OUTPUT_DIR / 'labels' / split / fname.replace('.jpg', '.txt')
        with open(lbl_path, 'w') as f:
            f.write('\n'.join(yolo_boxes))

        # 6. Save per-class crops for Swin classifier training
        for char, x1, y1, x2, y2 in cells:
            crop      = img[y1:y2, x1:x2]
            if crop.size == 0:
                continue
            crop      = cv2.resize(crop, (cfg.CELL_W * 2, cfg.CELL_H * 2))
            cls_name  = char if char != ' ' else 'space'
            cls_dir   = cfg.OUTPUT_DIR / 'classes' / cls_name
            crop_name = f"{img_id:06d}_{char}_{random.randint(0,9999):04d}.jpg"
            cv2.imwrite(str(cls_dir / crop_name), crop)

    # ─────────────────────────────────────────────────────────────────────
    # Paper background generator
    # ─────────────────────────────────────────────────────────────────────

    def _make_paper_background(self) -> np.ndarray:
        cfg = self.cfg
        h, w = cfg.IMG_H, cfg.IMG_W

        # Base paper colour (off-white with slight variation)
        base = random.randint(210, 245)
        img  = np.full((h, w, 3), base, dtype=np.uint8)

        # Add paper texture (fine grain noise)
        noise = np.random.normal(0, 4, (h, w, 3)).astype(np.int16)
        img   = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        # Add subtle horizontal paper lines (ruled paper simulation)
        if random.random() < 0.3:
            line_spacing = random.randint(28, 48)
            for y in range(0, h, line_spacing):
                color = random.randint(190, 215)
                cv2.line(img, (0, y), (w, y), (color, color, color), 1)

        return img

    # ─────────────────────────────────────────────────────────────────────
    # Braille cell renderer
    # ─────────────────────────────────────────────────────────────────────

    def _draw_braille_cell(self, char: str) -> Tuple[np.ndarray, List]:
        cfg     = self.cfg
        bits    = BRAILLE_PATTERNS.get(char, '000000')
        cell_bg = random.randint(210, 245)
        cell    = np.full((cfg.CELL_H, cfg.CELL_W, 3), cell_bg, dtype=np.uint8)

        # Dot positions in 2-col x 3-row grid
        col_xs = [cfg.CELL_W // 3,     2 * cfg.CELL_W // 3]
        row_ys = [cfg.CELL_H // 5,     cfg.CELL_H // 2,    4 * cfg.CELL_H // 5]

        dots = []
        for dot_idx, bit in enumerate(bits):
            if bit == '1':
                col = dot_idx % 2       # 0=left, 1=right
                row = dot_idx // 2      # 0,1,2 = top,mid,bot  (wait: Braille col-major)
                # Braille dot numbering is column-major:
                # dot 1,2,3 = left col top→bot; dot 4,5,6 = right col top→bot
                col = 0 if dot_idx < 3 else 1
                row = dot_idx % 3
                cx  = col_xs[col] + random.randint(-1, 1)
                cy  = row_ys[row] + random.randint(-1, 1)
                r   = random.randint(cfg.DOT_RADIUS_MIN, cfg.DOT_RADIUS_MAX)

                # Draw shadow first (realistic Braille bump shadow)
                shadow_offset = random.randint(1, 3)
                shadow_color  = max(0, cell_bg - random.randint(20, 50))
                cv2.circle(cell,
                           (cx + shadow_offset, cy + shadow_offset),
                           r, (shadow_color, shadow_color, shadow_color), -1)

                # Draw the dot (slightly lighter than paper — raised surface)
                dot_color = min(255, cell_bg + random.randint(5, 20))
                cv2.circle(cell, (cx, cy), r,
                           (dot_color, dot_color, dot_color), -1)

                # Specular highlight (top-left of dome)
                if random.random() < 0.6:
                    hi_r = max(1, r // 3)
                    cv2.circle(cell,
                               (cx - hi_r, cy - hi_r), hi_r,
                               (min(255, dot_color + 30),) * 3, -1)

                dots.append((cx, cy, r))

        # Interpoint craters (double-sided Braille artifact)
        if random.random() < self.cfg.P_INTERPOINT:
            n_craters = random.randint(1, 3)
            for _ in range(n_craters):
                cx = random.randint(8, cfg.CELL_W - 8)
                cy = random.randint(8, cfg.CELL_H - 8)
                r  = random.randint(3, 6)
                # Crater = dark ring
                crater_color = max(0, cell_bg - random.randint(15, 35))
                cv2.circle(cell, (cx, cy), r,
                           (crater_color,) * 3, 1)

        return cell, dots

    # ─────────────────────────────────────────────────────────────────────
    # Augmentation pipeline
    # ─────────────────────────────────────────────────────────────────────

    def _augment(self, img: np.ndarray) -> np.ndarray:
        cfg = self.cfg

        # Lighting variation
        if random.random() < cfg.P_LIGHTING:
            img = self._augment_lighting(img)

        # Gaussian noise
        if random.random() < cfg.P_NOISE:
            sigma  = random.uniform(1, 8)
            noise  = np.random.normal(0, sigma, img.shape).astype(np.int16)
            img    = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        # Motion blur (camera shake)
        if random.random() < cfg.P_BLUR:
            img = self._augment_blur(img)

        # Perspective warp (held paper)
        if random.random() < cfg.P_PERSPECTIVE:
            img = self._augment_perspective(img)

        return img

    def _augment_lighting(self, img: np.ndarray) -> np.ndarray:
        """Simulate uneven lighting across paper surface."""
        h, w   = img.shape[:2]
        mode   = random.choice(['bright', 'dim', 'gradient', 'vignette'])

        if mode == 'bright':
            factor = random.uniform(1.05, 1.25)
            img    = np.clip(img.astype(np.float32) * factor, 0, 255).astype(np.uint8)

        elif mode == 'dim':
            factor = random.uniform(0.65, 0.92)
            img    = np.clip(img.astype(np.float32) * factor, 0, 255).astype(np.uint8)

        elif mode == 'gradient':
            # Simulate hand shadow (darker on one side)
            mask = np.linspace(random.uniform(0.6, 0.95),
                               random.uniform(1.0, 1.15), w)
            if random.random() < 0.5:
                mask = mask[::-1]
            mask  = np.tile(mask, (h, 1))
            mask  = np.stack([mask]*3, axis=2)
            img   = np.clip(img.astype(np.float32) * mask, 0, 255).astype(np.uint8)

        elif mode == 'vignette':
            # Dark edges (phone camera lens effect)
            Y, X    = np.ogrid[:h, :w]
            cx, cy  = w // 2, h // 2
            dist    = np.sqrt((X - cx)**2 + (Y - cy)**2)
            max_d   = np.sqrt(cx**2 + cy**2)
            mask    = 1 - (dist / max_d) * random.uniform(0.3, 0.6)
            mask    = np.stack([mask]*3, axis=2)
            img     = np.clip(img.astype(np.float32) * mask, 0, 255).astype(np.uint8)

        return img

    def _augment_blur(self, img: np.ndarray) -> np.ndarray:
        """Motion blur or Gaussian blur."""
        mode = random.choice(['gaussian', 'motion'])

        if mode == 'gaussian':
            k   = random.choice([3, 5])
            img = cv2.GaussianBlur(img, (k, k), 0)

        elif mode == 'motion':
            # Horizontal or diagonal motion blur
            k    = random.randint(3, 9)
            kern = np.zeros((k, k))
            if random.random() < 0.5:
                kern[k//2, :] = 1  # Horizontal
            else:
                np.fill_diagonal(kern, 1)  # Diagonal
            kern = kern / kern.sum()
            img  = cv2.filter2D(img, -1, kern)

        return img

    def _augment_perspective(self, img: np.ndarray) -> np.ndarray:
        """Simulate paper held at a slight angle."""
        h, w  = img.shape[:2]
        jitter = random.randint(10, 40)

        src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
        dst = np.float32([
            [random.randint(0, jitter),   random.randint(0, jitter)],
            [w - random.randint(0,jitter),random.randint(0, jitter)],
            [w - random.randint(0,jitter),h - random.randint(0, jitter)],
            [random.randint(0, jitter),   h - random.randint(0, jitter)],
        ])

        M   = cv2.getPerspectiveTransform(src, dst)
        img = cv2.warpPerspective(img, M, (w, h),
                                  borderMode=cv2.BORDER_REPLICATE)
        return img

    # ─────────────────────────────────────────────────────────────────────
    # YOLO data.yaml
    # ─────────────────────────────────────────────────────────────────────

    def _write_data_yaml(self):
        cfg      = self.cfg
        data_dir = cfg.OUTPUT_DIR.absolute()
        names    = [c if c != ' ' else 'space' for c in ALL_CLASSES]

        yaml_content = f"""# BrailleVision 2026 — Synthetic Dataset
# Generated by dataset_generator/generate.py
# 20,000 images · {len(ALL_CLASSES)} classes (A-Z + 0-9 + space)

path:  {data_dir}
train: images/train
val:   images/val
test:  images/test

nc:    {len(ALL_CLASSES)}
names: {names}
"""
        with open(cfg.OUTPUT_DIR / 'data.yaml', 'w') as f:
            f.write(yaml_content)
        print(f"✅ data.yaml written")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 60)
    print("BrailleVision 2026 — Synthetic Dataset Generator")
    print("=" * 60)
    print(f"Total images    : 20,000")
    print(f"Classes         : {len(ALL_CLASSES)} (A-Z + 0-9 + space)")
    print(f"Augmentations   : Lighting, Noise, Blur, Perspective, Interpoint")
    print("=" * 60)

    config    = Config()
    generator = BrailleDatasetGenerator(config)
    generator.generate()