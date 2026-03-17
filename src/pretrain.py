import hydra

from omegaconf import DictConfig

from dataset import build_dataloaders
from models import build_model
from augmentations import get_augmentations


@hydra.main(config_path="../configs", config_name="pretrain")
def pretrain(cfg: DictConfig):

    transforms = get_augmentations()
    build_dataloaders(transforms=transforms)
    build_model()


if __name__ == "__main__":
    pretrain()
