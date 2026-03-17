from dataset import build_dataloaders
from models import build_model
from augmentations import get_augmentations


def pretrain() -> None:

    transforms = get_augmentations()
    build_dataloaders(transforms=transforms)
    build_model()


if __name__ == "__main__":
    pretrain()
