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
    is_batch boolean NOT NULL DEFAULT false,
    batch_mode text NULL,
    target_count integer NOT NULL,
    generated_count integer NOT NULL DEFAULT 0,
    approved_count integer NOT NULL DEFAULT 0,
    rejected_count integer NOT NULL DEFAULT 0,
    status text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS augmentation_run_sources (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES augmentation_runs(id) ON DELETE CASCADE,
    source_asset_id uuid NOT NULL REFERENCES dataset_assets(id) ON DELETE CASCADE,
    area_points jsonb NULL,
    custom_prompt text NULL,
    position integer NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    generated_count integer NOT NULL DEFAULT 0,
    error_message text NULL,
    created_at timestamptz NOT NULL,
    started_at timestamptz NULL,
    finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_augmentation_run_sources_run ON augmentation_run_sources(run_id);
CREATE INDEX IF NOT EXISTS idx_augmentation_run_sources_asset ON augmentation_run_sources(source_asset_id);

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

CREATE TABLE IF NOT EXISTS modification_templates (
    id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    template_type text NOT NULL CHECK (template_type IN ('text', 'negative', 'selection', 'polygon')),
    name text NOT NULL,
    prompt_text text NULL,
    negative_prompt_text text NULL,
    polygon_points jsonb NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT valid_text_template CHECK (
        template_type != 'text' OR prompt_text IS NOT NULL
    ),
    CONSTRAINT valid_negative_template CHECK (
        template_type != 'negative' OR prompt_text IS NOT NULL
    ),
    CONSTRAINT valid_selection_template CHECK (
        template_type != 'selection' OR prompt_text IS NOT NULL
    ),
    CONSTRAINT valid_polygon_template CHECK (
        template_type != 'polygon' OR polygon_points IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_modification_templates_dataset ON modification_templates(dataset_id);
CREATE INDEX IF NOT EXISTS idx_modification_templates_type ON modification_templates(dataset_id, template_type);

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

ALTER TABLE augmentation_runs
ADD COLUMN IF NOT EXISTS is_batch boolean NOT NULL DEFAULT false;

ALTER TABLE augmentation_runs
ADD COLUMN IF NOT EXISTS batch_mode text NULL;

ALTER TABLE modification_templates
DROP CONSTRAINT IF EXISTS modification_templates_template_type_check;

ALTER TABLE modification_templates
ADD CONSTRAINT modification_templates_template_type_check
CHECK (template_type IN ('text', 'negative', 'selection', 'polygon'));

ALTER TABLE modification_templates
DROP CONSTRAINT IF EXISTS valid_negative_template;

ALTER TABLE modification_templates
ADD CONSTRAINT valid_negative_template CHECK (
    template_type != 'negative' OR prompt_text IS NOT NULL
);
"""
