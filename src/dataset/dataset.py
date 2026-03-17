import cv2
import torch

from torch.utils.data import Dataset


class ISICDataset(Dataset):
    """
    Simple ISIC dataset.

    Reads images from paths stored in a pandas DataFrame.

    Parameters
    ----------
    meta_df : pandas.DataFrame
        Must contain columns:

        - path : str
        - target : int

    transforms : callable, optional
        Albumentations transform pipeline.
    """

    def __init__(self, meta_df, transforms=None):
        self.paths = meta_df["path"].values
        self.targets = meta_df["target"].values
        self.transforms = transforms

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, idx):

        img = cv2.imread(self.paths[idx])
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        if self.transforms:
            img = self.transforms(image=img)["image"]

        target = torch.tensor(self.targets[idx]).long()

        return img, target