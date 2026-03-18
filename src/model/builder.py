from torch import nn

from .base_classifier import ISICClassifier


def build_model(
    backbone: str,
    num_classes: int = 1,
    device: str = "cuda",
    pretrained: bool = True,
    drop_rate: float = 0.0,
    drop_path_rate: float = 0.0,
    checkpoint_path: str | None = None,
) -> nn.Module:
    """
    Factory function for creating an ISIC classification model.

    Parameters
    ----------
    backbone : str
        Name of the timm architecture.
    num_classes : int, default=1
        Number of output classes.
    device : str, default="cuda"
        Device to move the model to.
    pretrained : bool, default=True
        Load pretrained ImageNet weights.
    drop_rate : float
        Dropout probability.
    drop_path_rate : float
        Stochastic depth probability.
    checkpoint_path : str | None
        Optional path to custom checkpoint.

    Returns
    -------
    nn.Module
        Model moved to the specified device.
    """

    model = ISICClassifier(
        backbone=backbone,
        num_classes=num_classes,
        pretrained=pretrained,
        drop_rate=drop_rate,
        drop_path_rate=drop_path_rate,
        checkpoint_path=checkpoint_path,
    )

    return model.to(device)
