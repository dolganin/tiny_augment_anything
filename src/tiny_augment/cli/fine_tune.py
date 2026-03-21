import hydra
import mlflow

from mlflow import artifacts
from omegaconf import DictConfig

from tiny_augment.train import Trainer
from tiny_augment.utils import log_config, extract_mlflow_kwargs, get_device


mlflow.set_tracking_uri("http://swagstation.netcraze.pro:4249/")


@hydra.main(version_base="1.3", config_path="../configs", config_name="fine_tune")
def fine_tune(cfg: DictConfig) -> None:
    train_loader, val_loader = hydra.utils.call(cfg.dataloader)
    model = hydra.utils.call(cfg.model.object)
    device = get_device(cfg.model.object.device_type)

    optimizer_init = hydra.utils.instantiate(cfg.optimizer)
    optimizer = optimizer_init(model.parameters())

    scheduler_init = hydra.utils.instantiate(cfg.scheduler)
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

    model_path = artifacts.download_artifacts(
        run_id=cfg.model.model_path.mlflow_run_id,
        artifact_path=cfg.model.model_path.artifact_path,
    )
    trainer.load_model_weights(model_path)

    logger_kwargs = extract_mlflow_kwargs(cfg.logger)

    with mlflow.start_run(**logger_kwargs):
        log_config(cfg)
        trainer.train(cfg.train.epochs)


if __name__ == "__main__":
    fine_tune()
