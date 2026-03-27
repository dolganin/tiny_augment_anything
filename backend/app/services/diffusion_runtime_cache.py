from __future__ import annotations

import gc
from pathlib import Path

from backend.app.config.settings import Settings
from backend.app.runtime.logging import get_logger, log_event
from backend.app.services.config_utils import as_float, as_offload
from backend.app.services.diffusion_module_loader import load_generate_module
from backend.app.services.diffusion_runtime_types import DiffusionRuntimeKey, WarmedDiffusionRuntime, wrap_generator


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
    lora_scale = as_float(config.get("lora_scale"), 1.0)
    offload = as_offload(config.get("offload"))
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
    warmed = WarmedDiffusionRuntime(
        key=key,
        module=module,
        generator=wrap_generator(generator),
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
