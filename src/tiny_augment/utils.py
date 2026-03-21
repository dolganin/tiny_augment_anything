import mlflow
import tempfile
import torch

from omegaconf import OmegaConf, DictConfig


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
