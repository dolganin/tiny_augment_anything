import mlflow
import tempfile
import os
import torch

from torch import nn
from torch.optim import Optimizer
from torch.optim.lr_scheduler import LRScheduler
from omegaconf import OmegaConf, DictConfig
from pathlib import Path


def log_config(cfg: DictConfig) -> None:
    """
    Logs a Hydra configuration to MLflow as a YAML artifact.

    Parameters
    ----------
    cfg : DictConfig
        Hydra configuration object to log.
    """

    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
        OmegaConf.save(cfg, f.name)
        mlflow.log_artifact(f.name, artifact_path="hydra_config")


def log_metrics(
    epoch: int, train_metrics: dict[str, float], val_metrics: dict[str, float]
) -> None:
    """
    Logs training and validation metrics to MLflow for a given epoch.

    Parameters
    ----------
    epoch : int
        Current training epoch, used as the step in MLflow logging.

    train_metrics : dict[str, float]
        Dictionary of metric names and values computed on the training set.

    val_metrics : dict[str, float]
        Dictionary of metric names and values computed on the validation set.
    """

    metrics = {
        **{f"train_{k}": v for k, v in train_metrics.items()},
        **{f"val_{k}": v for k, v in val_metrics.items()},
    }
    mlflow.log_metrics(metrics, step=epoch)


def save_checkpoint(
    model: nn.Module,
    optimizer: Optimizer,
    scheduler: LRScheduler,
    epoch: int,
    best_val_loss: float,
    checkpoint_dir: str | Path,
) -> None:
    """
    Saves a PyTorch checkpoint of the model, optimizer, scheduler, and
    best validation loss, and logs it as an MLflow artifact.

    Parameters
    ----------
    model : torch.nn.Module
        The model whose state_dict will be saved.

    optimizer : torch.optim.Optimizer
        Optimizer whose state_dict will be saved.

    scheduler : torch.optim.lr_scheduler.LRScheduler | None
        Learning rate scheduler whose state_dict will be saved if not None.

    epoch : int
        Current epoch number, used in the checkpoint filename.

    best_val_loss : float
        Best validation loss so far, included in the checkpoint.

    checkpoint_dir : str | Path
        Directory where the checkpoint file will be saved locally before
        uploading to MLflow.
    """

    os.makedirs(checkpoint_dir, exist_ok=True)

    checkpoint = {
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "scheduler_state_dict": scheduler.state_dict()
        if scheduler is not None
        else None,
        "best_val_loss": best_val_loss,
    }

    path = Path(checkpoint_dir) / f"best_epoch_{epoch}.pth"

    torch.save(checkpoint, path)
    mlflow.log_artifact(str(path), artifact_path="model_checkpoints")


def extract_logger_kwargs(cfg: DictConfig) -> dict:
    """
    Extracts logger arguments from a Hydra configuration.

    Parameters
    ----------
    cfg : DictConfig
        Hydra configuration object containing a 'logger' section with
        parameters (experiment_name, run_name, description, nested, tags).

    Returns
    -------
    dict
        Dictionary containing keyword arguments suitable for passing to
        `mlflow.start_run()`. Keys with None values are omitted.
    """

    kwargs = {
        "experiment_name": cfg.logger.experiment_name,
        "run_name": cfg.logger.run_name if cfg.logger.run_name is not None else None,
        "description": cfg.logger.description,
        "nested": cfg.logger.nested,
        "tags": OmegaConf.to_container(cfg.logger.tags, resolve=True),
    }

    kwargs = {k: v for k, v in kwargs.items() if v is not None}
    return kwargs
