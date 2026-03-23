from __future__ import annotations

from typing import Literal

import timm
import torch

from torch import nn

from tiny_augment.utils import get_device


class CascadeHeadClassifier(nn.Module):
    def __init__(
        self,
        backbone: str,
        num_classes: int = 1,
        pretrained: bool = True,
        drop_rate: float = 0.0,
        drop_path_rate: float = 0.0,
        finetune_mode: Literal["all", "partial", "head"] = "head",
        trainable_prefixes: list[str] | None = None,
    ) -> None:
        super().__init__()
        self.finetune_mode = finetune_mode
        self.model = timm.create_model(
            model_name=backbone,
            pretrained=pretrained,
            drop_rate=drop_rate,
            num_classes=0,
            drop_path_rate=drop_path_rate,
        )
        in_features = int(getattr(self.model, "num_features"))
        self.head = nn.Sequential(
            nn.Linear(in_features, 512),
            nn.ReLU(inplace=True),
            nn.Linear(512, 256),
            nn.ReLU(inplace=True),
            nn.Linear(256, num_classes),
        )
        self._apply_finetune_strategy(trainable_prefixes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        features = self.model(x)
        if features.ndim > 2:
            features = torch.flatten(features, 1)
        return self.head(features)

    def _apply_finetune_strategy(self, trainable_prefixes: list[str] | None) -> None:
        if self.finetune_mode == "all":
            return

        for param in self.model.parameters():
            param.requires_grad = False
        for param in self.head.parameters():
            param.requires_grad = False

        if self.finetune_mode == "head":
            for param in self.head.parameters():
                param.requires_grad = True
            return

        if self.finetune_mode != "partial":
            raise ValueError(f"Unrecognized finetune strategy: {self.finetune_mode}")
        if not trainable_prefixes:
            raise ValueError("Partial finetune mode requires layer names.")

        for name, param in self.named_parameters():
            if any(prefix in name for prefix in trainable_prefixes):
                param.requires_grad = True


def build_model(
    backbone: str,
    num_classes: int = 1,
    pretrained: bool = True,
    drop_rate: float = 0.0,
    drop_path_rate: float = 0.0,
    finetune_mode: Literal["all", "partial", "head"] = "head",
    trainable_prefixes: list[str] | None = None,
    device_type: str = "cpu",
) -> nn.Module:
    device = get_device(device_type)
    model = CascadeHeadClassifier(
        backbone=backbone,
        num_classes=num_classes,
        pretrained=pretrained,
        drop_rate=drop_rate,
        drop_path_rate=drop_path_rate,
        finetune_mode=finetune_mode,
        trainable_prefixes=trainable_prefixes,
    )
    return model.to(device)
