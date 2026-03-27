import torch

from typing import Literal

from tiny_augment.criterion.loss import FocalLoss


def build_criterion(
    name: Literal["cross_entropy", "focal_loss", "weighted_ce"] = "cross_entropy",
    weights: list[float] | None = None,
    gamma: float = 0.2,
) -> torch.nn.Module:
    """
    This factory function creates a criterion based on the provided name.

    Parameters
    ----------
    name : {"cross_entropy", "focal_loss", "weighted_ce"}, default=cross_entropy
        Name of the loss function to construct.

    weights : list[float] | None, default=None
        Class weights used to address class imbalance.

    gamma : float, default=0.2
        Focusing parameter used in focal loss. Higher values increase the
        down-weighting of easy examples and focus training on harder samples.

    Returns
    -------
    torch.nn.Module
        Instantiated loss function ready to be used during training.

    Raises
    ------
    ValueError
        If "focal_loss" is selected but `weights` is None.
    """

    if name == "weighted_ce":
        w_t = torch.tensor(weights) if weights is not None else None
        return torch.nn.CrossEntropyLoss(weight=w_t)

    elif name == "cross_entropy":
        return torch.nn.CrossEntropyLoss()

    elif name == "focal_loss":
        if weights is None:
            raise ValueError("Focal loss requires not none weights.")

        return FocalLoss(alpha=weights, gamma=gamma)

    assert False, "Not Reachable"
