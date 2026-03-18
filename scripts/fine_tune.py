import hydra
import mlflow

from mlflow import artifacts
from tqdm import tqdm
from omegaconf import DictConfig

from src.train import train_model
from src.utils import log_config, log_metrics, save_checkpoint, extract_logger_kwargs


@hydra.main(config_path="../configs", config_name="fine_tune")
def fine_tune(cfg: DictConfig) -> None:
    train_loader, val_loader = hydra.utils.call(cfg.dataloader)
    model = hydra.utils.call(cfg.model.object)

    optimizer_init = hydra.utils.instantiate(cfg.optimizer)
    optimizer = optimizer_init(model.parameters())

    scheduler_init = hydra.utils.instantiate(cfg.scheduler)
    scheduler = scheduler_init(optimizer)

    checkpoint_path = artifacts.download_artifacts(
        run_id=cfg.model.checkpoint.mlflow_run_id,
        artifact_path=cfg.model.checkpoint.artifact_path,
    )
    model.load_checkpoint(checkpoint_path)

    logger_kwargs = extract_logger_kwargs(cfg)

    best_val_loss = float("inf")

    with mlflow.start_run(**logger_kwargs):
        log_config(cfg)

        for epoch, train_metrics, val_metrics in tqdm(
            train_model(
                model,
                train_loader,
                val_loader,
                optimizer,
                scheduler,
                cfg.train.epochs,
            )
        ):
            log_metrics(epoch, train_metrics, val_metrics)

            print(
                f"Epoch {epoch} | "
                f"Val Loss: {val_metrics['mean_loss']:.4f} | "
                f"Val F1 Macro: {val_metrics['f1_macro']:.4f}"
            )

            if val_metrics["mean_loss"] < best_val_loss:
                best_val_loss = val_metrics["mean_loss"]

                save_checkpoint(
                    model,
                    optimizer,
                    scheduler,
                    epoch,
                    best_val_loss,
                    cfg.train.checkpoint_dir,
                )


if __name__ == "__main__":
    fine_tune()
