from torch.utils.data import Dataset
from torchvision.datasets import ImageFolder
from pathlib import Path
from typing import Callable


class ISICDataset(Dataset):
    """
    Simple ISIC dataset.

    Reads images and labels from root path and optionally does augmentations.

    Parameters
    ----------
    root : str | Path
        Path where data is stored.

    transforms : Callable, default=None
        Albumentations transform pipeline.
    """

    def __init__(self, root: str | Path, transform: Callable | None = None) -> None:
        self.dataset = ImageFolder(root=root, transform=transform)

    def __getitem__(self, idx: int) -> tuple:
        img, label = self.dataset[idx]
        return img, label

    def __len__(self) -> int:
        return len(self.dataset)

    @property
    def samples(self) -> list[tuple[str, int]]:
        return self.dataset.samples
