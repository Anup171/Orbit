"""
xView2 & Building Evaluation Metrics
------------------------------------
Computes standard benchmarks according to Section 6 of the proposal:
1. Building Localization F1 score.
2. Per-Class Damage F1 scores:
   - F1_none (No Damage)
   - F1_minor (Minor Damage)
   - F1_major (Major Damage)
   - F1_destroyed (Destroyed)
3. Damage Macro-F1 (Harmonic or unweighted mean across damage categories).
4. Official xView2 Challenge Score:
   Score = 0.3 * F1_localization + 0.7 * F1_damage_macro
"""

from typing import Dict, Tuple
import numpy as np
import torch
from sklearn.metrics import f1_score


def calculate_localization_f1(
    pred_mask: np.ndarray,
    target_mask: np.ndarray,
    threshold: float = 0.5
) -> float:
    """
    Computes binary F1 score for building footprints.
    """
    pred_bin = (pred_mask > threshold).astype(np.uint8).flatten()
    target_bin = (target_mask > 0).astype(np.uint8).flatten()
    return float(f1_score(target_bin, pred_bin, zero_division=0))


def calculate_damage_metrics(
    pred_damage: np.ndarray,
    target_damage: np.ndarray,
    ignore_index: int = 255
) -> Tuple[Dict[str, float], float]:
    """
    Computes per-class F1 and macro-F1 strictly inside building pixels.
    Args:
        pred_damage: (N,) predicted damage class indices [0, 1, 2, 3]
        target_damage: (N,) ground-truth damage class indices [0, 1, 2, 3, 255]
    """
    valid_idx = target_damage != ignore_index
    if not np.any(valid_idx):
        return {"f1_none": 0.0, "f1_minor": 0.0, "f1_major": 0.0, "f1_destroyed": 0.0}, 0.0

    y_true = target_damage[valid_idx]
    y_pred = pred_damage[valid_idx]

    # Compute F1 for each class individually
    classes = [0, 1, 2, 3]
    class_names = ["f1_none", "f1_minor", "f1_major", "f1_destroyed"]
    per_class_f1 = f1_score(y_true, y_pred, labels=classes, average=None, zero_division=0)

    per_class_dict = {name: float(score) for name, score in zip(class_names, per_class_f1)}
    # Unweighted average across 4 classes
    macro_f1 = float(np.mean(per_class_f1))

    return per_class_dict, macro_f1


def calculate_xview2_score(
    f1_localization: float,
    f1_damage_macro: float
) -> float:
    """
    Official xView2 scoring formula: 0.3 * F1_loc + 0.7 * F1_damage
    """
    return 0.3 * f1_localization + 0.7 * f1_damage_macro

