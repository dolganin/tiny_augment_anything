import torch
import os
import mlflow

import numpy as np

from tqdm import tqdm
from pathlib import Path
from typing import Literal
from sklearn.metrics import f1_score, precision_recall_fscore_support, accuracy_score


torch.backends.cudnn.benchmark = True

MetricsKeys = Literal[
    "mean_loss",
    "last_loss",
    "precision_macro",
    "recall_macro",
    "f1_macro",
    "f1_micro",
    "accuracy",
]


class Trainer:
    """
    Trainer class for managing training and validation of a PyTorch model.

    Parameters
    ----------
    model : torch.nn.Module
        The neural network model to train or fine-tune.

    criterion : torch.nn.Module
        Loss function (criterion) used to compute the training loss.

    optimizer : torch.optim.Optimizer
        Optimizer used for updating model parameters during training.

    scheduler : torch.optim.lr_scheduler.LRScheduler
        Learning rate scheduler to adjust the learning rate during training.

    train_loader : torch.utils.data.DataLoader
        DataLoader providing the training dataset in batches.

    val_loader : torch.utils.data.DataLoader
        DataLoader providing the validation dataset in batches.

    device : torch.device
        The device on which to run the model (e.g., 'cuda' or 'cpu').

    checkpoint_path : str | Path
        Path to save checkpoints.

    compile_mode : Literal["default", "reduce-overhead", "max-autotune"] | None, default=None
        Mode for torch.compile optimization. If None, compilation is skipped.

    monitor_metric : MetricsKeys, default=f1_macro
        Metric to monitor for early stopping and best model saving.
        Must be one of: "mean_loss", "last_loss", "precision_macro",
        "recall_macro", "f1_macro", "f1_micro", "accuracy".

    monitor_mode : Literal["max", "min"], default=max
        Whether to maximize or minimize the monitored metric.
        Use "max" for metrics like accuracy/F1, "min" for loss.

    patience : int, default=10
        Number of epochs with no improvement after which training will be stopped.

    save_every_n_epochs : int, default=5
        Save checkpoint every N epochs regardless of performance.
    """

    def __init__(
        self,
        model: torch.nn.Module,
        criterion: torch.nn.Module,
        optimizer: torch.optim.Optimizer,
        scheduler: torch.optim.lr_scheduler.LRScheduler,
        train_loader: torch.utils.data.DataLoader,
        val_loader: torch.utils.data.DataLoader,
        device: torch.device,
        checkpoint_path: str | Path,
        compile_mode: Literal["default", "reduce-overhead", "max-autotune"]
        | None = None,
        monitor_metric: MetricsKeys = "f1_macro",
        monitor_mode: Literal["max", "min"] = "max",
        patience: int = 10,
        save_every_n_epochs: int = 5,
    ) -> None:
        self.model = model
        self.criterion = criterion.to(device)
        self.optimizer = optimizer
        self.scheduler = scheduler
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.device = device
        self.ckpt_dir = Path(checkpoint_path)

        self.compile_mode = compile_mode
        self.monitor_metric = monitor_metric
        self.monitor_mode = monitor_mode
        self.patience = patience
        self.save_every_n_epochs = save_every_n_epochs

        self.current_epoch = 0
        self.patience_counter = 0
        self.best_metric_val = (
            float("-inf") if self.monitor_mode == "max" else float("inf")
        )

        os.makedirs(self.ckpt_dir, exist_ok=True)

    def _save_checkpoint(self, name: str) -> None:
        """
        Saves a PyTorch checkpoint of the model, optimizer, scheduler, and
        best validation loss, and logs it as an MLflow artifact.

        Parameters:
        -----------
        name : str
            Name of saved checkpoint.
        """

        checkpoint = {
            "epoch": self.current_epoch + 1,
            "model_state_dict": self.model.state_dict(),  # type: ignore
            "optimizer_state_dict": self.optimizer.state_dict(),
            "scheduler_state_dict": self.scheduler.state_dict(),
            "best_metric_val": self.best_metric_val,
            "monitor_metric": self.monitor_metric,
            "patience_counter": self.patience_counter,
        }

        path = self.ckpt_dir / f"{name}.pth"

        torch.save(checkpoint, path)
        mlflow.log_artifact(local_path=str(path), artifact_path="model_checkpoints")

    def load_checkpoint(self, checkpoint_path: str | Path | None = None) -> None:
        """
        Load a full training checkpoint including model, optimizer, scheduler,
        current epoch, and best validation loss.

        Parameters
        ----------
        checkpoint_path : str | Path | None, default=None
            Path to the checkpoint file containing model and training state.
        """

        if checkpoint_path is None:
            return

        checkpoint = torch.load(
            checkpoint_path, map_location=self.device, weights_only=False
        )

        self.model.load_state_dict(checkpoint["model_state_dict"], strict=False)  # type: ignore
        self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        self.scheduler.load_state_dict(checkpoint["scheduler_state_dict"])
        self.current_epoch = checkpoint["epoch"] + 1
        self.best_metric_val = checkpoint["best_metric_val"]
        self.monitor_metric = checkpoint["monitor_metric"]
        self.patience_counter = checkpoint["patience_counter"]

    def load_model_weights(self, checkpoint_path: str | Path | None = None) -> None:
        """
        Load only the model weights from a checkpoint.

        Parameters
        ----------
        checkpoint_path : str | Path | None, default=None
            Path to the checkpoint file containing model weights.
        """

        if checkpoint_path is None:
            return

        checkpoint = torch.load(
            checkpoint_path, map_location=self.device, weights_only=False
        )

        self.model.load_state_dict(checkpoint["model_state_dict"], strict=False)  # type: ignore

    def train(self, max_epochs: int) -> None:
        """
        Trains a model for a given number of epochs and evaluates on validation set.
        """

        if self.compile_mode is not None:
            self.model = torch.compile(self.model, mode=self.compile_mode)

        for epoch in range(self.current_epoch, max_epochs):
            self.current_epoch = epoch

            train_metrics = self._run_epoch(self.train_loader, is_train=True)
            val_metrics = self._run_epoch(self.val_loader, is_train=False)

            self._log_epoch_step(train_metrics, val_metrics)

            current_metric = val_metrics.get(self.monitor_metric)
            is_best = (
                current_metric > self.best_metric_val  # type: ignore
                if self.monitor_mode == "max"
                else current_metric < self.best_metric_val  # type: ignore
            )

            if is_best:
                self.best_metric_val = current_metric
                self.patience_counter = 0

                self._save_checkpoint(f"best_epoch_{self.current_epoch + 1}")
            else:
                self.patience_counter += 1

            if (self.current_epoch % self.save_every_n_epochs) == 0:
                self._save_checkpoint(f"epoch_{self.current_epoch + 1}")

            if (self.current_epoch + 1) == max_epochs:
                self._save_checkpoint(f"last_checkpoint_{max_epochs}")

            if self.patience_counter > self.patience:
                self._save_checkpoint(f"early_stopping_epoch_{self.current_epoch + 1}")
                break

    def _log_epoch_step(
        self, train_metrics: dict[str, float], val_metrics: dict[str, float]
    ) -> None:
        """
        Logs training and validation metrics to MLflow for the current epoch
        and prints a summary to the console.

        Parameters
        ----------
        train_metrics : dict[str, float]
            Dictionary of metric names and values computed on the training set.

        val_metrics : dict[str, float]
            Dictionary of metric names and values computed on the validation set.
        """

        print(
            f"Epoch {self.current_epoch + 1} | "
            f"Val mean Loss: {val_metrics['mean_loss']:.4f} | "
            f"Val last Loss: {val_metrics['last_loss']:.4f} | "
            f"Val F1 Macro: {val_metrics['f1_macro']:.4f}"
        )

        metrics = {
            **{f"train_{k}": v for k, v in train_metrics.items()},
            **{f"val_{k}": v for k, v in val_metrics.items()},
        }
        mlflow.log_metrics(metrics, step=self.current_epoch)

    def _run_epoch(
        self, loader: torch.utils.data.DataLoader, is_train: bool
    ) -> dict[str, float]:
        """
        Runs a single training or validation epoch.

        Parameters
        ----------
        loader : torch.utils.data.DataLoader
            DataLoader providing batches of (images, targets).

        is_train : bool
            Whether to train model.

        Returns
        -------
        dict[str, float]
            Dictionary with metrics for the epoch.
        """

        self.model.train() if is_train else self.model.eval()  # type: ignore

        losses = []
        preds = []
        targets = []

        for imgs, target in tqdm(loader, desc=f"Epoch={self.current_epoch + 1}"):
            imgs = imgs.to(self.device)
            target = target.to(self.device)

            with torch.set_grad_enabled(is_train):
                if is_train:
                    self.optimizer.zero_grad()

                with torch.autocast(self.device.type, dtype=torch.bfloat16):
                    logits = self.model(imgs)
                    loss = self.criterion(logits, target)

                if is_train:
                    loss.backward()
                    self.optimizer.step()
                    self.scheduler.step()

            losses.append(loss.item())

            probs = torch.softmax(logits, dim=1).detach().cpu().float().numpy()
            preds.append(probs)
            targets.append(target.cpu().numpy())

        preds = np.concatenate(preds, axis=0)
        targets = np.concatenate(targets, axis=0)

        pred_targets = np.argmax(preds, axis=1)

        precision_macro, recall_macro, f1_macro, _ = precision_recall_fscore_support(
            targets, pred_targets, average="macro"
        )
        f1_micro = f1_score(targets, pred_targets, average="micro", zero_division=0)
        f1_per_class = f1_score(targets, pred_targets, average=None, zero_division=0)
        accuracy = accuracy_score(targets, pred_targets)

        metrics = {
            "mean_loss": float(np.mean(losses)),
            "last_loss": float(losses[-1]),
            "precision_macro": float(precision_macro),
            "recall_macro": float(recall_macro),
            "f1_macro": float(f1_macro),
            "f1_micro": float(f1_micro),
            "accuracy": float(accuracy),
        }

        for i, f1_val in enumerate(f1_per_class):  # type: ignore
            metrics[f"f1_class_{i}"] = float(f1_val)

        if is_train:
            metrics["current_learning_rate"] = self._get_lr()

        return metrics

    def _get_lr(self) -> float:
        return float(self.optimizer.param_groups[0]["lr"])
