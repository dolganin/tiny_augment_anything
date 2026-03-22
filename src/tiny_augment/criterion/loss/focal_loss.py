import torch


class FocalLoss(torch.nn.Module):
    """
    Own focal loss implementation.
    """

    def __init__(self, alpha: list[float], gamma: float = 2.0) -> None:
        super().__init__()

        self.gamma = gamma
        self.register_buffer("alpha", torch.tensor(alpha, dtype=torch.float))

    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        log_probs = torch.nn.functional.log_softmax(inputs, dim=1)
        probs = log_probs.exp()

        log_pt = log_probs.gather(1, (t := targets.unsqueeze(1))).squeeze(1)
        pt = probs.gather(1, t).squeeze(1)

        focal_loss = self.alpha[targets] * (1 - pt) ** self.gamma * -log_pt  # type: ignore
        return focal_loss.mean()
