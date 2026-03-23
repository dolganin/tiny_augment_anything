from __future__ import annotations

import gc
from dataclasses import dataclass
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
from typing import Protocol, cast

from backend.app.config.settings import Settings
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


_module_cache: dict[Path, ModuleType] = {}
_runtime_cache: dict[DiffusionRuntimeKey, WarmedDiffusionRuntime] = {}
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
            if not _is_cross_attention_kwargs_error(error):
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
            if not _is_cross_attention_kwargs_error(error):
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


def warm_diffusion_runtime(
    settings: Settings,
    config: dict[str, object],
    lora_path: Path | None = None,
) -> WarmedDiffusionRuntime:
    log_event(logger, 20, "diffusion_runtime.module_load.begin", script_path=settings.executor_script_path)
    module = load_generate_module(settings)
    model_id = str(config.get("model_id", "Tongyi-MAI/Z-Image-Turbo"))
    precision = str(config.get("precision", "bf16"))
    requested_device = config.get("device")
    resolved_requested_device = (
        str(requested_device).strip()
        if isinstance(requested_device, str) and str(requested_device).strip()
        else settings.executor_default_device
    )
    device = str(module.utils.choose_device(resolved_requested_device))
    dtype = module.utils.choose_dtype(device, precision)
    resolved_lora_path = str(lora_path.resolve()) if lora_path is not None else None
    lora_scale = _as_float(config.get("lora_scale"), 1.0)
    offload = _as_offload(config.get("offload"))
    key = DiffusionRuntimeKey(
        model_id=model_id,
        device=device,
        precision=precision,
        lora_path=resolved_lora_path,
        lora_scale=lora_scale,
        offload=offload,
    )
    cached = _runtime_cache.get(key)
    if cached is not None:
        log_event(
            logger,
            20,
            "diffusion_runtime.cache_hit",
            model_id=key.model_id,
            device=key.device,
            precision=key.precision,
            lora_path=key.lora_path,
            offload=key.offload,
        )
        return WarmedDiffusionRuntime(
            key=cached.key,
            module=cached.module,
            generator=cached.generator,
            cache_hit=True,
        )
    log_event(
        logger,
        20,
        "diffusion_runtime.generator_init.begin",
        model_id=key.model_id,
        device=key.device,
        precision=key.precision,
        lora_path=key.lora_path,
        lora_scale=key.lora_scale,
        offload=key.offload,
    )
    generator = module.ZImageGenerator(
        model_id=model_id,
        device=device,
        dtype=dtype,
        lora_path=resolved_lora_path,
        lora_scale=lora_scale,
        offload=offload,
    )
    compatible_generator = CompatibleDiffusionGenerator(generator)
    warmed = WarmedDiffusionRuntime(
        key=key,
        module=module,
        generator=cast(DiffusionGenerator, compatible_generator),
        cache_hit=False,
    )
    _runtime_cache[key] = warmed
    log_event(
        logger,
        20,
        "diffusion_runtime.generator_init.completed",
        model_id=key.model_id,
        device=key.device,
        precision=key.precision,
        lora_path=key.lora_path,
        offload=key.offload,
    )
    return warmed


def preload_diffusion_pipe(warmed: WarmedDiffusionRuntime, kind: str = "img2img") -> None:
    generator = warmed.generator
    load_pipe = getattr(generator, "_load_pipe", None)
    if callable(load_pipe):
        load_pipe(kind)


def release_warm_diffusion_runtime(warmed: WarmedDiffusionRuntime) -> None:
    cached = _runtime_cache.get(warmed.key)
    if cached is warmed:
        _runtime_cache.pop(warmed.key, None)
    raw_generator = getattr(warmed.generator, "_inner", warmed.generator)
    clear_pipe = getattr(raw_generator, "_clear_pipe", None)
    if callable(clear_pipe):
        clear_pipe()
    torch_module = getattr(raw_generator, "torch", None)
    if torch_module is not None and warmed.key.device.startswith("cuda"):
        try:
            torch_module.cuda.empty_cache()
        except Exception:
            pass
        try:
            torch_module.cuda.ipc_collect()
        except Exception:
            pass
    gc.collect()


def release_all_diffusion_runtimes() -> None:
    cached_runtimes = list(_runtime_cache.values())
    _runtime_cache.clear()
    for warmed in cached_runtimes:
        release_warm_diffusion_runtime(warmed)


def load_generate_module(settings: Settings) -> GenerateModule:
    return cast(GenerateModule, _load_module(settings.executor_script_path))


def load_segment_module(settings: Settings) -> SegmentModule:
    return cast(SegmentModule, _load_module(settings.executor_segment_script_path))


def _load_module(script_path: Path) -> ModuleType:
    resolved_path = script_path.resolve()
    cached = _module_cache.get(resolved_path)
    if cached is not None:
        return cached
    script_dir = str(resolved_path.parent)
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    module_name = f"tiny_augment_generate_{abs(hash(resolved_path.as_posix()))}"
    spec = importlib.util.spec_from_file_location(module_name, resolved_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Не удалось загрузить модуль генератора: {resolved_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    _module_cache[resolved_path] = module
    return module


def _as_float(value: object, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value:
        return float(value)
    return float(default)


def _as_offload(value: object) -> str:
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"none", "model", "sequential"}:
            return normalized
    return "none"


def _is_cross_attention_kwargs_error(error: TypeError) -> bool:
    return "cross_attention_kwargs" in str(error)
