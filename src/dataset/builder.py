from torch.utils.data import DataLoader

from .dataset import ISICDataset
from .sampler import make_balanced_sampler, make_weighted_sampler

def build_dataloaders(
    df_train,
    df_valid,
    transforms,
    train_batch_size=32,
    valid_batch_size=32,
    sampler_type=None,
    num_workers=8,
):
    """
    Build dataloaders for ISIC classification.

    Parameters
    ----------
    df_train : pandas.DataFrame
        Training metadata.

    df_valid : pandas.DataFrame
        Validation metadata.

    transforms : dict
        Dict with keys:

        - "train"
        - "valid"

    sampler_type : str | None

        Sampling strategy:

        - None: normal sampling
        - "balanced": class balanced sampling
        - "weighted": use df_train["weight"]

    Returns
    -------
    tuple
        (train_loader, valid_loader)
    """

    train_dataset = ISICDataset(df_train, transforms["train"])
    valid_dataset = ISICDataset(df_valid, transforms["valid"])

    sampler = None

    if sampler_type == "balanced":
        sampler = make_balanced_sampler(df_train["target"].values)

    if sampler_type == "weighted":
        sampler = make_weighted_sampler(df_train)

    train_loader = DataLoader(
        train_dataset,
        batch_size=train_batch_size,
        sampler=sampler,
        shuffle=sampler is None,
        num_workers=num_workers,
        pin_memory=True,
        drop_last=True,
    )

    valid_loader = DataLoader(
        valid_dataset,
        batch_size=valid_batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
    )

    return train_loader, valid_loader