"""
model/swin_braille.py
======================
Swin Transformer for Braille Cell Classification
=================================================
WHY SWIN TRANSFORMER OVER YOLO FOR BRAILLE?

YOLOv8 is great for object detection but Braille has unique properties:
  1. All cells are the SAME size (no scale variation to detect)
  2. What matters is the INTERNAL dot pattern — local patch attention
  3. Dots are tiny (~5px radius) — needs fine-grained feature extraction
  4. Swin's shifted window attention captures exactly this local structure

SWIN TRANSFORMER ARCHITECTURE:
  Input: 96×96 crop of a single Braille cell (after YOLO locates it)
  ↓
  Patch Partition (4×4 patches → 24×24 tokens)
  ↓
  Stage 1: 2× Swin Blocks (96 channels, window=7)
  ↓
  Patch Merging (downscale 2×)
  ↓
  Stage 2: 2× Swin Blocks (192 channels, window=7)
  ↓
  Patch Merging
  ↓
  Stage 3: 6× Swin Blocks (384 channels, window=7)
  ↓
  Patch Merging
  ↓
  Stage 4: 2× Swin Blocks (768 channels, window=7)
  ↓
  Global Average Pooling
  ↓
  Classifier Head → 37 classes (A-Z + 0-9 + space)

We use pretrained Swin-Tiny weights from ImageNet and fine-tune
on our 20k synthetic Braille dataset.

Vibe-Coding Disclosure: Architecture designed with Claude (Anthropic).
"""

import torch
import torch.nn as nn
from torchvision.models import swin_t, Swin_T_Weights
from typing import Optional


# ---------------------------------------------------------------------------
# Class config
# ---------------------------------------------------------------------------

ALL_CLASSES = list('abcdefghijklmnopqrstuvwxyz') + list('0123456789') + [' ']
NUM_CLASSES  = len(ALL_CLASSES)   # 37
CLASS_TO_IDX = {c: i for i, c in enumerate(ALL_CLASSES)}
IDX_TO_CLASS = {i: c for c, i in CLASS_TO_IDX.items()}


# ---------------------------------------------------------------------------
# Swin Braille Classifier
# ---------------------------------------------------------------------------

class SwinBrailleClassifier(nn.Module):
    """
    Swin Transformer fine-tuned for Braille cell classification.

    Uses pretrained Swin-Tiny (28M params) with a custom head
    for 37-class Braille output.

    Input:  (B, 3, 96, 96)  — RGB crop of single Braille cell
    Output: (B, 37)          — logits for each character class
    """

    def __init__(
        self,
        num_classes:  int  = NUM_CLASSES,
        pretrained:   bool = True,
        dropout:      float = 0.3,
        freeze_stages:int   = 0,   # 0 = train all, 1-4 = freeze first N stages
    ):
        super().__init__()

        self.num_classes = num_classes

        # ── Load pretrained Swin-Tiny ──────────────────────────────────────
        weights = Swin_T_Weights.IMAGENET1K_V1 if pretrained else None
        backbone = swin_t(weights=weights)

        # ── Remove original classifier head ───────────────────────────────
        # backbone.head is a Linear(768, 1000)
        # We replace with our custom Braille head
        in_features = backbone.head.in_features   # 768

        # Keep everything except the head
        self.patch_partition = backbone.features   # All Swin stages
        self.norm            = backbone.norm

        # ── Custom Braille classification head ────────────────────────────
        # Two-layer MLP head with dropout for regularisation
        self.head = nn.Sequential(
            nn.Linear(in_features, 256),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(256, num_classes),
        )

        # ── Optional stage freezing (transfer learning) ───────────────────
        if freeze_stages > 0:
            self._freeze_stages(freeze_stages)

        # Initialise head weights
        nn.init.trunc_normal_(self.head[0].weight, std=0.02)
        nn.init.zeros_(self.head[0].bias)
        nn.init.trunc_normal_(self.head[3].weight, std=0.02)
        nn.init.zeros_(self.head[3].bias)

    def _freeze_stages(self, n: int):
        """Freeze first n Swin stages (features[0..2n-1])."""
        # Swin features: [PatchEmbed, stage0, DownSample, stage1, DownSample, ...]
        freeze_layers = min(n * 2, len(list(self.patch_partition.children())))
        for i, layer in enumerate(self.patch_partition.children()):
            if i < freeze_layers:
                for param in layer.parameters():
                    param.requires_grad = False

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, 3, H, W) → (B, num_classes)
        x = self.patch_partition(x)   # (B, H', W', C)  — NHWC layout (channels last)
        x = self.norm(x)              # (B, H', W', C)
        x = x.mean(dim=[1, 2])        # (B, C)  — global avg pool over spatial dims
        x = self.head(x)              # (B, num_classes)
        return x

    def predict_char(self, x: torch.Tensor) -> str:
        """Convenience: run inference and return character string."""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            idx    = logits.argmax(dim=1).item()
        return IDX_TO_CLASS.get(idx, '?')

    def predict_with_confidence(self, x: torch.Tensor):
        """Return (char, confidence) tuple."""
        self.eval()
        with torch.no_grad():
            logits = self.forward(x)
            probs  = torch.softmax(logits, dim=1)
            conf, idx = probs.max(dim=1)
        return IDX_TO_CLASS.get(idx.item(), '?'), conf.item()


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------

def build_model(
    num_classes:   int   = NUM_CLASSES,
    pretrained:    bool  = True,
    dropout:       float = 0.3,
    freeze_stages: int   = 0,
    device:        str   = 'auto',
) -> SwinBrailleClassifier:
    """
    Build and return a SwinBrailleClassifier.

    Args:
        num_classes:   Number of output classes (default 37)
        pretrained:    Use ImageNet pretrained weights
        dropout:       Dropout rate in head (default 0.3)
        freeze_stages: Freeze first N Swin stages (0 = all trainable)
        device:        'auto', 'cuda', 'cpu', or 'mps'

    Returns:
        SwinBrailleClassifier on the target device
    """
    if device == 'auto':
        if torch.cuda.is_available():
            device = 'cuda'
        elif torch.backends.mps.is_available():
            device = 'mps'
        else:
            device = 'cpu'

    print(f"[Model] Building SwinBrailleClassifier on {device}")
    print(f"[Model] Classes: {num_classes} | Pretrained: {pretrained} | Freeze: {freeze_stages} stages")

    model = SwinBrailleClassifier(
        num_classes=num_classes,
        pretrained=pretrained,
        dropout=dropout,
        freeze_stages=freeze_stages,
    ).to(device)

    # Print parameter count
    total  = sum(p.numel() for p in model.parameters())
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"[Model] Total params:     {total:,}")
    print(f"[Model] Trainable params: {trainable:,}")

    return model


# ---------------------------------------------------------------------------
# Quick test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    model = build_model(pretrained=False)
    dummy = torch.randn(4, 3, 96, 96)
    out   = model(dummy)
    print(f"Input:  {dummy.shape}")
    print(f"Output: {out.shape}")
    print(f"Classes: {NUM_CLASSES}")
    print("✅ Model forward pass OK")