"""
Ablation Study Script
---------------------
Runs 3-seed experiments across ablation configurations as specified
in the proposal (Section 5):

  1. Fusion Mode Ablation:
     - concat_diff_prod (full — default)
     - concat
     - diff
     - prod

  2. Loss Ablation:
     - focal + dice (full — default)
     - focal only
     - dice only

Each configuration is trained for the specified number of epochs across
3 random seeds, and results are aggregated (mean ± std).

Usage:
    python scripts/run_ablations.py                             # all ablations
    python scripts/run_ablations.py --ablation fusion            # fusion modes only
    python scripts/run_ablations.py --ablation loss              # loss variants only
    python scripts/run_ablations.py --epochs 10 --batch_size 8   # custom training params
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import argparse
import json
import time
from datetime import timedelta
from typing import List, Dict

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from src.data.dataset import xBDDataset, DamageAwareSampler
from src.models.siamese_resnet import SiameseResNet34
from src.models.losses import LocalizationLoss, DamageLoss, FocalLoss, MultiClassDiceLoss
from src.evaluation.metrics import (
    calculate_localization_f1,
    calculate_damage_metrics,
    calculate_xview2_score,
)

# ──────────────────────────────────────────────────────────────
# Ablation configurations
# ──────────────────────────────────────────────────────────────

FUSION_ABLATIONS = [
    {"name": "Full (concat+diff+prod)", "fusion_mode": "concat_diff_prod"},
    {"name": "Concat only",             "fusion_mode": "concat"},
    {"name": "Diff only",               "fusion_mode": "diff"},
    {"name": "Prod only",               "fusion_mode": "prod"},
]

LOSS_ABLATIONS = [
    {"name": "Focal + Dice (full)",     "focal_weight": 1.0, "dice_weight": 1.0},
    {"name": "Focal only",              "focal_weight": 1.0, "dice_weight": 0.0},
    {"name": "Dice only",               "focal_weight": 0.0, "dice_weight": 1.0},
]

SEEDS = [42, 123, 7]


# ──────────────────────────────────────────────────────────────
# Training helpers
# ──────────────────────────────────────────────────────────────

def set_seed(seed: int):
    """Set all random seeds for reproducibility."""
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def build_loss_fn(focal_weight: float = 1.0, dice_weight: float = 1.0) -> nn.Module:
    """Build the damage loss with the given ablation weights."""
    return DamageLoss(
        class_weights=[0.1, 0.4, 0.3, 0.2],
        gamma=2.0,
        focal_weight=focal_weight,
        dice_weight=dice_weight,
    )


def train_one_epoch(model, loader, optimizer, scaler, loc_loss_fn, dmg_loss_fn, device):
    model.train()
    total_loss = 0.0
    for batch in loader:
        pre = batch["pre"].to(device, non_blocking=True)
        post = batch["post"].to(device, non_blocking=True)
        loc_target = batch["loc"].to(device, non_blocking=True)
        dmg_target = batch["dmg"].to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)
        with torch.amp.autocast(device_type="cuda", dtype=torch.float16):
            outputs = model(pre, post)
            loss = loc_loss_fn(outputs["loc_logits"], loc_target) + \
                   dmg_loss_fn(outputs["dmg_logits"], dmg_target)
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        total_loss += loss.item()
    return total_loss / len(loader)


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    all_loc_preds, all_loc_targets = [], []
    all_dmg_preds, all_dmg_targets = [], []
    for batch in loader:
        pre = batch["pre"].to(device, non_blocking=True)
        post = batch["post"].to(device, non_blocking=True)
        with torch.amp.autocast(device_type="cuda", dtype=torch.float16):
            outputs = model(pre, post)
        all_loc_preds.append(torch.sigmoid(outputs["loc_logits"]).cpu().numpy())
        all_loc_targets.append(batch["loc"].cpu().numpy())
        all_dmg_preds.append(torch.argmax(outputs["dmg_logits"], dim=1).cpu().numpy())
        all_dmg_targets.append(batch["dmg"].cpu().numpy())

    loc_f1 = calculate_localization_f1(
        np.concatenate(all_loc_preds), np.concatenate(all_loc_targets)
    )
    per_cls, macro = calculate_damage_metrics(
        np.concatenate(all_dmg_preds).flatten(),
        np.concatenate(all_dmg_targets).flatten(),
    )
    return {
        "loc_f1": loc_f1,
        "dmg_macro_f1": macro,
        "xview2_score": calculate_xview2_score(loc_f1, macro),
        **per_cls,
    }


# ──────────────────────────────────────────────────────────────
# Single run
# ──────────────────────────────────────────────────────────────

def run_single_experiment(
    fusion_mode: str,
    focal_weight: float,
    dice_weight: float,
    seed: int,
    train_loader: DataLoader,
    val_loader: DataLoader,
    epochs: int,
    lr: float,
    device: torch.device,
) -> dict:
    """Train one configuration with one seed and return best val metrics."""
    set_seed(seed)

    model = SiameseResNet34(pretrained=True, fusion_mode=fusion_mode).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    scaler = torch.amp.GradScaler(device="cuda")

    loc_loss = LocalizationLoss()
    dmg_loss = build_loss_fn(focal_weight, dice_weight)

    best_metrics = None
    best_score = 0.0

    for epoch in range(1, epochs + 1):
        loss = train_one_epoch(model, train_loader, optimizer, scaler, loc_loss, dmg_loss, device)
        scheduler.step()
        metrics = evaluate(model, val_loader, device)

        if metrics["xview2_score"] > best_score:
            best_score = metrics["xview2_score"]
            best_metrics = metrics.copy()

    return best_metrics


# ──────────────────────────────────────────────────────────────
# Multi-seed aggregation
# ──────────────────────────────────────────────────────────────

def aggregate_runs(all_results: List[dict]) -> dict:
    """Compute mean ± std across seeds for every metric."""
    keys = all_results[0].keys()
    agg = {}
    for k in keys:
        vals = [r[k] for r in all_results]
        agg[k] = {"mean": float(np.mean(vals)), "std": float(np.std(vals))}
    return agg


def print_ablation_table(results: List[dict]):
    """Pretty-print a summary table for all configurations."""
    header = (
        f"{'Configuration':<30} | {'xView2 Score':>16} | {'Loc F1':>14} | "
        f"{'Dmg Macro-F1':>16} | {'F1 Minor':>14} | {'F1 Major':>14}"
    )
    sep = "-" * len(header)
    print(f"\n{sep}")
    print(header)
    print(sep)
    for entry in results:
        agg = entry["aggregated"]
        name = entry["name"]
        xv = agg["xview2_score"]
        lf = agg["loc_f1"]
        dm = agg["dmg_macro_f1"]
        fm = agg.get("f1_minor", {"mean": 0, "std": 0})
        fmaj = agg.get("f1_major", {"mean": 0, "std": 0})
        print(
            f"{name:<30} | "
            f"{xv['mean']:.4f} ± {xv['std']:.4f} | "
            f"{lf['mean']:.4f} ± {lf['std']:.4f} | "
            f"{dm['mean']:.4f} ± {dm['std']:.4f} | "
            f"{fm['mean']:.4f} ± {fm['std']:.4f} | "
            f"{fmaj['mean']:.4f} ± {fmaj['std']:.4f}"
        )
    print(f"{sep}\n")


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Run 3-seed ablation experiments")
    parser.add_argument("--ablation", choices=["fusion", "loss", "all"], default="all")
    parser.add_argument("--epochs", type=int, default=15, help="Epochs per run")
    parser.add_argument("--batch_size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--seeds", nargs="+", type=int, default=SEEDS)
    parser.add_argument("--save_results", default="checkpoints/ablation_results.json")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    print(f"Seeds: {args.seeds}")

    # ── Data ─────────────────────────────────────────────────
    train_index = "data/processed/train_tiles.json"
    val_index = "data/processed/val_tiles.json"

    if not os.path.exists(train_index):
        print(f"Warning: '{train_index}' not found, falling back to val tiles.")
        train_index = val_index

    val_ds = xBDDataset(val_index, is_train=False)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False, num_workers=2, pin_memory=True)

    train_ds = xBDDataset(train_index, is_train=True)
    sampler = DamageAwareSampler(train_ds.records)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, sampler=sampler, num_workers=4, pin_memory=True)
    print(f"Train tiles: {len(train_ds)}, Val tiles: {len(val_ds)}\n")

    # ── Build experiment list ────────────────────────────────
    experiments = []
    if args.ablation in ("fusion", "all"):
        for cfg in FUSION_ABLATIONS:
            experiments.append({
                "name": f"[Fusion] {cfg['name']}",
                "fusion_mode": cfg["fusion_mode"],
                "focal_weight": 1.0,
                "dice_weight": 1.0,
            })
    if args.ablation in ("loss", "all"):
        for cfg in LOSS_ABLATIONS:
            experiments.append({
                "name": f"[Loss] {cfg['name']}",
                "fusion_mode": "concat_diff_prod",
                "focal_weight": cfg["focal_weight"],
                "dice_weight": cfg["dice_weight"],
            })

    total = len(experiments) * len(args.seeds)
    print(f"Running {len(experiments)} configurations × {len(args.seeds)} seeds = {total} experiments\n")

    # ── Run all experiments ──────────────────────────────────
    all_results = []
    t0 = time.time()

    for exp_idx, exp in enumerate(experiments, 1):
        print(f"{'='*60}")
        print(f"Config {exp_idx}/{len(experiments)}: {exp['name']}")
        print(f"{'='*60}")

        seed_results = []
        for seed in args.seeds:
            print(f"  Seed {seed} ...", end=" ", flush=True)
            st = time.time()
            metrics = run_single_experiment(
                fusion_mode=exp["fusion_mode"],
                focal_weight=exp["focal_weight"],
                dice_weight=exp["dice_weight"],
                seed=seed,
                train_loader=train_loader,
                val_loader=val_loader,
                epochs=args.epochs,
                lr=args.lr,
                device=device,
            )
            elapsed = time.time() - st
            print(f"xView2={metrics['xview2_score']:.4f}  ({timedelta(seconds=int(elapsed))})")
            seed_results.append(metrics)

        aggregated = aggregate_runs(seed_results)
        all_results.append({
            "name": exp["name"],
            "config": exp,
            "per_seed": seed_results,
            "aggregated": aggregated,
        })

    total_time = timedelta(seconds=int(time.time() - t0))
    print(f"\nAll experiments completed in {total_time}.")

    # ── Print summary table ──────────────────────────────────
    print_ablation_table(all_results)

    # ── Save results ─────────────────────────────────────────
    os.makedirs(os.path.dirname(args.save_results) or ".", exist_ok=True)
    with open(args.save_results, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"Full results saved to {args.save_results}")


if __name__ == "__main__":
    main()
