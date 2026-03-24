from __future__ import annotations

import gc
import importlib.util
import sys

from backend.app.config.settings import Settings


def load_evf_segment_module(settings: Settings):
    script_path = (settings.executor_segment_script_path.parent / "segment_evf_sam2_json.py").resolve()
    evf_repo_path = script_path.parent / "EVF-SAM"
    if not script_path.exists():
        raise RuntimeError(f"Не найден script для SAM prompt: {script_path}")
    if not evf_repo_path.exists():
        raise RuntimeError(
            "SAM prompt недоступен: рядом со скриптами нет директории scripts_for_gen/EVF-SAM. "
            "Сейчас доступна только сегментация полигоном."
        )
    module_name = f"segment_evf_sam2_json_{abs(hash(script_path))}"
    cached = sys.modules.get(module_name)
    if cached is not None:
        return cached
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Не удалось загрузить модуль сегментации из {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def cleanup_prompt_segmenter(segmenter: object) -> None:
    model = getattr(segmenter, "model", None)
    if model is not None:
        try:
            model.to("cpu")
        except Exception:
            pass
    for attr in ("model", "tokenizer", "beit3_preprocess", "sam_preprocess"):
        if hasattr(segmenter, attr):
            try:
                delattr(segmenter, attr)
            except Exception:
                pass
    torch_module = sys.modules.get("torch")
    if torch_module is not None:
        try:
            torch_module.cuda.empty_cache()
        except Exception:
            pass
        try:
            torch_module.cuda.ipc_collect()
        except Exception:
            pass
    gc.collect()
