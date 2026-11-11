"""
Data Augmentations Module
-------------------------
Implements data augmentation according to Section 4 of the proposal:
1. Spatial transforms (flips, 90-degree rotations, shifts) are applied jointly to
   both pre- and post-disaster images and all ground-truth masks.
2. Radiometric/photometric transforms (random brightness, contrast, blur, noise)
   are applied independently to pre- and post-disaster images so the model learns
   true physical damage rather than lighting/sensor variations.
"""

import random
from typing import Dict, Tuple, Any

import cv2
import numpy as np
import albumentations as A


class DualDisasterAugmentation:
    """
    Applies joint geometric and independent radiometric transformations to pre/post image pairs.
    """

    def __init__(self, is_train: bool = True, img_size: int = 512):
        self.is_train = is_train
        self.img_size = img_size

        if is_train:
            # Joint geometric pipeline
            self.geometric_transform = A.Compose(
                [
                    A.HorizontalFlip(p=0.5),
                    A.VerticalFlip(p=0.5),
                    A.RandomRotate90(p=0.5),
                    A.ShiftScaleRotate(
                        shift_limit=0.0625,
                        scale_limit=0.1,
                        rotate_limit=15,
                        border_mode=cv2.BORDER_REFLECT,
                        p=0.5,
                    ),
                ],
                additional_targets={
                    "image_post": "image",
                    "mask_damage": "mask",
                },
            )

            # Independent photometric pipeline for pre-disaster
            self.pre_radiometric = A.Compose(
                [
                    A.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, p=0.4),
                    A.GaussianBlur(blur_limit=(3, 5), p=0.2),
                ]
            )

            # Independent photometric pipeline for post-disaster
            self.post_radiometric = A.Compose(
                [
                    A.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.15, p=0.4),
                    A.GaussianBlur(blur_limit=(3, 5), p=0.2),
                ]
            )
        else:
            self.geometric_transform = None
            self.pre_radiometric = None
            self.post_radiometric = None

        # ImageNet normalization standard
        self.normalize = A.Normalize(
            mean=(0.485, 0.456, 0.406),
            std=(0.229, 0.224, 0.225),
        )

    def __call__(
        self,
        pre_img: np.ndarray,
        post_img: np.ndarray,
        loc_mask: np.ndarray,
        dmg_mask: np.ndarray,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """
        Executes the augmentation pipeline.
        Returns:
            pre_tensor: (H, W, 3) normalized float32
            post_tensor: (H, W, 3) normalized float32
            loc_mask: (H, W) uint8 {0, 1}
            dmg_mask: (H, W) int64 {0, 1, 2, 3, 255}
        """
        if self.is_train and self.geometric_transform is not None:
            # 1. Joint geometric transformation
            augmented = self.geometric_transform(
                image=pre_img,
                image_post=post_img,
                mask=loc_mask,
                mask_damage=dmg_mask,
            )
            pre_img = augmented["image"]
            post_img = augmented["image_post"]
            loc_mask = augmented["mask"]
            dmg_mask = augmented["mask_damage"]

            # 2. Independent radiometric transformations
            pre_img = self.pre_radiometric(image=pre_img)["image"]
            post_img = self.post_radiometric(image=post_img)["image"]

        # 3. Normalization
        pre_norm = self.normalize(image=pre_img)["image"]
        post_norm = self.normalize(image=post_img)["image"]

        return pre_norm, post_norm, loc_mask, dmg_mask

