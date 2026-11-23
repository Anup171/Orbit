"""
Evaluation Script — Full xView2 Benchmark + Calibration Metrics
---------------------------------------------------------------
Loads the best checkpoint and evaluates on the test (or val) split:
  1. Building Localization F1
  2. Per-Class Damage F1 (None / Minor / Major / Destroyed)
  3. Damage Macro-F1
  4. Official xView2 Composite Score = 0.3 * F1_loc + 0.7 * F1_dmg_macro
  5. Expected Calibration Error (ECE) — measures confidence reliability
  6. Optionally applies Temperature Scaling to recalibrate and reports
     the post-calibration ECE.

Usage:
    python scripts/evaluate.py                              # eval on test split
    python scripts/evaluate.py --split val                  # eval on val split
    python scripts/evaluate.py --calibrate --cal_split val  # calibrate on val, eval on test
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import argparse
import json
import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader
from tqdm import tqdm

from src.data.dataset import xBDDataset
from src.models.siamese_resnet import SiameseResNet34
from src.evaluation.metrics import (
    calculate_localization_f1,
    calculate_damage_metrics,
    calculate_xview2_score,
)
from src.evaluation.calibration import (
    compute_ece,
    TemperatureScaler,
    calibrate_temperature,
)


# ──────────────────────────────────────────────────────────────
# Inference helpers
# ──────────────────────────────────────────────────────────────

@torch.no_grad()
def collect_predictions(
    model: torch.nn.Module,
    loader: DataLoader,
    device: torch.device,
    temperature: float = 1.0,
) -> dict:
    """
    Run inference on a data loader, collecting localization probs,
    damage logits (optionally temperature-scaled), and ground-truth masks.
    """
    model.eval()

    all_loc_probs, all_loc_targets = [], []
    all_dmg_logits, all_dmg_targets = [], []

    for batch in tqdm(loader, desc="Inference", leave=False):
        pre = batch["pre"].to(device, non_blocking=True)
        post = batch["post"].to(device, non_blocking=True)
        loc_target = batch["loc"].cpu().numpy()
        dmg_target = batch["dmg"].cpu().numpy()

        with torch.amp.autocast(device_type=device.type, dtype=torch.float16):
            outputs = model(pre, post)

        loc_probs = torch.sigmoid(outputs["loc_logits"]).cpu().numpy()
        dmg_logits = outputs["dmg_logits"] / temperature          # temperature scaling
        dmg_probs = F.softmax(dmg_logits, dim=1).cpu().numpy()    # (B, 4, H, W)
        dmg_preds = np.argmax(dmg_probs, axis=1)                  # (B, H, W)

        all_loc_probs.append(loc_probs)
        all_loc_targets.append(loc_target)
        all_dmg_logits.append(dmg_probs)
        all_dmg_targets.append(dmg_target)

    return {
        "loc_probs": np.concatenate(all_loc_probs, axis=0),
        "loc_targets": np.concatenate(all_loc_targets, axis=0),
        "dmg_probs": np.concatenate(all_dmg_logits, axis=0),   # (N, 4, H, W)
        "dmg_targets": np.concatenate(all_dmg_targets, axis=0),
    }


@torch.no_grad()
def collect_logits_for_calibration(
    model: torch.nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> tuple:
    """
    Collect raw (un-scaled) damage logits and targets for temperature
    scaling optimisation. Returns flattened tensors on CPU.
    """
    model.eval()
    all_logits, all_targets = [], []

    for batch in tqdm(loader, desc="Collecting logits for calibration", leave=False):
        pre = batch["pre"].to(device, non_blocking=True)
        post = batch["post"].to(device, non_blocking=True)
        dmg_target = batch["dmg"]  # keep on CPU

        with torch.amp.autocast(device_type=device.type, dtype=torch.float16):
            outputs = model(pre, post)

        logits = outputs["dmg_logits"].float().cpu()  # (B, 4, H, W)

        # Flatten to (B*H*W, 4) and (B*H*W,)
        B, C, H, W = logits.shape
        logits_flat = logits.permute(0, 2, 3, 1).reshape(-1, C)
        targets_flat = dmg_target.reshape(-1)

        # Keep only valid pixels (ignore_index = 255)
        valid = targets_flat != 255
        all_logits.append(logits_flat[valid])
        all_targets.append(targets_flat[valid])

    return torch.cat(all_logits, dim=0), torch.cat(all_targets, dim=0)


# ──────────────────────────────────────────────────────────────
# Metric computation
# ──────────────────────────────────────────────────────────────

def compute_all_metrics(preds: dict) -> dict:
    """
    Compute every evaluation metric from collected predictions.
    """
    # Localization F1
    loc_f1 = calculate_localization_f1(preds["loc_probs"], preds["loc_targets"])

    # Damage F1 (per-class + macro)
    dmg_preds_flat = np.argmax(preds["dmg_probs"], axis=1).flatten()
    dmg_targets_flat = preds["dmg_targets"].flatten()
    per_class_f1, dmg_macro_f1 = calculate_damage_metrics(dmg_preds_flat, dmg_targets_flat)

    # xView2 composite
    xview2_score = calculate_xview2_score(loc_f1, dmg_macro_f1)

    # ECE on damage probabilities (only valid pixels)
    valid_mask = dmg_targets_flat != 255
    if np.any(valid_mask):
        # dmg_probs is (N, 4, H, W) → need (N*H*W, 4)
        probs_flat = preds["dmg_probs"].transpose(0, 2, 3, 1).reshape(-1, 4)
        ece = compute_ece(
            probs_flat[valid_mask],
            dmg_targets_flat[valid_mask],
        )
    else:
        ece = 0.0

    return {
        "loc_f1": loc_f1,
        **per_class_f1,
        "dmg_macro_f1": dmg_macro_f1,
        "xview2_score": xview2_score,
        "ece": ece,
    }


# ──────────────────────────────────────────────────────────────
# Pretty printing
# ──────────────────────────────────────────────────────────────

def print_results(metrics: dict, label: str = "Evaluation Results"):
    sep = "=" * 56
    print(f"\n{sep}")
    print(f"  {label}")
    print(sep)
    print(f"  Building Localization F1  : {metrics['loc_f1']:.4f}")
    print(f"  ──────────────────────────────────────────")
    print(f"  Damage F1 — No Damage     : {metrics['f1_none']:.4f}")
    print(f"  Damage F1 — Minor Damage  : {metrics['f1_minor']:.4f}")
    print(f"  Damage F1 — Major Damage  : {metrics['f1_major']:.4f}")
    print(f"  Damage F1 — Destroyed     : {metrics['f1_destroyed']:.4f}")
    print(f"  Damage Macro-F1           : {metrics['dmg_macro_f1']:.4f}")
    print(f"  ──────────────────────────────────────────")
    print(f"  xView2 Composite Score    : {metrics['xview2_score']:.4f}")
    print(f"  Expected Calibration Error: {metrics['ece']:.4f}")
    print(f"{sep}\n")


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Evaluate Siamese ResNet-34 on xBD")
    parser.add_argument(
        "--checkpoint",
        default="checkpoints/best_siamese_resnet34.pt",
        help="Path to saved checkpoint",
    )
    parser.add_argument(
        "--split",
        default="test",
        choices=["val", "test"],
        help="Which data split to evaluate on",
    )
    parser.add_argument(
        "--batch_size",
        type=int,
        default=8,
        help="Evaluation batch size",
    )
    parser.add_argument(
        "--calibrate",
        action="store_true",
        help="Run temperature scaling calibration before evaluation",
    )
    parser.add_argument(
        "--cal_split",
        default="val",
        choices=["val", "test"],
        help="Split to fit the temperature parameter on (default: val)",
    )
    parser.add_argument(
        "--save_results",
        default=None,
        help="Optional path to save metrics as JSON",
    )
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # ── Load checkpoint ──────────────────────────────────────
    print(f"Loading checkpoint: {args.checkpoint}")
    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)

    fusion_mode = ckpt.get("fusion_mode", "concat_diff_prod")
    model = SiameseResNet34(pretrained=False, fusion_mode=fusion_mode)
    model.load_state_dict(ckpt["model_state"])
    model = model.to(device)

    if "metrics" in ckpt:
        print(f"  Checkpoint epoch {ckpt.get('epoch', '?')} — "
              f"training xView2 score {ckpt['metrics'].get('xview2_score', '?'):.4f}")

    # ── Data loaders ─────────────────────────────────────────
    eval_index = f"data/processed/{args.split}_tiles.json"
    if not os.path.exists(eval_index):
        print(f"Error: index file '{eval_index}' not found.")
        sys.exit(1)

    eval_ds = xBDDataset(eval_index, is_train=False)
    eval_loader = DataLoader(
        eval_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=2,
        pin_memory=True,
    )
    print(f"Evaluating on {len(eval_ds)} tiles from '{args.split}' split.\n")

    # ── Temperature scaling (optional) ───────────────────────
    temperature = 1.0
    if args.calibrate:
        cal_index = f"data/processed/{args.cal_split}_tiles.json"
        if not os.path.exists(cal_index):
            print(f"Error: calibration index file '{cal_index}' not found.")
            sys.exit(1)

        cal_ds = xBDDataset(cal_index, is_train=False)
        cal_loader = DataLoader(
            cal_ds,
            batch_size=args.batch_size,
            shuffle=False,
            num_workers=2,
            pin_memory=True,
        )
        print(f"Calibrating temperature on {len(cal_ds)} tiles from '{args.cal_split}' split...")

        logits, targets = collect_logits_for_calibration(model, cal_loader, device)
        scaler = calibrate_temperature(logits, targets)
        temperature = scaler.temperature.item()
        print(f"  Learned temperature: {temperature:.4f}\n")

    # ── Collect predictions & compute metrics ────────────────
    preds = collect_predictions(model, eval_loader, device, temperature=temperature)
    metrics = compute_all_metrics(preds)

    label = "Results (after temperature scaling)" if args.calibrate else "Evaluation Results"
    print_results(metrics, label=label)

    # ── Save results to JSON ─────────────────────────────────
    if args.save_results:
        os.makedirs(os.path.dirname(args.save_results) or ".", exist_ok=True)
        with open(args.save_results, "w") as f:
            json.dump(metrics, f, indent=2)
        print(f"Results saved to {args.save_results}")


if __name__ == "__main__":
    main()
