import timm
import torch

from torch import nn


class ISICClassifier(nn.Module):
    """
    Image classification model based on a timm backbone.

    Parameters
    ----------
    backbone : str
        Name of the timm model architecture.
    num_classes : int
        Number of output classes.
    pretrained : bool, default=True
        Whether to load pretrained weights.
    drop_rate : float, default=0.0
        Dropout rate.
    drop_path_rate : float, default=0.0
        Stochastic depth rate.
    checkpoint_path : str | None
        Optional path to model weights.
    """

    def __init__(
        self,
        backbone: str,
        num_classes: int = 1,
        pretrained: bool = True,
        drop_rate: float = 0.0,
        drop_path_rate: float = 0.0,
        checkpoint_path: str | None = None,
    ):
        super().__init__()

        self.model = timm.create_model(
            backbone,
            pretrained=pretrained,
            drop_rate=drop_rate,
            drop_path_rate=drop_path_rate,
            checkpoint_path=checkpoint_path,
        )

        in_features = self.model.head.in_features
        self.model.head = nn.Linear(in_features, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Parameters
        ----------
        x : torch.Tensor
            Input images tensor (B, C, H, W).

        Returns
        -------
        torch.Tensor
            Raw logits of shape (B, num_classes).
        """
        return self.model(x)


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