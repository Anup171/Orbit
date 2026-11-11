"""
Loss Functions for Localization and Damage Assessment
-----------------------------------------------------
Implements the objective functions detailed in Section 5 of the proposal:
1. Localization Loss: BCEWithLogitsLoss + Soft Dice Loss.
2. Damage Assessment Loss: Weighted Focal Loss + Multi-Class Dice Loss.
   - Specifically handles heavy class imbalance with higher weights on
     rare classes ('minor-damage' and 'major-damage').
   - Ignores background pixels (ignore_index=255).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class DiceLoss(nn.Module):
    """
    Soft Dice loss for binary segmentation.
    """

    def __init__(self, smooth: float = 1.0):
        super().__init__()
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = torch.sigmoid(logits)
        probs_flat = probs.view(-1)
        targets_flat = targets.view(-1)

        intersection = (probs_flat * targets_flat).sum()
        dice = (2.0 * intersection + self.smooth) / (
            probs_flat.sum() + targets_flat.sum() + self.smooth
        )
        return 1.0 - dice


class LocalizationLoss(nn.Module):
    """
    Combined BCE + Dice Loss for building footprint extraction.
    """

    def __init__(self, bce_weight: float = 1.0, dice_weight: float = 1.0):
        super().__init__()
        self.bce = nn.BCEWithLogitsLoss()
        self.dice = DiceLoss()
        self.bce_weight = bce_weight
        self.dice_weight = dice_weight

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        bce_loss = self.bce(logits, targets)
        dice_loss = self.dice(logits, targets)
        return self.bce_weight * bce_loss + self.dice_weight * dice_loss


class FocalLoss(nn.Module):
    """
    Multi-class Focal Loss focusing on hard examples and rare classes.
    """

    def __init__(
        self,
        alpha: torch.Tensor = None,
        gamma: float = 2.0,
        ignore_index: int = 255,
        reduction: str = "mean",
    ):
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.ignore_index = ignore_index
        self.reduction = reduction

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        """
        Args:
            logits: (B, C, H, W) unnormalized scores
            targets: (B, H, W) class indices {0, 1, 2, 3, 255}
        """
        # Mask out ignore_index
        valid_mask = targets != self.ignore_index
        if not valid_mask.any():
            return torch.tensor(0.0, device=logits.device, requires_grad=True)

        logits_valid = logits.permute(0, 2, 3, 1)[valid_mask]  # (N_valid, C)
        targets_valid = targets[valid_mask]                    # (N_valid,)

        log_p = F.log_softmax(logits_valid, dim=-1)
        ce_loss = F.nll_loss(log_p, targets_valid, reduction="none")

        p = torch.exp(-ce_loss)
        focal_term = (1.0 - p) ** self.gamma

        if self.alpha is not None:
            if self.alpha.device != logits.device:
                self.alpha = self.alpha.to(logits.device)
            alpha_t = self.alpha[targets_valid]
            loss = alpha_t * focal_term * ce_loss
        else:
            loss = focal_term * ce_loss

        return loss.mean() if self.reduction == "mean" else loss.sum()


class MultiClassDiceLoss(nn.Module):
    """
    Multi-class Soft Dice Loss ignoring background index.
    """

    def __init__(self, num_classes: int = 4, ignore_index: int = 255, smooth: float = 1.0):
        super().__init__()
        self.num_classes = num_classes
        self.ignore_index = ignore_index
        self.smooth = smooth

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)  # (B, C, H, W)
        valid_mask = (targets != self.ignore_index).unsqueeze(1)  # (B, 1, H, W)

        total_dice = 0.0
        classes_counted = 0

        for c in range(self.num_classes):
            target_c = (targets == c).unsqueeze(1).float()
            prob_c = probs[:, c : c + 1] * valid_mask.float()

            if target_c.sum() == 0 and prob_c.sum() == 0:
                continue

            intersection = (prob_c * target_c).sum()
            dice = (2.0 * intersection + self.smooth) / (
                prob_c.sum() + target_c.sum() + self.smooth
            )
            total_dice += dice
            classes_counted += 1

        if classes_counted == 0:
            return torch.tensor(0.0, device=logits.device, requires_grad=True)

        return 1.0 - (total_dice / classes_counted)


class DamageLoss(nn.Module):
    """
    Combined Focal + Dice Loss for 4-class building damage classification.
    Class weights: higher emphasis on Minor (1) and Major (2) damage.
    """

    def __init__(
        self,
        class_weights: list = [0.1, 0.4, 0.3, 0.2],
        gamma: float = 2.0,
        focal_weight: float = 1.0,
        dice_weight: float = 1.0,
    ):
        super().__init__()
        alpha = torch.tensor(class_weights, dtype=torch.float32)
        self.focal = FocalLoss(alpha=alpha, gamma=gamma, ignore_index=255)
        self.dice = MultiClassDiceLoss(num_classes=4, ignore_index=255)
        self.focal_weight = focal_weight
        self.dice_weight = dice_weight

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        f_loss = self.focal(logits, targets)
        d_loss = self.dice(logits, targets)
        return self.focal_weight * f_loss + self.dice_weight * d_loss

