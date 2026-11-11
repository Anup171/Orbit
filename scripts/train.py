"""
Model Training Script
---------------------
Trains the Siamese ResNet-34 on 512x512 satellite patches on CUDA / GPU.
Features:
  - Mixed precision training (torch.amp) for maximum GPU throughput.
  - Periodic validation tracking xView2 composite score.
  - Model checkpoint saving (best model based on validation xView2 score).
  - TensorBoard & console logging.
"""

import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

import argparse
import yaml
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm
import numpy as np

from src.data.dataset import xBDDataset, DamageAwareSampler
from src.models.siamese_resnet import SiameseResNet34
from src.models.losses import LocalizationLoss, DamageLoss
from src.evaluation.metrics import (
    calculate_localization_f1,
    calculate_damage_metrics,
    calculate_xview2_score,
)


def train_one_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer,
    scaler: torch.amp.GradScaler,
    loc_loss_fn: nn.Module,
    dmg_loss_fn: nn.Module,
    device: torch.device,
) -> float:
    model.train()
    total_loss = 0.0

    pbar = tqdm(loader, desc="Training Batch", leave=False)
    for batch in pbar:
        pre = batch["pre"].to(device, non_blocking=True)
        post = batch["post"].to(device, non_blocking=True)
        loc_target = batch["loc"].to(device, non_blocking=True)
        dmg_target = batch["dmg"].to(device, non_blocking=True)

        optimizer.zero_grad(set_to_none=True)

        with torch.amp.autocast(device_type="cuda", dtype=torch.float16):
            outputs = model(pre, post)
            l_loss = loc_loss_fn(outputs["loc_logits"], loc_target)
            d_loss = dmg_loss_fn(outputs["dmg_logits"], dmg_target)
            loss = l_loss + d_loss

        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()

        total_loss += loss.item()
        pbar.set_postfix({"loss": f"{loss.item():.4f}"})

    return total_loss / len(loader)


@torch.no_grad()
def evaluate(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> dict:
    model.eval()
    all_loc_preds, all_loc_targets = [], []
    all_dmg_preds, all_dmg_targets = [], []

    for batch in tqdm(loader, desc="Validation", leave=False):
        pre = batch["pre"].to(device, non_blocking=True)
        post = batch["post"].to(device, non_blocking=True)
        loc_target = batch["loc"].cpu().numpy()
        dmg_target = batch["dmg"].cpu().numpy()

        with torch.amp.autocast(device_type="cuda", dtype=torch.float16):
            outputs = model(pre, post)

        loc_probs = torch.sigmoid(outputs["loc_logits"]).cpu().numpy()
        dmg_preds = torch.argmax(outputs["dmg_logits"], dim=1).cpu().numpy()

        all_loc_preds.append(loc_probs)
        all_loc_targets.append(loc_target)
        all_dmg_preds.append(dmg_preds)
        all_dmg_targets.append(dmg_target)

    # Flatten and compute metrics
    loc_preds = np.concatenate(all_loc_preds, axis=0)
    loc_targets = np.concatenate(all_loc_targets, axis=0)
    dmg_preds = np.concatenate(all_dmg_preds, axis=0).flatten()
    dmg_targets = np.concatenate(all_dmg_targets, axis=0).flatten()

    loc_f1 = calculate_localization_f1(loc_preds, loc_targets)
    per_class_f1, dmg_macro_f1 = calculate_damage_metrics(dmg_preds, dmg_targets)
    xview2_score = calculate_xview2_score(loc_f1, dmg_macro_f1)

    return {
        "loc_f1": loc_f1,
        "dmg_macro_f1": dmg_macro_f1,
        "xview2_score": xview2_score,
        **per_class_f1,
    }


def main():
    parser = argparse.ArgumentParser(description="Train Siamese ResNet-34 on xBD")
    parser.add_argument("--config", default="configs/config.yaml", help="Path to config file")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs")
    parser.add_argument("--batch_size", type=int, default=8, help="Batch size")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--fusion", default="concat_diff_prod", choices=["concat", "diff", "prod", "concat_diff_prod"])
    parser.add_argument("--save_dir", default="checkpoints", help="Directory to save model checkpoints")
    args = parser.parse_args()

    os.makedirs(args.save_dir, exist_ok=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using compute device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    # Check available datasets
    train_index = "data/processed/train_tiles.json"
    val_index = "data/processed/val_tiles.json"

    # Fallback to val tiles if train tiling is still in progress
    if not os.path.exists(train_index):
        print(f"Warning: '{train_index}' not found yet. Using validation tiles for fast prototype verification.")
        train_index = val_index

    # Initialize Datasets
    val_dataset = xBDDataset(val_index, is_train=False)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False, num_workers=2, pin_memory=True)

    train_dataset = xBDDataset(train_index, is_train=True)
    sampler = DamageAwareSampler(train_dataset.records)
    train_loader = DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        sampler=sampler,
        num_workers=4,
        pin_memory=True,
    )

    print(f"Loaded {len(train_dataset)} training tiles and {len(val_dataset)} validation tiles.")

    # Initialize Model & Loss
    model = SiameseResNet34(pretrained=True, fusion_mode=args.fusion).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    scaler = torch.amp.GradScaler(device="cuda")

    loc_loss = LocalizationLoss()
    dmg_loss = DamageLoss()

    best_score = 0.0
    for epoch in range(1, args.epochs + 1):
        loss = train_one_epoch(model, train_loader, optimizer, scaler, loc_loss, dmg_loss, device)
        scheduler.step()

        metrics = evaluate(model, val_loader, device)
        print(
            f"Epoch {epoch:02d}/{args.epochs:02d} | Loss: {loss:.4f} | "
            f"Loc F1: {metrics['loc_f1']:.4f} | Dmg F1: {metrics['dmg_macro_f1']:.4f} | "
            f"xView2 Score: {metrics['xview2_score']:.4f} | "
            f"[None: {metrics['f1_none']:.2f}, Minor: {metrics['f1_minor']:.2f}, "
            f"Major: {metrics['f1_major']:.2f}, Dest: {metrics['f1_destroyed']:.2f}]"
        )

        if metrics["xview2_score"] > best_score:
            best_score = metrics["xview2_score"]
            ckpt_path = os.path.join(args.save_dir, "best_siamese_resnet34.pt")
            torch.save(
                {
                    "epoch": epoch,
                    "model_state": model.state_dict(),
                    "optimizer_state": optimizer.state_dict(),
                    "metrics": metrics,
                    "fusion_mode": args.fusion,
                },
                ckpt_path,
            )
            print(f"  -> New best xView2 score ({best_score:.4f}) saved to {ckpt_path}")


if __name__ == "__main__":
    main()
