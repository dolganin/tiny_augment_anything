import hydra

from omegaconf import DictConfig


@hydra.main(config_path="../configs", config_name="fine_tune")
def fine_tune(cfg: DictConfig) -> None:
    pass


if __name__ == "__main__":
    fine_tune()
