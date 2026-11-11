"""
Feature Fusion Module
---------------------
Combines feature representations from pre- and post-disaster satellite imagery.
Supports multiple fusion techniques for the ablation study (Section 5):
  1. 'concat': Concatenation [feat_pre, feat_post]
  2. 'diff': Absolute difference |feat_pre - feat_post|
  3. 'prod': Element-wise product (feat_pre * feat_post)
  4. 'concat_diff_prod': Full multi-branch fusion combining all three
"""

import torch
import torch.nn as nn


class FeatureFusionBlock(nn.Module):
    """
    Fuses pre- and post-disaster features at a given encoder scale.
    """

    def __init__(self, in_channels: int, out_channels: int, mode: str = "concat_diff_prod"):
        super().__init__()
        self.mode = mode

        if mode == "concat":
            fused_in_channels = in_channels * 2
        elif mode in ["diff", "prod"]:
            fused_in_channels = in_channels
        elif mode == "concat_diff_prod":
            # [pre, post, |pre - post|, pre * post]
            fused_in_channels = in_channels * 4
        else:
            raise ValueError(f"Unsupported fusion mode: {mode}")

        self.conv = nn.Sequential(
            nn.Conv2d(fused_in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, feat_pre: torch.Tensor, feat_post: torch.Tensor) -> torch.Tensor:
        if self.mode == "concat":
            fused = torch.cat([feat_pre, feat_post], dim=1)
        elif self.mode == "diff":
            fused = torch.abs(feat_pre - feat_post)
        elif self.mode == "prod":
            fused = feat_pre * feat_post
        elif self.mode == "concat_diff_prod":
            diff = torch.abs(feat_pre - feat_post)
            prod = feat_pre * feat_post
            fused = torch.cat([feat_pre, feat_post, diff, prod], dim=1)
        else:
            raise ValueError(f"Unknown fusion mode: {self.mode}")

        return self.conv(fused)

