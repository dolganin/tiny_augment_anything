import mlflow
import torch

import numpy as np

from torch import nn
from torch.optim import Optimizer
from torch.optim.lr_scheduler import LRScheduler
from torch.utils.data import DataLoader
from typing import Generator
from sklearn.metrics import f1_score, precision_recall_fscore_support, accuracy_score


mlflow.set_tracking_uri("http://swagstation.netcraze.pro:4249/")


def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    optimizer: Optimizer | None = None,
    scheduler: LRScheduler | None = None,
) -> dict[str, float]:
    """
    Runs a single training or validation epoch.

    Parameters
    ----------
    model : torch.nn.Module
        The PyTorch model to train or evaluate.
    loader : torch.utils.data.DataLoader
        DataLoader providing batches of (images, targets).
    optimizer : torch.optim.Optimizer, default=None
        Optimizer for training. If None, the function runs in evaluation mode.
    scheduler : torch.optim.lr_scheduler.LRScheduler, default=None
        Scheduler for training. If None, no lr-scheduling strategy used.

    Returns
    -------
    dict[str, float]
        Dictionary with metrics for the epoch.
    """

    train = optimizer is not None
    model.train() if train else model.eval()

    losses = []
    preds = []
    targets = []

    for images, target in loader:
        images = images.cuda()
        target = target.cuda()

        with torch.set_grad_enabled(train):
            if train:
                optimizer.zero_grad()

            logits = model(images).squeeze()
            loss = torch.nn.functional.cross_entropy(logits, target)

            if train:
                loss.backward()
                optimizer.step()

                if scheduler is not None:
                    scheduler.step()

        losses.append(loss.item())

        probs = torch.softmax(logits, dim=1).detach().cpu().numpy()
        preds.append(probs)
        targets.append(target.cpu().numpy())

    preds = np.concatenate(preds)
    targets = np.concatenate(targets)

    pred_labels = np.argmax(preds, axis=1)

    precision_maccro, recall_macro, f1_macro, _ = precision_recall_fscore_support(
        targets, pred_labels, average="macro"
    )
    f1_micro = f1_score(targets, pred_labels, average="micro", zero_division=0)
    f1_per_class = f1_score(targets, pred_labels, average=None, zero_division=0)
    accuracy = accuracy_score(targets, pred_labels)

    metrics = {
        "mean_loss": np.mean(losses),
        "precision_maccro": precision_maccro,
        "recall_macro": recall_macro,
        "f1_macro": f1_macro,
        "f1_micro": f1_micro,
        "accuracy": accuracy,
    }

    for i, f1_val in enumerate(f1_per_class):  # type: ignore
        metrics[f"f1_class_{i}"] = float(f1_val)

    return metrics


def train_model(
    model: nn.Module,
    train_loader: DataLoader,
    valid_loader: DataLoader,
    optimizer: Optimizer,
    scheduler: LRScheduler,
    epochs: int,
) -> Generator[tuple[int, dict[str, float], dict[str, float]]]:
    """
    Trains a model for a given number of epochs and evaluates on validation set.

    Parameters
    ----------
    model : torch.nn.Module
        The PyTorch model to train.
    train_loader : torch.utils.data.DataLoader
        DataLoader for training data.
    valid_loader : torch.utils.data.DataLoader
        DataLoader for validation data.
    optimizer : torch.optim.Optimizer
        Optimizer used for training.
    scheduler : torch.optim.lr_scheduler.LRScheduler
        Scheduler used for training.
    epochs : int
        Number of epochs to train the model.
    """

    with mlflow.start_run():
        for epoch in range(epochs):
            train_metrics = run_epoch(model, train_loader, optimizer, scheduler)
            val_metrics = run_epoch(model, valid_loader)

            yield epoch, train_metrics, val_metrics
