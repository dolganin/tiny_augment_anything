import mlflow
import torch

import numpy as np


from sklearn.metrics import f1_score, precision_recall_fscore_support, accuracy_score


mlflow.set_tracking_uri("http://swagstation.netcraze.pro:4249/")


def run_epoch(model, loader, optimizer=None):
    """
    Runs a single training or validation epoch.

    Parameters
    ----------
    model : torch.nn.Module
        The PyTorch model to train or evaluate.
    loader : torch.utils.data.DataLoader
        DataLoader providing batches of (images, targets).
    optimizer : torch.optim.Optimizer, optional
        Optimizer for training. If None, the function runs in evaluation mode.

    Returns
    -------
    dict
        Dictionary with metrics for the epoch.
    """

    train = optimizer is not None
    model.train() if train else model.eval()

    losses = []
    preds = []
    targets = []

    for images, target in loader:
        images = images.cuda()
        target = target.float().cuda()

        with torch.set_grad_enabled(train):
            logits = model(images).squeeze()
            loss = torch.nn.functional.cross_entropy(logits, target)

            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

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

    return {
        "mean_loss": np.mean(losses),
        "precision_maccro": precision_maccro,
        "recall_macro": recall_macro,
        "f1_macro": f1_macro,
        "f1_micro": f1_micro,
        "f1_per_class": f1_per_class,
        "accuracy": accuracy,
    }


def train_model(model, train_loader, valid_loader, optimizer, epochs):
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
    epochs : int
        Number of epochs to train the model.

    Notes
    -----
    - Uses MLflow to log metrics at each epoch.
    - Logs loss, AUROC, and F1 for both training and validation.
    - Threshold for F1 computation is fixed at 0.5.
    - Model runs on GPU if available.
    """

    with mlflow.start_run():
        for epoch in range(epochs):
            train_metrics = run_epoch(model, train_loader, optimizer)
            val_metrics = run_epoch(model, valid_loader)

            metrics_to_log = {}

            for metric_name, value in train_metrics.items():
                metrics_to_log[f"train_{metric_name}"] = value

            for metric_name, value in val_metrics.items():
                metrics_to_log[f"val_{metric_name}"] = value

            mlflow.log_metrics(metrics_to_log, step=epoch)

            print(epoch, val_metrics)
