from torch.utils.data import Dataset

from .base_dataset import ISICDataset


class WeightedDataset(Dataset):
    """
    A wrapper around an ISICDataset that attaches sample-specific weights.

    This dataset can be used with `torch.utils.data.WeightedRandomSampler`
    to perform weighted sampling for imbalanced datasets.

    Parameters
    ----------
    base_dataset : ISICDataset
        The underlying dataset containing images and labels.

    weights : list[float]
        A list of per-sample weights, aligned with the order of `base_dataset`.

    Notes
    -----
    The dataset itself behaves identically to the base_dataset, but provides
    a `get_weights()` method that returns the sample weights.
    """

    def __init__(self, base_dataset: ISICDataset, weights: list[float]) -> None:
        self.base_dataset = base_dataset
        self.weights = weights

    def __getitem__(self, idx: int) -> tuple:
        img, label = self.base_dataset[idx]
        return img, label

    def __len__(self) -> int:
        return len(self.base_dataset)

    def get_weights(self) -> list[float]:
        return self.weights
