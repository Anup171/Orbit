"""
ONNX Export Script
------------------
Exports the trained Siamese ResNet-34 checkpoint to ONNX format for
production serving with the FastAPI/Celery backend (Stage 5).

Features:
  - Supports optional temperature scaling baked into the export.
  - Validates the exported ONNX model against PyTorch outputs.
  - Optionally simplifies the graph with onnx-simplifier.

Usage:
    python scripts/export_onnx.py                                       # basic export
    python scripts/export_onnx.py --temperature 1.85                    # with temp scaling
    python scripts/export_onnx.py --simplify --output checkpoints/model.onnx
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import argparse
import numpy as np
import torch
import torch.nn as nn

from src.models.siamese_resnet import SiameseResNet34


# ──────────────────────────────────────────────────────────────
# Wrapper that bakes in temperature scaling + softmax
# ──────────────────────────────────────────────────────────────

class ExportableSiameseResNet34(nn.Module):
    """
    Thin wrapper around SiameseResNet34 that:
      1. Takes two inputs (pre_img, post_img).
      2. Applies optional temperature scaling to damage logits.
      3. Returns (loc_prob, dmg_prob) as sigmoid/softmax outputs
         ready for direct downstream consumption.
    """

    def __init__(self, model: SiameseResNet34, temperature: float = 1.0):
        super().__init__()
        self.model = model
        self.temperature = temperature

    def forward(self, pre_img: torch.Tensor, post_img: torch.Tensor):
        outputs = self.model(pre_img, post_img)
        loc_prob = torch.sigmoid(outputs["loc_logits"])             # (B, 1, H, W)
        dmg_prob = torch.softmax(
            outputs["dmg_logits"] / self.temperature, dim=1
        )                                                           # (B, 4, H, W)
        return loc_prob, dmg_prob


# ──────────────────────────────────────────────────────────────
# Export logic
# ──────────────────────────────────────────────────────────────

def export_to_onnx(
    model: nn.Module,
    output_path: str,
    img_size: int = 512,
    opset_version: int = 17,
    dynamic_batch: bool = True,
):
    """
    Export the wrapper model to ONNX.
    """
    model.eval()

    # Dummy inputs matching xBD tile dimensions
    dummy_pre = torch.randn(1, 3, img_size, img_size)
    dummy_post = torch.randn(1, 3, img_size, img_size)

    dynamic_axes = None
    if dynamic_batch:
        dynamic_axes = {
            "pre_img":  {0: "batch_size"},
            "post_img": {0: "batch_size"},
            "loc_prob": {0: "batch_size"},
            "dmg_prob": {0: "batch_size"},
        }

    torch.onnx.export(
        model,
        (dummy_pre, dummy_post),
        output_path,
        input_names=["pre_img", "post_img"],
        output_names=["loc_prob", "dmg_prob"],
        dynamic_axes=dynamic_axes,
        opset_version=opset_version,
        do_constant_folding=True,
    )

    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"ONNX model exported to: {output_path}  ({file_size_mb:.1f} MB)")


# ──────────────────────────────────────────────────────────────
# Validation: compare PyTorch vs ONNX outputs
# ──────────────────────────────────────────────────────────────

def validate_onnx(
    pytorch_model: nn.Module,
    onnx_path: str,
    img_size: int = 512,
    atol: float = 1e-4,
):
    """
    Runs the same inputs through PyTorch and ONNX Runtime, then checks
    that outputs match within tolerance.
    """
    try:
        import onnxruntime as ort
    except ImportError:
        print("Warning: onnxruntime not installed — skipping ONNX validation.")
        return False

    pytorch_model.eval()
    dummy_pre = torch.randn(1, 3, img_size, img_size)
    dummy_post = torch.randn(1, 3, img_size, img_size)

    # PyTorch reference
    with torch.no_grad():
        pt_loc, pt_dmg = pytorch_model(dummy_pre, dummy_post)
    pt_loc = pt_loc.numpy()
    pt_dmg = pt_dmg.numpy()

    # ONNX Runtime
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    ort_loc, ort_dmg = sess.run(
        None,
        {
            "pre_img": dummy_pre.numpy(),
            "post_img": dummy_post.numpy(),
        },
    )

    loc_match = np.allclose(pt_loc, ort_loc, atol=atol)
    dmg_match = np.allclose(pt_dmg, ort_dmg, atol=atol)

    if loc_match and dmg_match:
        print(f"✓ ONNX validation passed (atol={atol})")
        return True
    else:
        loc_diff = np.max(np.abs(pt_loc - ort_loc))
        dmg_diff = np.max(np.abs(pt_dmg - ort_dmg))
        print(f"✗ ONNX validation FAILED — max diff: loc={loc_diff:.6f}, dmg={dmg_diff:.6f}")
        return False


# ──────────────────────────────────────────────────────────────
# Optional: graph simplification
# ──────────────────────────────────────────────────────────────

def simplify_onnx(onnx_path: str):
    """
    Simplify the ONNX graph with onnx-simplifier (optional dependency).
    """
    try:
        import onnx
        from onnxsim import simplify as onnx_simplify

        model = onnx.load(onnx_path)
        simplified, ok = onnx_simplify(model)
        if ok:
            onnx.save(simplified, onnx_path)
            print(f"✓ ONNX graph simplified successfully.")
        else:
            print("Warning: onnx-simplifier could not simplify the graph.")
    except ImportError:
        print("Warning: onnx / onnxsim not installed — skipping simplification.")


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Export Siamese ResNet-34 to ONNX")
    parser.add_argument(
        "--checkpoint",
        default="checkpoints/best_siamese_resnet34.pt",
        help="Path to saved PyTorch checkpoint",
    )
    parser.add_argument(
        "--output",
        default="checkpoints/siamese_resnet34.onnx",
        help="Output path for the ONNX model",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=1.0,
        help="Temperature scaling factor to bake into the export (default: 1.0 = no scaling)",
    )
    parser.add_argument(
        "--img_size",
        type=int,
        default=512,
        help="Input image size (H and W)",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version",
    )
    parser.add_argument(
        "--simplify",
        action="store_true",
        help="Run onnx-simplifier on the exported model",
    )
    parser.add_argument(
        "--skip_validation",
        action="store_true",
        help="Skip PyTorch vs ONNX output comparison",
    )
    args = parser.parse_args()

    # ── Load checkpoint ──────────────────────────────────────
    print(f"Loading checkpoint: {args.checkpoint}")
    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)

    fusion_mode = ckpt.get("fusion_mode", "concat_diff_prod")
    base_model = SiameseResNet34(pretrained=False, fusion_mode=fusion_mode)
    base_model.load_state_dict(ckpt["model_state"])
    base_model.eval()

    if args.temperature != 1.0:
        print(f"Baking temperature scaling (T={args.temperature:.4f}) into export.")
    export_model = ExportableSiameseResNet34(base_model, temperature=args.temperature)
    export_model.eval()

    # ── Export ────────────────────────────────────────────────
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    export_to_onnx(
        export_model,
        args.output,
        img_size=args.img_size,
        opset_version=args.opset,
    )

    # ── Simplify (optional) ──────────────────────────────────
    if args.simplify:
        simplify_onnx(args.output)

    # ── Validate ─────────────────────────────────────────────
    if not args.skip_validation:
        validate_onnx(export_model, args.output, img_size=args.img_size)

    print("\nDone. The ONNX model is ready for Stage 5 (FastAPI + Celery serving).")


if __name__ == "__main__":
    main()
