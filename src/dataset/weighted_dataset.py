from torch.utils.data import Dataset

from .base_dataset import ISICDataset


class WeightedDataset(Dataset):
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
