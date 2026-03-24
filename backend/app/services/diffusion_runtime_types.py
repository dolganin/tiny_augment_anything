from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

from backend.app.runtime.logging import get_logger, log_event


class DiffusionGenerator(Protocol):
    def generate_img2img(
        self,
        prompt: str,
        image,
        negative_prompt: str | None,
        strength: float,
        steps: int,
        guidance_scale: float,
        seed: int,
    ):
        ...

    def generate_inpaint(
        self,
        prompt: str,
        image,
        mask_image,
        negative_prompt: str | None,
        strength: float,
        steps: int,
        guidance_scale: float,
        seed: int,
    ):
        ...


class GenerateModule(Protocol):
    class ZImageGenerator:
        def __new__(
            cls,
            model_id: str,
            device: str,
            dtype,
            lora_path: str | None,
            lora_scale: float,
            offload: str = "none",
        ) -> DiffusionGenerator:
            ...

    def load_rgb(self, path: Path):
        ...

    def load_mask(self, path: Path):
        ...

    def feather_mask(self, mask, dilate_size: int, blur_radius: float):
        ...

    def resize_pair(self, image, mask, size: int):
        ...

    @property
    def utils(self):
        ...


class SegmentModule(Protocol):
    def load_rgb(self, path: Path):
        ...

    def polygon_mask(self, size, points):
        ...

    def save_masks(
        self,
        mask_stack,
        out_dir: Path,
        stem: str,
        save_all: bool,
        compress_level: int,
    ) -> list[str]:
        ...

    @property
    def utils(self):
        ...


@dataclass(frozen=True, slots=True)
class DiffusionRuntimeKey:
    model_id: str
    device: str
    precision: str
    lora_path: str | None
    lora_scale: float
    offload: str


@dataclass(frozen=True, slots=True)
class WarmedDiffusionRuntime:
    key: DiffusionRuntimeKey
    module: GenerateModule
    generator: DiffusionGenerator
    cache_hit: bool


logger = get_logger(__name__)


class CompatibleDiffusionGenerator:
    def __init__(self, inner) -> None:
        self._inner = inner

    def __getattr__(self, name: str):
        return getattr(self._inner, name)

    def generate_img2img(
        self,
        prompt: str,
        image,
        negative_prompt: str | None,
        strength: float,
        steps: int,
        guidance_scale: float,
        seed: int,
    ):
        try:
            return self._inner.generate_img2img(
                prompt,
                image,
                negative_prompt,
                strength,
                steps,
                guidance_scale,
                seed,
            )
        except TypeError as error:
            if not is_cross_attention_kwargs_error(error):
                raise
            log_event(logger, 30, "diffusion_runtime.cross_attention_kwargs.unsupported", pipe_kind="img2img")
            pipe = self._inner._load_pipe("img2img")
            return pipe(
                prompt=prompt,
                image=image,
                negative_prompt=negative_prompt,
                strength=strength,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                generator=self._inner._generator(seed),
            ).images[0]

    def generate_inpaint(
        self,
        prompt: str,
        image,
        mask_image,
        negative_prompt: str | None,
        strength: float,
        steps: int,
        guidance_scale: float,
        seed: int,
    ):
        try:
            return self._inner.generate_inpaint(
                prompt,
                image,
                mask_image,
                negative_prompt,
                strength,
                steps,
                guidance_scale,
                seed,
            )
        except TypeError as error:
            if not is_cross_attention_kwargs_error(error):
                raise
            log_event(logger, 30, "diffusion_runtime.cross_attention_kwargs.unsupported", pipe_kind="inpaint")
            pipe = self._inner._load_pipe("inpaint")
            return pipe(
                prompt=prompt,
                image=image,
                mask_image=mask_image,
                negative_prompt=negative_prompt,
                strength=strength,
                num_inference_steps=steps,
                guidance_scale=guidance_scale,
                generator=self._inner._generator(seed),
            ).images[0]


def wrap_generator(generator) -> DiffusionGenerator:
    return cast(DiffusionGenerator, CompatibleDiffusionGenerator(generator))


def is_cross_attention_kwargs_error(error: TypeError) -> bool:
    return "cross_attention_kwargs" in str(error)
