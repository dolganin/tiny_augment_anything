import timm
import torch

from torch import nn
from pathlib import Path
from typing import Literal


class ISICClassifier(nn.Module):
    """
    Image classification model based on a timm backbone.

    Parameters
    ----------
    backbone : str
        Name of the timm model architecture.
    num_classes : int
        Number of output classes.
    pretrained : bool, default=True
        Whether to load pretrained weights.
    drop_rate : float, default=0.0
        Dropout rate.
    drop_path_rate : float, default=0.0
        Stochastic depth rate.
    finetune_mode: {"all", "partial", "head"}, default=head
        Strategy for fine-tuning.
    trainable_prefixes : list[str] | None, default=None
        Prefixes of parameter names to keep trainable when finetune_mode is "partial".
    """

    def __init__(
        self,
        backbone: str,
        num_classes: int = 2,
        pretrained: bool = True,
        drop_rate: float = 0.0,
        drop_path_rate: float = 0.0,
        finetune_mode: Literal["all", "partial", "head"] = "head",
        trainable_prefixes: list[str] | None = None,
    ) -> None:
        super().__init__()

        self.backbone = backbone
        self.finetune_mode = finetune_mode

        self.model = timm.create_model(
            model_name=backbone,
            pretrained=pretrained,
            drop_rate=drop_rate,
            num_classes=num_classes,
            drop_path_rate=drop_path_rate,
        )

        self._apply_finetune_strategy(trainable_prefixes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.

        Parameters
        ----------
        x : torch.Tensor
            Input images tensor (B, C, H, W).

        Returns
        -------
        torch.Tensor
            Raw logits of shape (B, num_classes).
        """

        return self.model(x)

    def load_checkpoint(self, checkpoint_path: str | Path) -> None:
        """
        Load model weights from checkpoint.

        Parameters
        ----------
        checkpoint_path : str | Path
            Path where weights stored.
        """

        checkpoint = torch.load(checkpoint_path, map_location=torch.device("cuda"))

        if (state_dict := checkpoint.get("model_state_dict", None)) is None:
            raise RuntimeError("No checkpoint.")

        self.model.load_state_dict(state_dict, strict=False)

    def _apply_finetune_strategy(self, trainable_prefixes: list[str] | None) -> None:
        """
        Freezes model parameters based on the selected fine-tuning mode.

        Parameters
        ----------

        trainable_prefixes : list[str] | None
            Prefixes of parameter names to keep trainable when finetune_mode is "partial".
        """
        if self.finetune_mode == "all":
            return

        for param in self.model.parameters():
            param.requires_grad = False

        if self.finetune_mode == "head":
            classifier = self.model.get_classifier()  # type: ignore
            for param in classifier.parameters():
                param.requires_grad = True

        elif self.finetune_mode == "partial":
            if trainable_prefixes is None or not trainable_prefixes:
                raise ValueError("Partial finetune mode requires layer names.")

            for name, param in self.model.named_parameters():
                if any(prefix in name for prefix in trainable_prefixes):
                    param.requires_grad = True
        else:
            assert False, f"Unrecognized finetune strategy: {self.finetune_mode}"
