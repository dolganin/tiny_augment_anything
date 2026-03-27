from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
from types import ModuleType
from typing import cast

from backend.app.config.settings import Settings
from backend.app.services.config_utils import as_float, as_offload
from backend.app.services.diffusion_runtime_types import GenerateModule, SegmentModule


_module_cache: dict[Path, ModuleType] = {}


def load_generate_module(settings: Settings) -> GenerateModule:
    return cast(GenerateModule, load_module(settings.executor_script_path))


def load_segment_module(settings: Settings) -> SegmentModule:
    return cast(SegmentModule, load_module(settings.executor_segment_script_path))


def load_module(script_path: Path) -> ModuleType:
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
