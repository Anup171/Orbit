"""
PyTorch Dataset & Balanced Sampler Module
-----------------------------------------
Loads 512x512 preprocessed image pairs and masks.
Includes a DamageAwareSampler to oversample rare classes ('minor-damage' and 'major-damage')
as specified in Section 4 of the proposal.
"""

import os
import json
from typing import List, Dict, Any, Optional

import cv2
import torch
from torch.utils.data import Dataset, Sampler
import numpy as np

from src.data.augmentations import DualDisasterAugmentation


class xBDDataset(Dataset):
    """
    PyTorch Dataset loading preprocessed 512x512 xBD patches.
    """

    def __init__(
        self,
        index_json_path: str,
        is_train: bool = True,
        filter_empty: bool = False,
    ):
        """
        Args:
            index_json_path: Path to the generated tiles JSON index (e.g. data/processed/val_tiles.json)
            is_train: If True, enables data augmentations.
            filter_empty: If True, discards patches that contain zero buildings.
        """
        with open(index_json_path, "r") as f:
            self.records = json.load(f)

        if filter_empty:
            self.records = [r for r in self.records if r.get("has_buildings", 0) == 1]

        self.augmentor = DualDisasterAugmentation(is_train=is_train)

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        rec = self.records[idx]

        # Read images in RGB
        pre_bgr = cv2.imread(rec["pre_img"])
        post_bgr = cv2.imread(rec["post_img"])
        pre_rgb = cv2.cvtColor(pre_bgr, cv2.COLOR_BGR2RGB)
        post_rgb = cv2.cvtColor(post_bgr, cv2.COLOR_BGR2RGB)

        # Read masks
        loc_mask = cv2.imread(rec["loc_mask"], cv2.IMREAD_GRAYSCALE)
        dmg_mask = cv2.imread(rec["dmg_mask"], cv2.IMREAD_GRAYSCALE)

        # Apply dual augmentations
        pre_aug, post_aug, loc_aug, dmg_aug = self.augmentor(
            pre_rgb, post_rgb, loc_mask, dmg_mask
        )

        # Convert to PyTorch tensors (C, H, W)
        pre_tensor = torch.from_numpy(pre_aug).permute(2, 0, 1).float()
        post_tensor = torch.from_numpy(post_aug).permute(2, 0, 1).float()
        loc_tensor = torch.from_numpy(loc_aug).float().unsqueeze(0)  # (1, H, W)
        dmg_tensor = torch.from_numpy(dmg_aug).long()                 # (H, W)

        return {
            "pre": pre_tensor,
            "post": post_tensor,
            "loc": loc_tensor,
            "dmg": dmg_tensor,
            "tile_prefix": rec["tile_prefix"],
            "disaster": rec.get("disaster", "unknown"),
        }


class DamageAwareSampler(Sampler):
    """
    Weighted sampler that gives higher sampling probability to tiles containing
    the rare damage classes (1: minor-damage, 2: major-damage).
    """

    def __init__(
        self,
        records: List[Dict[str, Any]],
        minor_weight: float = 3.0,
        major_weight: float = 2.5,
        destroyed_weight: float = 1.5,
        no_damage_weight: float = 1.0,
        empty_weight: float = 0.2,
    ):
        self.weights = []
        for rec in records:
            if not rec.get("has_buildings", 0):
                self.weights.append(empty_weight)
                continue

            classes = rec.get("damage_classes_present", [])
            w = no_damage_weight
            if 1 in classes:  # Minor damage
                w = max(w, minor_weight)
            if 2 in classes:  # Major damage
                w = max(w, major_weight)
            if 3 in classes:  # Destroyed
                w = max(w, destroyed_weight)
            self.weights.append(w)

        self.weights = torch.DoubleTensor(self.weights)
        self.num_samples = len(records)

    def __iter__(self):
        return iter(torch.multinomial(self.weights, self.num_samples, replacement=True).tolist())

    def __len__(self) -> int:
        return self.num_samples

