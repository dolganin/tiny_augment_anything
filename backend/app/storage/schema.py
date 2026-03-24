from __future__ import annotations


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY,
    workflow_stage text NOT NULL,
    dataset_id uuid NULL,
    current_dataset_version_id uuid NULL,
    selected_classes jsonb NOT NULL DEFAULT '[]'::jsonb,
    selected_class_targets jsonb NOT NULL DEFAULT '{}'::jsonb,
    current_mode text NULL,
    last_error jsonb NULL,
    last_download_path text NULL,
    revision bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name text NOT NULL,
    source_archive_path text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_versions (
    id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    version_index integer NOT NULL,
    parent_version_id uuid NULL REFERENCES dataset_versions(id) ON DELETE SET NULL,
    kind text NOT NULL,
    status text NOT NULL,
    manifest_path text NOT NULL,
    summary jsonb NOT NULL,
    created_by_task_id uuid NULL,
    created_at timestamptz NOT NULL,
    UNIQUE(dataset_id, version_index)
);

CREATE TABLE IF NOT EXISTS dataset_assets (
    id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    class_name text NOT NULL,
    origin_type text NOT NULL,
    storage_path text NOT NULL,
    preview_path text NULL,
    checksum text NULL,
    width integer NULL,
    height integer NULL,
    source_run_id uuid NULL,
    approved_at timestamptz NULL,
    approved_in_version_id uuid NULL REFERENCES dataset_versions(id) ON DELETE SET NULL,
    rejected_at timestamptz NULL,
    deleted_at timestamptz NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_asset_links (
    id uuid PRIMARY KEY,
    child_asset_id uuid NOT NULL REFERENCES dataset_assets(id) ON DELETE CASCADE,
    parent_asset_id uuid NOT NULL REFERENCES dataset_assets(id) ON DELETE CASCADE,
    relation_type text NOT NULL,
    position smallint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL,
    UNIQUE(child_asset_id, parent_asset_id, relation_type, position)
);

CREATE INDEX IF NOT EXISTS idx_dataset_asset_links_parent ON dataset_asset_links(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_asset_links_child ON dataset_asset_links(child_asset_id);

CREATE TABLE IF NOT EXISTS tasks (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    task_type text NOT NULL,
    status text NOT NULL,
    dataset_version_id uuid NULL REFERENCES dataset_versions(id) ON DELETE SET NULL,
    payload jsonb NOT NULL,
    result jsonb NULL,
    progress numeric(5,2) NULL,
    message text NULL,
    error jsonb NULL,
    heartbeat_at timestamptz NULL,
    created_at timestamptz NOT NULL,
    started_at timestamptz NULL,
    finished_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS task_events (
    id bigserial PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS augmentation_runs (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    mode text NOT NULL,
    dataset_version_id uuid NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    prompt text NULL,
    source_asset_id uuid NULL REFERENCES dataset_assets(id) ON DELETE SET NULL,
    config jsonb NOT NULL,
    target_count integer NOT NULL,
    generated_count integer NOT NULL DEFAULT 0,
    approved_count integer NOT NULL DEFAULT 0,
    rejected_count integer NOT NULL DEFAULT 0,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS classifier_runs (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dataset_version_id uuid NOT NULL REFERENCES dataset_versions(id) ON DELETE CASCADE,
    status text NOT NULL,
    model_key text NULL,
    class_names jsonb NULL,
    hparams jsonb NULL,
    pretrained_weights_path text NULL,
    checkpoints_dir text NULL,
    checkpoint_path text NULL,
    metrics jsonb NULL,
    created_at timestamptz NOT NULL,
    finished_at timestamptz NULL
);

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS selected_class_targets jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dataset_assets
ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL;

ALTER TABLE classifier_runs
ADD COLUMN IF NOT EXISTS model_key text NULL;

ALTER TABLE classifier_runs
ADD COLUMN IF NOT EXISTS class_names jsonb NULL;

ALTER TABLE classifier_runs
ADD COLUMN IF NOT EXISTS hparams jsonb NULL;

ALTER TABLE classifier_runs
ADD COLUMN IF NOT EXISTS pretrained_weights_path text NULL;

ALTER TABLE classifier_runs
ADD COLUMN IF NOT EXISTS checkpoints_dir text NULL;

ALTER TABLE classifier_runs
ADD COLUMN IF NOT EXISTS checkpoint_path text NULL;
"""
