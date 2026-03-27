import torch

from torch.utils.data import WeightedRandomSampler

from .weighted_dataset import WeightedDataset
from .base_dataset import ISICDataset


def make_balanced_sampler(dataset: ISICDataset) -> WeightedRandomSampler:
    """
    Creates a WeightedRandomSampler to balance classes in a dataset.

    Parameters
    ----------
    dataset : tiny_augment.dataset.ISICDataset
        Dataset where images are stored with labels.

    Returns
    -------
    torch.utils.data.WeightedRandomSampler
        Sampler that can be passed to a DataLoader to perform balanced sampling,
        giving equal probability to each class regardless of its frequency.
    """

    targets = torch.tensor(dataset.targets, dtype=torch.long)

    class_counts = torch.bincount(targets)
    class_weights = 1.0 / class_counts.float()
    sample_weights = class_weights[targets].tolist()

    sampler = WeightedRandomSampler(
        weights=sample_weights,
        num_samples=len(sample_weights),
        replacement=True,
    )

    return sampler


def make_weighted_sampler(dataset: WeightedDataset) -> WeightedRandomSampler:
    """
    Creates a WeightedRandomSampler based on sample-specific weights.

    Parameters
    ----------
    dataset : tiny_augment.dataset.WeightedDataset
        The same as torch.utils.data.Dataset, but also stores weights of each sample.

    Returns
    -------
    torch.utils.data.WeightedRandomSampler
        Sampler that can be used in a DataLoader to sample rows according to the given weights.
    """

    sampler = WeightedRandomSampler(
        weights=dataset.get_weights(),
        num_samples=len(dataset),
        replacement=True,
    )

    return sampler
