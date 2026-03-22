import mlflow
import torch

from pathlib import Path
from omegaconf import OmegaConf, DictConfig


def log_config(cfg: DictConfig) -> None:
    """
    Logs a Hydra configuration to MLflow as a YAML artifact.

    Parameters
    ----------
    cfg : DictConfig
        Hydra configuration object to log.
    """
    config_path = Path(cfg.train.config_path)

    config_path.mkdir(parents=True, exist_ok=True)

    save_path = config_path / "hydra_config"

    OmegaConf.save(cfg, save_path)
    mlflow.log_artifact(str(save_path), artifact_path="hydra_config.yaml")


def extract_mlflow_kwargs(logger: DictConfig) -> dict:
    """
    Extracts logger arguments from a Hydra configuration.

    Parameters
    ----------
    logger : DictConfig
        Hydra configuration object containing a 'mlflow' section with
        parameters (experiment_name, run_name, description, nested, tags).

    Returns
    -------
    dict
        Dictionary containing keyword arguments suitable for passing to
        `mlflow.start_run()`. Keys with None values are omitted.
    """

    mlflow.set_experiment(logger.mlflow.experiment_name)

    kwargs = {
        "run_name": logger.mlflow.run_name
        if logger.mlflow.run_name is not None
        else None,
        "description": logger.mlflow.description,
        "nested": logger.mlflow.nested,
        "tags": OmegaConf.to_container(logger.mlflow.tags, resolve=True),
    }

    kwargs = {k: v for k, v in kwargs.items() if v is not None}
    return kwargs


def get_device(device_type: str) -> torch.device:
    if "cuda" in device_type and not torch.cuda.is_available():
        raise RuntimeError(
            "Cuda is not available. Found no NVIDIA driver on your system."
        )

    return torch.device(device_type)


def extract_weights(loader: torch.utils.data.DataLoader) -> list[float]:
    """
    Compute class weights from a dataset based on class frequencies.
    Weights calculated using inverse frequency formula.

    Parameters
    ----------
    loader : torch.utils.data.DataLoader
        DataLoader providing access to the dataset. The underlying dataset
        must expose a `targets` attribute containing class labels for all
        samples.

    Returns
    -------
    list of float
        A list of class weights, where each index corresponds to a class.
    """

    targets = torch.tensor(loader.dataset.targets)  # type: ignore
    class_count = torch.bincount(targets)
    weights = (len(targets) / len(class_count) * class_count.float()).tolist()
    return weights
