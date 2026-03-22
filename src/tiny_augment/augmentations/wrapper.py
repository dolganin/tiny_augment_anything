import torch

import numpy as np

from PIL import Image
from typing import Callable, Any


class AlbumentationsWrapper:
    """
    Adapter class to make Albumentations transforms compatible with torchvision datasets.

    This wrapper converts input images from PIL format to NumPy arrays and adapts
    the Albumentations interface (which expects named arguments and returns a dict)
    to the callable interface expected by torchvision datasets.

    Parameters
    ----------
    transform : Callable[..., dict[str, Any]]
        Albumentations transform pipeline (e.g., `albumentations.Compose`) that
        expects input as a named argument (`image=...`) and returns a dictionary
        containing the transformed image under the `"image"` key.

    Notes
    -----
    - Input images are converted from `PIL.Image.Image` to `numpy.ndarray`
    before being passed to the Albumentations transform.
    - The wrapper extracts the `"image"` field from the transform output.
    - The returned object is typically a `torch.Tensor` if `ToTensorV2` is
    included in the Albumentations pipeline.
    """

    def __init__(self, transforms: Callable[..., dict[str, Any]]) -> None:
        self.transforms = transforms

    def __call__(self, img: Image.Image) -> torch.Tensor:
        """
        Apply the Albumentations transform to an input image.

        Parameters
        ----------
        img : PIL.Image.Image
            Input image in PIL format.

        Returns
        -------
        torch.Tensor
            Transformed image. The exact type depends on the transform pipeline,
            but is typically a tensor if `ToTensorV2` is used.
        """

        return self.transforms(image=np.array(img))["image"]
