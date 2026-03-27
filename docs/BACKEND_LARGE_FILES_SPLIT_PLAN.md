# План дробления крупных backend-файлов

## 1. Цель

Зафиксировать безопасную схему разрезания оставшихся крупных backend-файлов так, чтобы:

- не ломать API и worker-контракты
- сохранять существующие import paths через facade/re-export там, где это выгодно
- дробить по доменным seams, а не произвольно по числу строк

Актуальные крупные backend-файлы:

1. `backend/app/repositories/workflow_assets.py` — `512`
2. `backend/app/workers/ml_classifier.py` — `497`
3. `backend/app/workers/ml_generation.py` — `462`
4. `backend/app/services/zimage_executor.py` — `365`
5. `backend/app/services/diffusion_runtime.py` — `362`
6. `backend/app/workers/generation.py` — `337`

## 2. Общий принцип дробления backend

- Сначала выделять helpers и поддомены, потом оставлять старый entrypoint как facade.
- Для `workers/*` разделять:
  - payload / bundle loading
  - runtime orchestration
  - stdout/stderr/progress parsing
  - terminal state / error handling
- Для `repositories/*` разделять:
  - query groups по use-case
  - mutation groups по lifecycle
  - summary/manifest helpers отдельно
- Для `services/*` разделять:
  - external script/runtime loading
  - pure normalization/conversion helpers
  - heavy execution flow

## 3. `workflow_assets.py`

### 3.1 Что сейчас смешано

В одном файле живут разные группы запросов:

- source selection / lookup:
  - `get_random_approved_asset`
  - `list_modification_source_assets`
  - `find_asset_by_storage_path`
  - `find_asset_by_id`
- candidate creation / lineage:
  - `create_candidate_asset`
  - `create_asset_link`
- review:
  - `get_asset_for_review`
  - `mark_asset_approved`
  - `reject_asset`
  - `finalize_review_decisions`
- versioning:
  - `create_version_from_current_state`
  - `update_version_manifest_path`
- read models:
  - `list_class_reference_preview_paths`
  - `list_active_assets`
  - `list_active_assets_with_origin`
  - `build_version_summary`

### 3.2 Целевая структура

```text
backend/app/repositories/
  workflow_assets.py
  workflow_asset_queries.py
  workflow_asset_mutations.py
  workflow_review_repository.py
  workflow_version_repository.py
```

### 3.3 Как резать

#### `workflow_asset_queries.py`

Вынести:

- `get_random_approved_asset`
- `list_modification_source_assets`
- `find_asset_by_storage_path`
- `find_asset_by_id`
- `list_class_reference_preview_paths`
- `list_active_assets`
- `list_active_assets_with_origin`
- `build_version_summary`

#### `workflow_asset_mutations.py`

Вынести:

- `create_candidate_asset`
- `create_asset_link`
- `reject_asset`

#### `workflow_review_repository.py`

Вынести review-specific lifecycle:

- `get_asset_for_review`
- `mark_asset_approved`
- `finalize_review_decisions`

#### `workflow_version_repository.py`

Вынести:

- `create_version_from_current_state`
- `update_version_manifest_path`

#### `workflow_assets.py`

Оставить как facade с re-export, чтобы не менять сразу все imports в workers/services.

## 4. `ml_classifier.py`

### 4.1 Что сейчас смешано

- основной orchestration `execute_classifier_training`
- stdout/stderr consumers
- command building
- environment preflight
- state/log formatting helpers
- progress parsing regex-based logic

### 4.2 Целевая структура

```text
backend/app/workers/
  ml_classifier.py
  ml_classifier_runtime.py
  ml_classifier_io.py
  ml_classifier_logs.py
```

### 4.3 Как резать

#### `ml_classifier_runtime.py`

Вынести:

- `_build_command`
- `_validate_classifier_environment`
- `_load_json_dict`
- `_read_log_tail`

#### `ml_classifier_logs.py`

Вынести:

- regex constants
- `_write_runtime_line`
- `_extract_log_chunks`
- `_build_epoch_progress_message`
- `_clean_runtime_message`
- `_consume_stdout`
- `_consume_stderr`

#### `ml_classifier_io.py`

Если после первых двух шагов orchestration всё ещё тяжёлый:

- helpers для writing terminal/running states
- small wrappers над `write_state`/metrics loading

#### `ml_classifier.py`

Оставить только:

- `execute_classifier_training`
- тонкую сборку env и wiring между runtime/log modules

## 5. `ml_generation.py`

### 5.1 Что сейчас смешано

- entrypoint `execute_ml_generation`
- основной run flow `_run_generation`
- stub flow `_run_stub`
- progress/state publishing
- json readers / terminal state helpers

### 5.2 Целевая структура

```text
backend/app/workers/
  ml_generation.py
  ml_generation_runtime.py
  ml_generation_progress.py
  ml_generation_stub.py
```

### 5.3 Как резать

#### `ml_generation_runtime.py`

Вынести тяжелый run flow:

- `_run_generation`

#### `ml_generation_stub.py`

Вынести:

- `_run_stub`

#### `ml_generation_progress.py`

Вынести:

- `_write_progress`
- `_is_cancelled`
- `_write_terminal_state`
- `_load_json_dict`
- `_load_json_list`

#### `ml_generation.py`

Оставить:

- `execute_ml_generation`
- минимальную диспетчеризацию real/stub execution

## 6. `zimage_executor.py`

### 6.1 Что сейчас смешано

- polygon-based input prep
- prompt-based segmentation prep
- actual result generation
- value normalization helpers
- EVF segmenter loading/cleanup

### 6.2 Целевая структура

```text
backend/app/services/
  zimage_executor.py
  zimage_inputs.py
  zimage_generation.py
  zimage_segmenter.py
```

### 6.3 Как резать

#### `zimage_inputs.py`

Вынести:

- `prepare_polygon_segmented_input`
- `prepare_prompt_segmented_input`
- `_normalize_area_points`
- `_as_int`
- `_as_float`
- `_as_bool`

#### `zimage_segmenter.py`

Вынести:

- `_load_evf_segment_module`
- `_cleanup_prompt_segmenter`

#### `zimage_generation.py`

Вынести:

- `generate_results`
- `_load_json_list`

#### `zimage_executor.py`

Оставить facade/re-export.

## 7. `diffusion_runtime.py`

### 7.1 Что сейчас смешано

- protocol/type definitions
- runtime key/cache model
- warm/preload/release lifecycle
- script module loading
- config normalization helpers

### 7.2 Целевая структура

```text
backend/app/services/
  diffusion_runtime.py
  diffusion_runtime_types.py
  diffusion_runtime_cache.py
  diffusion_module_loader.py
```

### 7.3 Как резать

#### `diffusion_runtime_types.py`

Вынести:

- `DiffusionGenerator`
- `GenerateModule`
- `SegmentModule`
- `DiffusionRuntimeKey`
- `WarmedDiffusionRuntime`
- `CompatibleDiffusionGenerator`

#### `diffusion_module_loader.py`

Вынести:

- `load_generate_module`
- `load_segment_module`
- `_load_module`
- `_as_float`
- `_as_offload`
- `_is_cross_attention_kwargs_error`

#### `diffusion_runtime_cache.py`

Вынести:

- `warm_diffusion_runtime`
- `preload_diffusion_pipe`
- `release_warm_diffusion_runtime`
- `release_all_diffusion_runtimes`

#### `diffusion_runtime.py`

Оставить facade, чтобы не ломать imports в workers.

## 8. `generation.py`

### 8.1 Что сейчас смешано

- top-level generation worker orchestration
- dispatch to ML worker
- waiting for ML result
- indexing generated results
- payload normalization/parsing helpers

### 8.2 Целевая структура

```text
backend/app/workers/
  generation.py
  generation_dispatch.py
  generation_indexing.py
  generation_payloads.py
```

### 8.3 Как резать

#### `generation_dispatch.py`

Вынести:

- `_dispatch_ml_generation`
- `_wait_for_ml_result`

#### `generation_indexing.py`

Вынести:

- `_index_generated_results`
- `_build_class_pool`

#### `generation_payloads.py`

Вынести:

- `_parse_asset_id`
- `_parse_area_points`
- `_parse_class_targets`

#### `generation.py`

Оставить:

- `run_generation`
- wiring между payload parsing, dispatch и indexing

## 9. Порядок дальнейших коммитов

Рекомендуемый порядок:

1. `refactor(frontend): split dataset upload panel`
2. `refactor(backend): split workflow asset repository`
3. `refactor(backend): split ml classifier worker`
4. `refactor(backend): split ml generation worker`
5. `refactor(backend): split zimage executor service`
6. `refactor(backend): split diffusion runtime service`
7. `refactor(backend): split generation worker`

## 10. Что не делать

- Не менять SQL-контракты и schema одновременно с разрезанием repository-файлов.
- Не менять bundle format в ML-worker в тех же коммитах, где идёт только decomposition.
- Не переносить бизнес-логику между backend core worker и ml-worker без отдельного плана.
- Не смешивать typing cleanup с structural split в одном коммите.

## 11. Ожидаемый результат

После выполнения плана:

- каждый remaining large file будет либо разрезан ниже `300`, либо останется только фасадом/re-export
- orchestration entrypoints останутся легко читаемыми
- imports и публичные контракты можно будет мигрировать постепенно, без “big bang” рефактора
