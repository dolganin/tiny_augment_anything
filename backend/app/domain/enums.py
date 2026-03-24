from __future__ import annotations

from enum import StrEnum


class WorkflowStage(StrEnum):
    UPLOAD = "upload"
    DATASET_STATS = "dataset-stats"
    GENERATE = "generate"
    MODIFY = "modify"
    REVIEW = "review"
    CLASSIFIER_TRAIN = "classifier-train"
    METRICS = "metrics"


class TaskStatus(StrEnum):
    IDLE = "idle"
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"
    CANCELLED = "cancelled"


class TaskType(StrEnum):
    IMPORT = "import"
    SELECT_CLASSES = "select-classes"
    GENERATION = "generation"
    MODIFICATION = "modification"
    CLASSIFIER = "classifier"


class AssetOrigin(StrEnum):
    ORIGINAL = "original"
    GENERATED = "generated"
    MODIFIED = "modified"


class VersionKind(StrEnum):
    IMPORT = "import"
    REVIEW_SAVE = "review-save"
    AUTO_SAVE = "auto-save"
    ROLLBACK = "rollback"
