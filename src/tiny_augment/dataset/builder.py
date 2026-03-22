import pandas as pd

from torch.utils.data import DataLoader
from pathlib import Path
from typing import Literal, Mapping, Callable

from .base_dataset import ISICDataset
from .weighted_dataset import WeightedDataset
from .sampler import make_balanced_sampler, make_weighted_sampler


def _load_weights(dataset: ISICDataset, weights_root: str | Path) -> list[float]:
    df = pd.read_csv(weights_root)

    weight_map = dict(zip(df["path"], df["weight"]))

    weights = [weight_map[path] for path, _ in dataset.samples]
    return weights


def build_dataloaders(
    train_root: str | Path,
    val_root: str | Path,
    transforms: Mapping[str, Callable],
    train_batch_size: int = 32,
    val_batch_size: int = 64,
    prefetch_factor: int = 2,
    sampler_type: Literal["balanced", "weighted"] | None = None,
    num_workers: int = 8,
    weights_root: str | Path | None = None,
) -> tuple[DataLoader, DataLoader]:
    """
    Build PyTorch dataloaders for an image classification task using a
    directory-based dataset structure.

    The dataset is expected to follow a standard layout:

        train_root/
            class_0/
            class_1/
            ...
        val_root/
            class_0/
            class_1/
            ...

    Parameters
    ----------
    train_root : str | Path
        Path to the training dataset directory.

    val_root : str | Path
        Path to the validation dataset directory.

    transforms : Mapping[str, Callable]
        Dictionary containing transformation pipelines with keys:
        - "train": transformations applied to training images
        - "valid": transformations applied to validation images

        Each value should be a callable (e.g., Albumentations pipeline).

    train_batch_size : int, default=32
        Batch size for the training dataloader.

    val_batch_size : int, default=64
        Batch size for the validation dataloader.

    prefetch_factor : int, default=2
        Number of batch loaded by each worker.

    sampler_type : {"balanced", "weighted"} | None, default=None
        Sampling strategy for the training dataloader:
        - None: standard random shuffling
        - "balanced": class-balanced sampling based on label frequencies
        - "weighted": sample-wise weighting (requires weights_root)

    num_workers : int, default=8
        Number of subprocesses used for data loading.

    weights_root : str | Path | None, default=None
        Path to a file or directory containing precomputed sample weights.
        Required when `sampler_type="weighted"`.

    Returns
    -------
    tuple[torch.utils.data.DataLoader, torch.utils.data.DataLoader]
        A tuple containing:
        - train_loader : DataLoader
        - valid_loader : DataLoader
    """

    train_dataset = ISICDataset(train_root, transforms["train"])
    valid_dataset = ISICDataset(val_root, transforms["val"])

    sampler = None
    if sampler_type == "balanced":
        sampler = make_balanced_sampler(train_dataset)
    elif sampler_type == "weighted" and weights_root is not None:
        weights = _load_weights(train_dataset, weights_root)
        weighted_dataset = WeightedDataset(train_dataset, weights)
        sampler = make_weighted_sampler(weighted_dataset)

    train_loader = DataLoader(
        train_dataset,
        batch_size=train_batch_size,
        sampler=sampler,
        shuffle=sampler is None,
        num_workers=num_workers,
        pin_memory=True,
        drop_last=True,
        persistent_workers=True,
        prefetch_factor=prefetch_factor,
    )

    valid_loader = DataLoader(
        valid_dataset,
        batch_size=val_batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
        persistent_workers=True,
        prefetch_factor=prefetch_factor,
    )

    return train_loader, valid_loader
