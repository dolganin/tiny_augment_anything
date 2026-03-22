import hydra
import mlflow
import os

from omegaconf import DictConfig
from pathlib import Path

from tiny_augment.train import Trainer
from tiny_augment.utils import log_config, extract_mlflow_kwargs, get_device


mlflow.set_tracking_uri(
    os.getenv("MLFLOW_TRACKING_URI", f"file:{(Path.cwd() / 'mlruns').resolve()}")
)


@hydra.main(version_base="1.3", config_path="../configs", config_name="pretrain")
def pretrain(cfg: DictConfig) -> None:
    train_loader, val_loader = hydra.utils.call(cfg.dataloader)
    model = hydra.utils.call(cfg.model.object)
    device = get_device(cfg.model.object.device_type)

    optimizer_init = hydra.utils.instantiate(cfg.optimizer)
    optimizer = optimizer_init(model.parameters())

    total_steps = len(train_loader) * cfg.train.epochs
    scheduler_init = hydra.utils.instantiate(cfg.scheduler, T_max=total_steps)
    scheduler = scheduler_init(optimizer)

    trainer = Trainer(
        model,
        optimizer,
        scheduler,
        train_loader,
        val_loader,
        device,
        cfg.train.checkpoint_path,
        cfg.model.compile_mode,
    )

    trainer.load_checkpoint(cfg.model.last_checkpoint)

    logger_kwargs = extract_mlflow_kwargs(cfg.logger)

    with mlflow.start_run(**logger_kwargs):
        log_config(cfg)
        trainer.train(cfg.train.epochs)


if __name__ == "__main__":
    pretrain()
