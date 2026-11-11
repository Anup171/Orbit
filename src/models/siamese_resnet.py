"""
Siamese ResNet-34 Architecture
------------------------------
Implements the proposed single-pass model (Section 5):
1. Shared ResNet-34 Encoder:
   - Processes both pre- and post-disaster images simultaneously.
   - Outputs multi-scale feature maps at 5 hierarchical scales:
     f0 (stride 2), f1 (stride 4), f2 (stride 8), f3 (stride 16), f4 (stride 32).
2. Multi-Branch Fusion:
   - Combines pre and post features via: [pre, post, |pre - post|, pre * post]
3. Localization Decoder:
   - Uses ONLY pre-disaster features to accurately outline building footprints.
4. Damage Decoder:
   - Uses multi-scale fused features to predict 4 damage logits.
   - Output damage maps are masked by predicted building footprints.
"""

from typing import Dict, List, Tuple
import torch
import torch.nn as nn
import torchvision.models as models

from src.models.fusion import FeatureFusionBlock
from src.models.decoders import LocalizationDecoder, DamageDecoder


class SiameseResNet34(nn.Module):
    """
    Siamese ResNet-34 for simultaneous localization and 4-class disaster damage assessment.
    """

    def __init__(
        self,
        pretrained: bool = True,
        fusion_mode: str = "concat_diff_prod",
        num_damage_classes: int = 4,
    ):
        super().__init__()
        self.fusion_mode = fusion_mode
        self.num_damage_classes = num_damage_classes

        # 1. Shared Encoder (ResNet-34)
        weights = models.ResNet34_Weights.DEFAULT if pretrained else None
        resnet = models.resnet34(weights=weights)

        # Stage 0: Conv1 + BN + ReLU (stride 2, 64 ch)
        self.encoder_conv1 = nn.Sequential(
            resnet.conv1,
            resnet.bn1,
            resnet.relu,
        )
        # Stage 1: MaxPool + Layer1 (stride 4, 64 ch)
        self.encoder_maxpool = resnet.maxpool
        self.encoder_layer1 = resnet.layer1
        # Stage 2: Layer2 (stride 8, 128 ch)
        self.encoder_layer2 = resnet.layer2
        # Stage 3: Layer3 (stride 16, 256 ch)
        self.encoder_layer3 = resnet.layer3
        # Stage 4: Layer4 (stride 32, 512 ch)
        self.encoder_layer4 = resnet.layer4

        encoder_channels = [64, 64, 128, 256, 512]

        # 2. Multi-Scale Feature Fusion Blocks
        self.fusion_blocks = nn.ModuleList([
            FeatureFusionBlock(in_channels=c, out_channels=c, mode=fusion_mode)
            for c in encoder_channels
        ])

        # 3. Decoders
        self.loc_decoder = LocalizationDecoder(encoder_channels=encoder_channels)
        self.dmg_decoder = DamageDecoder(fused_channels=encoder_channels, num_classes=num_damage_classes)

    def extract_features(self, x: torch.Tensor) -> List[torch.Tensor]:
        """
        Extracts multi-scale features from a single satellite image.
        """
        f0 = self.encoder_conv1(x)                               # stride 2,  64 ch
        f1 = self.encoder_layer1(self.encoder_maxpool(f0))       # stride 4,  64 ch
        f2 = self.encoder_layer2(f1)                             # stride 8,  128 ch
        f3 = self.encoder_layer3(f2)                             # stride 16, 256 ch
        f4 = self.encoder_layer4(f3)                             # stride 32, 512 ch
        return [f0, f1, f2, f3, f4]

    def forward(
        self,
        pre_img: torch.Tensor,
        post_img: torch.Tensor
    ) -> Dict[str, torch.Tensor]:
        """
        Args:
            pre_img: (B, 3, H, W) pre-disaster RGB tensor
            post_img: (B, 3, H, W) post-disaster RGB tensor
        Returns:
            Dictionary containing:
              - 'loc_logits': (B, 1, H, W) raw logits for building localization
              - 'dmg_logits': (B, 4, H, W) raw logits for 4-class damage assessment
              - 'masked_dmg_logits': (B, 4, H, W) damage logits masked inside detected footprints
        """
        # 1. Siamese feature extraction
        pre_features = self.extract_features(pre_img)
        post_features = self.extract_features(post_img)

        # 2. Localization prediction (uses purely pre-disaster features)
        loc_logits = self.loc_decoder(pre_features)

        # 3. Multi-scale feature fusion
        fused_features = []
        for f_pre, f_post, fusion_block in zip(pre_features, post_features, self.fusion_blocks):
            fused = fusion_block(f_pre, f_post)
            fused_features.append(fused)

        # 4. Damage prediction
        dmg_logits = self.dmg_decoder(fused_features)

        # 5. Mask damage by localization footprint (sigmoid > 0.5)
        with torch.no_grad():
            loc_prob = torch.sigmoid(loc_logits)
            building_mask = (loc_prob > 0.5).float()  # (B, 1, H, W)

        masked_dmg_logits = dmg_logits * building_mask

        return {
            "loc_logits": loc_logits,
            "dmg_logits": dmg_logits,
            "masked_dmg_logits": masked_dmg_logits,
        }

