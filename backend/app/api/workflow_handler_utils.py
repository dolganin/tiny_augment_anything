from __future__ import annotations

from pathlib import Path
from uuid import UUID
from uuid import uuid4

from backend.app.runtime.errors import AppError
from backend.app.runtime.multipart import parse_multipart_form
from backend.app.runtime.request import Request
from backend.app.services.bootstrap import RuntimeState
from backend.app.services.filesystem import make_relative_path


CLASSIFIER_MODEL_KEYS = {"EdgeNeXt_finetune", "EVA02-small_finetune"}


def require_runtime_state(state: object) -> RuntimeState:
    if not isinstance(state, RuntimeState):
        raise RuntimeError("Runtime state is not available")
    return state


def parse_task_id(raw_task_id: str) -> UUID:
    try:
        return UUID(raw_task_id)
    except ValueError as error:
        raise AppError(400, "Некорректный taskId.") from error


def parse_classifier_payload(
    request: Request,
    runtime_state: RuntimeState,
    session_id: UUID,
) -> dict:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = parse_multipart_form(request.body, content_type)
        raw_payload = form.fields
        weights_file = next((item for item in form.files if item.field_name == "weights"), None)
    else:
        payload = request.json()
        if payload is None:
            payload = {}
        if not isinstance(payload, dict):
            raise AppError(400, "Некорректное тело classifier request.")
        raw_payload = payload
        weights_file = None

    model_key = str(raw_payload.get("modelKey") or "EdgeNeXt_finetune")
    if model_key not in CLASSIFIER_MODEL_KEYS:
        raise AppError(400, "Некорректный modelKey для классификатора.")

    hparams = {
        "train_batch_size": parse_positive_int(raw_payload.get("trainBatchSize"), "trainBatchSize", 32),
        "val_batch_size": parse_positive_int(raw_payload.get("valBatchSize"), "valBatchSize", 64),
        "learning_rate": parse_positive_float(raw_payload.get("learningRate"), "learningRate", 3e-4),
        "weight_decay": parse_non_negative_float(raw_payload.get("weightDecay"), "weightDecay", 1e-6),
        "epochs": parse_positive_int(raw_payload.get("epochs"), "epochs", 10),
    }

    pretrained_weights_path = resolve_pretrained_weights_path(
        runtime_state,
        session_id,
        raw_payload.get("pretrainedWeightsPath"),
    )
    if weights_file is not None and weights_file.file_name:
        weights_dir = runtime_state.runtime_paths.temp / "classifier-weights" / str(session_id)
        weights_dir.mkdir(parents=True, exist_ok=True)
        target_path = weights_dir / f"{uuid4()}_{weights_file.file_name}"
        target_path.write_bytes(weights_file.data)
        pretrained_weights_path = make_relative_path(
            runtime_state.settings.runtime_dir,
            target_path,
        )

    return {
        "modelKey": model_key,
        "hparams": hparams,
        "pretrainedWeightsPath": pretrained_weights_path,
    }


def resolve_pretrained_weights_path(
    runtime_state: RuntimeState,
    session_id: UUID,
    raw_path: object,
) -> str | None:
    if raw_path is None or raw_path == "":
        return None
    if not isinstance(raw_path, str):
        raise AppError(400, "pretrainedWeightsPath должен быть строкой.")
    candidate = (runtime_state.settings.runtime_dir / Path(raw_path)).resolve()
    allowed_roots = [
        (runtime_state.runtime_paths.temp / "classifier-weights" / str(session_id)).resolve(),
        (runtime_state.runtime_paths.temp / "runs" / "classifier").resolve(),
    ]
    if not any(is_within(candidate, root) for root in allowed_roots):
        raise AppError(400, "pretrainedWeightsPath не принадлежит разрешённому classifier storage.")
    if not candidate.exists():
        raise AppError(400, "Файл предобученных весов не найден.")
    return make_relative_path(runtime_state.settings.runtime_dir, candidate)


def is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def parse_positive_int(raw_value: object, field_name: str, default: int) -> int:
    if raw_value is None or raw_value == "":
        return default
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as error:
        raise AppError(400, f"Поле {field_name} должно быть целым числом.") from error
    if value <= 0:
        raise AppError(400, f"Поле {field_name} должно быть положительным.")
    return value


def parse_positive_float(raw_value: object, field_name: str, default: float) -> float:
    if raw_value is None or raw_value == "":
        return default
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as error:
        raise AppError(400, f"Поле {field_name} должно быть числом.") from error
    if value <= 0:
        raise AppError(400, f"Поле {field_name} должно быть положительным.")
    return value


def parse_non_negative_float(raw_value: object, field_name: str, default: float) -> float:
    if raw_value is None or raw_value == "":
        return default
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as error:
        raise AppError(400, f"Поле {field_name} должно быть числом.") from error
    if value < 0:
        raise AppError(400, f"Поле {field_name} не должно быть отрицательным.")
    return value


def is_valid_class_targets(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    for class_name, count in value.items():
        if not isinstance(class_name, str) or not class_name:
            return False
        if not isinstance(count, int) or count <= 0:
            return False
    return True
