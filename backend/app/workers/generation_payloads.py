from __future__ import annotations

from uuid import UUID
from uuid import UUID as UUIDType


def build_class_pool(
    context: dict,
    template_class_name: str | None,
    class_targets: dict[str, int] | None = None,
) -> list[str]:
    if class_targets:
        pool: list[str] = []
        for class_name, count in class_targets.items():
            pool.extend([class_name] * count)
        return pool

    context_targets = parse_class_targets(context.get("selected_class_targets"))
    if context_targets:
        pool: list[str] = []
        for class_name, count in context_targets.items():
            pool.extend([class_name] * count)
        return pool

    selected_classes = context["selected_classes"] if isinstance(context["selected_classes"], list) else []
    resolved = [str(item) for item in selected_classes if isinstance(item, str)]
    if resolved:
        return resolved
    return [template_class_name] if template_class_name else []


def parse_asset_id(value: object) -> UUIDType | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def parse_area_points(value: object) -> list[list[float]] | None:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) < 3:
        return None
    parsed: list[list[float]] = []
    for point in value:
        if not isinstance(point, list) or len(point) != 2:
            return None
        x, y = point
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            return None
        parsed.append([float(x), float(y)])
    return parsed


def parse_class_targets(value: object) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    parsed: dict[str, int] = {}
    for class_name, count in value.items():
        if not isinstance(class_name, str) or not class_name:
            continue
        if not isinstance(count, int) or count <= 0:
            continue
        parsed[class_name] = count
    return parsed
