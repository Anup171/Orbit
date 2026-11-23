"""
Calibration Module — Temperature Scaling & ECE
-----------------------------------------------
Implements confidence calibration as specified in Section 6 of the proposal:

1. **Expected Calibration Error (ECE):**
   Measures how well predicted confidence aligns with actual accuracy.
   Partitions predictions into B bins by confidence, then computes the
   weighted average gap between accuracy and confidence per bin.

2. **Temperature Scaling:**
   Learns a single scalar T that divides logits before softmax.
   Optimised on a held-out calibration set via NLL minimisation.
   Buildings whose post-calibration max-probability falls below a
   configurable threshold are flagged for manual review.

Reference: Guo et al., "On Calibration of Modern Neural Networks" (ICML 2017).
"""

from typing import Optional, Tuple, List

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.optim import LBFGS


# ──────────────────────────────────────────────────────────────
# Expected Calibration Error
# ──────────────────────────────────────────────────────────────

def compute_ece(
    probs: np.ndarray,
    labels: np.ndarray,
    n_bins: int = 15,
) -> float:
    """
    Compute the Expected Calibration Error.

    Args:
        probs:  (N, C) predicted probability matrix after softmax.
        labels: (N,)  integer ground-truth class labels.
        n_bins: Number of confidence bins.

    Returns:
        ECE scalar (lower is better; 0 = perfectly calibrated).
    """
    confidences = np.max(probs, axis=1)
    predictions = np.argmax(probs, axis=1)
    accuracies = (predictions == labels).astype(np.float64)

    bin_boundaries = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0

    for lo, hi in zip(bin_boundaries[:-1], bin_boundaries[1:]):
        in_bin = (confidences > lo) & (confidences <= hi)
        prop_in_bin = in_bin.mean()
        if prop_in_bin > 0:
            avg_confidence = confidences[in_bin].mean()
            avg_accuracy = accuracies[in_bin].mean()
            ece += np.abs(avg_accuracy - avg_confidence) * prop_in_bin

    return float(ece)


def compute_reliability_diagram(
    probs: np.ndarray,
    labels: np.ndarray,
    n_bins: int = 15,
) -> dict:
    """
    Returns bin-level accuracy and confidence data for plotting a
    reliability diagram.
    """
    confidences = np.max(probs, axis=1)
    predictions = np.argmax(probs, axis=1)
    accuracies = (predictions == labels).astype(np.float64)

    bin_boundaries = np.linspace(0.0, 1.0, n_bins + 1)
    bin_accs, bin_confs, bin_counts = [], [], []

    for lo, hi in zip(bin_boundaries[:-1], bin_boundaries[1:]):
        in_bin = (confidences > lo) & (confidences <= hi)
        count = int(in_bin.sum())
        bin_counts.append(count)
        if count > 0:
            bin_accs.append(float(accuracies[in_bin].mean()))
            bin_confs.append(float(confidences[in_bin].mean()))
        else:
            bin_accs.append(0.0)
            bin_confs.append((lo + hi) / 2)

    return {
        "bin_edges": bin_boundaries.tolist(),
        "bin_accuracies": bin_accs,
        "bin_confidences": bin_confs,
        "bin_counts": bin_counts,
        "ece": compute_ece(probs, labels, n_bins),
    }


# ──────────────────────────────────────────────────────────────
# Temperature Scaling
# ──────────────────────────────────────────────────────────────

class TemperatureScaler(nn.Module):
    """
    Learns a single temperature parameter T.
    Scaled logits = logits / T  →  softmax(scaled_logits).
    """

    def __init__(self):
        super().__init__()
        # Initialise at T=1.5 (log(1.5) ≈ 0.405) — a reasonable warm start
        self.log_temperature = nn.Parameter(torch.zeros(1))

    @property
    def temperature(self) -> torch.Tensor:
        # Clamp to [0.01, 100] for numerical stability
        return torch.clamp(self.log_temperature.exp(), min=0.01, max=100.0)

    def forward(self, logits: torch.Tensor) -> torch.Tensor:
        return logits / self.temperature


def calibrate_temperature(
    logits: torch.Tensor,
    labels: torch.Tensor,
    lr: float = 0.01,
    max_iter: int = 100,
) -> TemperatureScaler:
    """
    Fit the temperature parameter on a calibration set using NLL loss
    optimised with L-BFGS.

    Args:
        logits: (N, C) raw model logits (before softmax).
        labels: (N,)   integer ground-truth labels.
        lr:     Learning rate for L-BFGS.
        max_iter: Maximum L-BFGS iterations.

    Returns:
        A fitted TemperatureScaler module.
    """
    scaler = TemperatureScaler()
    nll_criterion = nn.CrossEntropyLoss()
    optimizer = LBFGS(scaler.parameters(), lr=lr, max_iter=max_iter)

    logits = logits.detach().float()
    labels = labels.detach().long()

    def closure():
        optimizer.zero_grad()
        scaled = scaler(logits)
        loss = nll_criterion(scaled, labels)
        loss.backward()
        return loss

    optimizer.step(closure)

    return scaler


# ──────────────────────────────────────────────────────────────
# Uncertainty flagging for manual review
# ──────────────────────────────────────────────────────────────

def flag_uncertain_buildings(
    dmg_probs: np.ndarray,
    loc_mask: np.ndarray,
    confidence_threshold: float = 0.6,
) -> np.ndarray:
    """
    Identifies building pixels whose damage confidence is below the
    threshold, flagging them for manual review by human analysts.

    Args:
        dmg_probs:  (H, W, 4) softmax damage probabilities.
        loc_mask:   (H, W) binary building mask.
        confidence_threshold: Pixels below this max-probability are flagged.

    Returns:
        (H, W) boolean mask where True = uncertain, needs manual review.
    """
    max_confidence = np.max(dmg_probs, axis=-1)  # (H, W)
    uncertain = (max_confidence < confidence_threshold) & (loc_mask > 0)
    return uncertain
