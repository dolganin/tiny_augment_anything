from torch.utils.data import Dataset
from torchvision.datasets import ImageFolder
from pathlib import Path
from typing import Callable, Any

from tiny_augment.augmentations import AlbumentationsWrapper


class ISICDataset(Dataset):
    """
    Simple ISIC dataset.

    Reads images and labels from root path and optionally does augmentations.

    Parameters
    ----------
    root : str | Path
        Path where data is stored.

    transforms : Callable[..., dict[str, Any]], default=None
        Albumentations transform pipeline.
    """

    def __init__(
        self, root: str | Path, transform: Callable[..., dict[str, Any]] | None = None
    ) -> None:

        tfms = None
        if transform is not None:
            tfms = AlbumentationsWrapper(transform)

        self.dataset = ImageFolder(root=root, transform=tfms)

    def __getitem__(self, idx: int) -> tuple:
        img, label = self.dataset[idx]
        return img, label

    def __len__(self) -> int:
        return len(self.dataset)

    @property
    def samples(self) -> list[tuple[str, int]]:
        return self.dataset.samples

    @property
    def labels(self) -> list[int]:
        return self.dataset.targets
