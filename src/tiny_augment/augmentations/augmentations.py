import albumentations as A

from albumentations.pytorch import ToTensorV2


def get_augmentations(img_size: int) -> dict[str, A.Compose]:
    """
    Create training and validation augmentation pipelines for ISIC skin lesion images.

    The augmentations are designed to improve model robustness to variations that
    naturally occur in dermoscopic images such as orientation differences, lighting
    conditions, imaging artifacts, and partial occlusions.

    Parameters
    ----------
    img_size : int
        Target image size used for resizing.

    Returns
    -------
    dict[str, albumentations.Compose]
        Dictionary with two augmentation pipelines:

        train :
            Augmentations applied during training.

        valid :
            Deterministic preprocessing used during validation.

    Notes
    -----
        The augmentations used in the training pipeline are grouped by type.

    Geometric transformations
        These modify spatial orientation and positioning of lesions.
        Dermoscopic images have no canonical orientation, therefore
        these transformations help the model learn orientation-invariant
        features.

        - Transpose
        - HorizontalFlip
        - VerticalFlip
        - ShiftScaleRotate
        - Resize

        These simulate different camera viewpoints, rotations, and framing
        of lesions.

    Color and illumination augmentations
        These transformations simulate variations in lighting conditions,
        camera sensors, and skin tone.

        - RandomBrightnessContrast
        - HueSaturationValue
        - CLAHE

        Such augmentations are important because dermoscopic images are
        collected using different devices and lighting setups.

    Noise and blur augmentations
        These simulate imperfections in the image acquisition process.

        - MotionBlur
        - MedianBlur
        - GaussianBlur
        - GaussNoise

        These help the model remain robust to defocus, sensor noise,
        and slight motion during image capture.

    Spatial distortions
        These introduce nonlinear geometric warping.

        - OpticalDistortion
        - GridDistortion
        - ElasticTransform

        These mimic optical lens distortion or small deformations of
        tissue structures.

    Occlusion augmentations
        These randomly remove parts of the image.

        - CoarseDropout

        This prevents the model from overfitting to specific local patterns
        and simulates occlusions such as hair, glare, or partial cropping.

    Normalization and tensor conversion
        - Normalize standardizes pixel intensities using dataset statistics.
        - ToTensorV2 converts images from NumPy arrays to PyTorch tensors.

    Transforms description:
    ----------------------

    Transpose
        Randomly swaps image axes. Helps the model become invariant to orientation
        changes of skin lesions, which do not carry semantic meaning.

    HorizontalFlip / VerticalFlip
        Random mirroring of the image. Lesion orientation is arbitrary, therefore
        flips increase dataset diversity without altering class semantics.

    RandomBrightnessContrast
        Randomly changes brightness and contrast to simulate different illumination
        conditions and camera exposures commonly found in clinical images.

    MotionBlur / MedianBlur / GaussianBlur / GaussNoise
        Simulates imaging artifacts such as camera motion, sensor noise, and
        defocus. Improves robustness to lower quality or noisy images.

    OpticalDistortion / GridDistortion / ElasticTransform
        Applies nonlinear geometric distortions. These simulate slight tissue
        deformation, optical lens effects, or acquisition artifacts.

    CLAHE
        Contrast Limited Adaptive Histogram Equalization. Enhances local contrast
        and improves visibility of lesion structures, which is often beneficial
        in dermoscopic analysis.

    HueSaturationValue
        Random color perturbations to account for differences in skin tone,
        lighting conditions, and camera color calibration.

    ShiftScaleRotate
        Random translation, zoom, and rotation. Helps the model generalize to
        different framing, scale, and orientation of lesions.

    Resize
        Resizes images to a fixed resolution required by convolutional networks.

    CoarseDropout
        Randomly masks a rectangular region of the image. Simulates occlusions
        such as hairs, glare, or partial cropping and prevents the model from
        relying on small specific regions.

    Normalize
        Standardizes pixel values using dataset statistics.

    ToTensorV2
        Converts image from NumPy array to PyTorch tensor.
    """

    train_transforms = A.Compose(
        [
            A.Transpose(p=0.5),
            A.VerticalFlip(p=0.5),
            A.HorizontalFlip(p=0.5),
            A.RandomBrightnessContrast(
                brightness_limit=0.2,
                contrast_limit=0.2,
                p=0.75,
            ),
            A.OneOf(
                [
                    A.MotionBlur(blur_limit=5),
                    A.MedianBlur(blur_limit=5),
                    A.GaussianBlur(blur_limit=5),
                    A.GaussNoise(std_range=(0.02, 0.1)),
                ],
                p=0.7,
            ),
            A.OneOf(
                [
                    A.OpticalDistortion(distort_limit=0.5),
                    A.GridDistortion(num_steps=5, distort_limit=0.5),
                    A.ElasticTransform(alpha=1, sigma=50),
                ],
                p=0.7,
            ),
            A.CLAHE(clip_limit=4.0, p=0.7),
            A.HueSaturationValue(
                hue_shift_limit=10,
                sat_shift_limit=20,
                val_shift_limit=10,
                p=0.5,
            ),
            A.Affine(
                translate_percent=(-0.1, 0.1),
                scale=(0.9, 1.1),
                rotate=(-15, 15),
                border_mode=0,
                p=0.85,
            ),
            A.Resize(img_size, img_size),
            A.CoarseDropout(
                num_holes_range=(1, 1),
                hole_height_range=(0.1, 0.35),
                hole_width_range=(0.1, 0.35),
                fill=0,
                p=0.7,
            ),
            A.Normalize(
                mean=[0.4815, 0.4578, 0.4082],  # type: ignore
                std=[0.2686, 0.2613, 0.2758],  # type: ignore
                max_pixel_value=255.0,
            ),
            ToTensorV2(),
        ]
    )

    val_transforms = A.Compose(
        [
            A.Resize(img_size, img_size),
            A.Normalize(
                mean=[0.4815, 0.4578, 0.4082],  # type: ignore
                std=[0.2686, 0.2613, 0.2758],  # type: ignore
                max_pixel_value=255.0,
            ),
            ToTensorV2(),
        ]
    )

    return {
        "train": train_transforms,
        "val": val_transforms,
    }
