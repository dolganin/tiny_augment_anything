import mlflow
import torch

import numpy as np

from sklearn.metrics import roc_auc_score, f1_score


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
        Dictionary with metrics for the epoch:
        - "loss" : float
            Mean binary cross-entropy loss over the epoch.
        - "auc" : float
            Area Under the ROC Curve (AUROC) for predictions.
        - "f1" : float
            F1 score computed using threshold 0.5.
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
            loss = torch.nn.functional.binary_cross_entropy_with_logits(
                logits, target
            )

            if train:
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()

        losses.append(loss.item())

        preds.append(torch.sigmoid(logits).detach().cpu().numpy())
        targets.append(target.cpu().numpy())

    preds = np.concatenate(preds)
    targets = np.concatenate(targets)

    auc = roc_auc_score(targets, preds)

    pred_labels = (preds > 0.5).astype(int)
    f1 = f1_score(targets, pred_labels)

    return {
        "loss": np.mean(losses),
        "auc": auc,
        "f1": f1,
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

            mlflow.log_metrics({
                "train_loss": train_metrics["loss"],
                "train_auc": train_metrics["auc"],
                "train_f1": train_metrics["f1"],
                "val_loss": val_metrics["loss"],
                "val_auc": val_metrics["auc"],
                "val_f1": val_metrics["f1"],
            }, step=epoch)

            print(epoch, val_metrics)