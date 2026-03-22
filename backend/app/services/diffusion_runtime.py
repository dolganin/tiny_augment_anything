from __future__ import annotations

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


@dataclass(frozen=True, slots=True)
class WarmedDiffusionRuntime:
    key: DiffusionRuntimeKey
    module: GenerateModule
    generator: DiffusionGenerator
    cache_hit: bool


_module_cache: dict[Path, ModuleType] = {}
_runtime_cache: dict[DiffusionRuntimeKey, WarmedDiffusionRuntime] = {}
logger = get_logger(__name__)


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
    key = DiffusionRuntimeKey(
        model_id=model_id,
        device=device,
        precision=precision,
        lora_path=resolved_lora_path,
        lora_scale=lora_scale,
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
    )
    generator = module.ZImageGenerator(
        model_id=model_id,
        device=device,
        dtype=dtype,
        lora_path=resolved_lora_path,
        lora_scale=lora_scale,
    )
    warmed = WarmedDiffusionRuntime(
        key=key,
        module=module,
        generator=generator,
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
    )
    return warmed


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
