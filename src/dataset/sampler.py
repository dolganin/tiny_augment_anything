import torch

from torch.utils.data import WeightedRandomSampler


def make_balanced_sampler(targets):
    """
    Creates a WeightedRandomSampler to balance classes in a dataset.

    Parameters
    ----------
    targets : list or torch.Tensor
        List or tensor of integer class labels for each sample in the dataset.

    Returns
    -------
    torch.utils.data.WeightedRandomSampler
        Sampler that can be passed to a DataLoader to perform balanced sampling,
        giving equal probability to each class regardless of its frequency.
    """

    class_counts = torch.bincount(torch.tensor(targets))

    class_weights = 1.0 / class_counts.float()

    sample_weights = class_weights[targets]

    sampler = WeightedRandomSampler(
        weights=sample_weights,  # type: ignore
        num_samples=len(sample_weights),
        replacement=True,
    )

    return sampler


def make_weighted_sampler(df):
    """
    Creates a WeightedRandomSampler based on sample-specific weights.

    Parameters
    ----------
    df : pandas.DataFrame
        DataFrame containing a "weight" column specifying the sampling weight for each row.

    Returns
    -------
    torch.utils.data.WeightedRandomSampler
        Sampler that can be used in a DataLoader to sample rows according to the given weights.
    """

    weights = torch.tensor(df["weight"].values).float()

    sampler = WeightedRandomSampler(
        weights=weights,  # type: ignore
        num_samples=len(weights),
        replacement=True,
    )

    return sampler
