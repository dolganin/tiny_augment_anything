from torch import nn
from typing import Literal

from .base_classifier import ISICClassifier
from tiny_augment.utils import get_device


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
    """
    Factory function for creating an ISIC classification model.

    Parameters
    ----------
    backbone : str
        Name of the timm model.

    num_classes : int, default=1
        Number of output classes.

    pretrained : bool, default=True
        Load pretrained weights.

    drop_rate : float
        Dropout probability.

    drop_path_rate : float
        Stochastic depth probability.

    finetune_mode: {"all", "partial", "head"}, default=head
        Strategy for fine-tuning.

    trainable_prefixes : list[str] | None, default=None
        Prefixes of parameter names to keep trainable when finetune_mode is "partial".

    device_type: str, default=cpu
        The device type on which to run the model (e.g., 'cuda' or 'cpu').

    Returns
    -------
    nn.Module
        Model moved to the specified device.
    """

    device = get_device(device_type)

    model = ISICClassifier(
        backbone=backbone,
        num_classes=num_classes,
        pretrained=pretrained,
        drop_rate=drop_rate,
        drop_path_rate=drop_path_rate,
        finetune_mode=finetune_mode,
        trainable_prefixes=trainable_prefixes,
    )

    return model.to(device)
