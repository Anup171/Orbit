"""
Decoders Module
---------------
Implements the dual-task decoders (Section 5):
1. LocalizationDecoder:
   - Uses ONLY pre-disaster features to delineate building footprints.
   - Prevents rubble, dust, and destroyed roofs from obscuring building boundaries.
2. DamageDecoder:
   - Takes multi-scale fused features and predicts 4 damage classes.
   - Final damage prediction is strictly masked inside detected footprints.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List


class DecoderBlock(nn.Module):
    """
    Standard U-Net-style decoder block with skip connections.
    """

    def __init__(self, in_channels: int, skip_channels: int, out_channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels + skip_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)

    def forward(self, x: torch.Tensor, skip: torch.Tensor = None) -> torch.Tensor:
        # Bilinear upsampling to match skip dimensions
        if skip is not None:
            x = F.interpolate(x, size=skip.shape[2:], mode="bilinear", align_corners=False)
            x = torch.cat([x, skip], dim=1)
        else:
            x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=False)

        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        return x


class LocalizationDecoder(nn.Module):
    """
    Decoder predicting binary building footprint masks from pre-disaster features.
    Channels assume standard ResNet-34: [64, 64, 128, 256, 512].
    """

    def __init__(self, encoder_channels: List[int] = [64, 64, 128, 256, 512]):
        super().__init__()
        c0, c1, c2, c3, c4 = encoder_channels

        self.block4 = DecoderBlock(in_channels=c4, skip_channels=c3, out_channels=256)
        self.block3 = DecoderBlock(in_channels=256, skip_channels=c2, out_channels=128)
        self.block2 = DecoderBlock(in_channels=128, skip_channels=c1, out_channels=64)
        self.block1 = DecoderBlock(in_channels=64, skip_channels=c0, out_channels=32)

        self.head = nn.Sequential(
            nn.Conv2d(32, 16, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(16, 1, kernel_size=1),  # Output logits: (B, 1, H, W)
        )

    def forward(self, features: List[torch.Tensor]) -> torch.Tensor:
        f0, f1, f2, f3, f4 = features
        x = self.block4(f4, f3)
        x = self.block3(x, f2)
        x = self.block2(x, f1)
        x = self.block1(x, f0)
        # Final upsample to original resolution (from 1/2 stride of stem)
        x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=False)
        return self.head(x)


class DamageDecoder(nn.Module):
    """
    Decoder predicting 4-class damage logits from fused features.
    """

    def __init__(
        self,
        fused_channels: List[int] = [64, 64, 128, 256, 512],
        num_classes: int = 4
    ):
        super().__init__()
        c0, c1, c2, c3, c4 = fused_channels

        self.block4 = DecoderBlock(in_channels=c4, skip_channels=c3, out_channels=256)
        self.block3 = DecoderBlock(in_channels=256, skip_channels=c2, out_channels=128)
        self.block2 = DecoderBlock(in_channels=128, skip_channels=c1, out_channels=64)
        self.block1 = DecoderBlock(in_channels=64, skip_channels=c0, out_channels=32)

        self.head = nn.Sequential(
            nn.Conv2d(32, 16, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(16, num_classes, kernel_size=1),  # Output logits: (B, 4, H, W)
        )

    def forward(self, fused_features: List[torch.Tensor]) -> torch.Tensor:
        f0, f1, f2, f3, f4 = fused_features
        x = self.block4(f4, f3)
        x = self.block3(x, f2)
        x = self.block2(x, f1)
        x = self.block1(x, f0)
        x = F.interpolate(x, scale_factor=2, mode="bilinear", align_corners=False)
        return self.head(x)

