# Repository Overview For Another LLM

## Purpose

This repository is a small monorepo for an image augmentation workflow around medical-image-like classification datasets.

It contains four main code areas:

1. `src/tiny_augment`
   Python training library for image classification with Hydra, timm, PyTorch, Albumentations, and MLflow.
2. `backend`
   Custom ASGI backend that manages datasets, workflow sessions, task state, review, exports, classifier runs, and orchestration through Redis/Postgres.
3. `frontend`
   React + Vite UI for dataset upload, class selection, model warm-up, modification, review, classifier training, and metrics.
4. `scripts_for_gen`
   Standalone ML scripts for segmentation, diffusion generation, and LoRA-style training around Z-Image/SAM-like pipelines.

This document intentionally skips non-code directories unless they affect how the code runs.

## High-Level Architecture

The product is structured as a workflow system rather than as a single training script.

Main runtime path:

1. User uploads a dataset archive in the frontend.
2. Backend stores session/dataset metadata in Postgres and files under `storage/tiny-augment`.
3. A core worker imports the dataset, creates assets and a first dataset version.
4. User selects target classes and optional target counts.
5. User optionally warms up diffusion runtime.
6. User launches modification/generation tasks.
7. Backend writes a run bundle as JSON/files under `runtime_dir/temp/runs/...`.
8. `ml-worker` reads that bundle and executes segmentation/generation scripts from `scripts_for_gen`.
9. Generated files are indexed back into dataset assets.
10. User reviews candidates and either loops back for more data or starts classifier training.
11. Backend prepares a train/val layout, then `ml-worker` launches `uv run do-finetune` against `src/tiny_augment`.
12. Metrics are read back and exposed to the UI.

Core infra choices:

- HTTP/WebSocket backend is handwritten ASGI, not FastAPI.
- Persistent state is in Postgres.
- Task queues and session events are in Redis.
- Large runtime state lives in the filesystem under `runtime_dir`.
- Long ML tasks are split between a lightweight `worker` and a GPU-oriented `ml-worker`.

## Root-Level Files That Matter

### `pyproject.toml`

Defines the Python package `tiny_augment`.

Important points:

- Python version is `>=3.10`.
- Includes training/runtime dependencies like `torch`, `torchvision`, `timm`, `albumentations`, `hydra-core`, `mlflow`, `psycopg`, `redis`, `uvicorn`.
- Exposes two console scripts:
  - `do-pretrain`
  - `do-finetune`

These scripts point into `src/tiny_augment/cli`.

### `docker-compose.yml`

Defines the dev/runtime topology:

- `frontend`: Vite dev server.
- `backend`: ASGI API server.
- `worker`: core orchestration worker.
- `ml-worker`: GPU-oriented worker for generation/classifier training.
- `postgres`
- `redis`

Important mount strategy:

- `backend`, `config`, `src`, and `scripts_for_gen` are mounted into containers.
- runtime storage is mounted from `./storage/tiny-augment` to `/big_data/augment_anything`.

### `config/app.yaml`

Central app config for backend/workers.

It defines:

- app bind settings
- runtime storage root
- Postgres DSN
- Redis DSN and queue names
- executor mode and script paths for generation/segmentation
- classifier pipeline root and `uv` binary

This file is how backend discovers `scripts_for_gen` and the local classifier training package.

### `README.md`

Documents only the training-library side of the repo, not the whole product stack.

It explains:

- expected `data/` layout for `pretrain` and `fine_tune`
- Hydra-driven training
- running `uv run do-pretrain` and `uv run do-finetune`

## Code Structure Summary

```text
src/tiny_augment/           reusable ML training package
backend/                    API server + workers + persistence layer
frontend/src/               React application
scripts_for_gen/            diffusion/segmentation/training scripts
config/app.yaml             backend runtime configuration
docker-compose.yml          full local stack
```

## `src/tiny_augment`: Training Library

This is a compact Python package for classifier training/fine-tuning.

### Internal layout

```text
src/tiny_augment/
  augmentations/
  cli/
  configs/
  dataset/
  model/
  train/
  utils.py
```

### `cli/`

Entry points used by `uv run do-pretrain` and `uv run do-finetune`.

#### `cli/pretrain.py`

Hydra entrypoint for pretraining.

Flow:

1. build dataloaders from Hydra config
2. build model from Hydra config
3. resolve device
4. instantiate optimizer and scheduler
5. create `Trainer`
6. optionally load a full checkpoint
7. start MLflow run
8. log config
9. train for configured epochs

#### `cli/fine_tune.py`

Similar to `pretrain.py`, but adds weight-loading logic:

- can load from a local checkpoint path
- can download checkpoint artifacts from MLflow by `run_id` + `artifact_path`

This is the entrypoint later invoked indirectly by backend classifier training.

### `train/trainer.py`

Core training loop class.

Responsibilities:

- optional `torch.compile`
- training and validation epoch loops
- mixed precision autocast with `bfloat16`
- cross-entropy loss
- optimizer/scheduler stepping
- checkpoint saving
- MLflow logging
- metric calculation

Logged metrics include:

- mean loss
- macro precision/recall/F1
- micro F1
- accuracy
- per-class precision/recall/F1

Checkpoint format includes:

- model state
- optimizer state
- scheduler state
- epoch
- best validation loss

It also writes `best_metrics.json` alongside the checkpoint.

### `dataset/`

Dataset assembly and sampling helpers.

#### `base_dataset.py`

`ISICDataset` wraps `torchvision.datasets.ImageFolder` and optionally adapts Albumentations through `AlbumentationsWrapper`.

Exposes:

- `samples`
- `labels`

So downstream code can build custom samplers.

#### `weighted_dataset.py`

Thin wrapper adding per-sample weights, used together with `WeightedRandomSampler`.

#### `sampler.py`

Provides:

- `make_balanced_sampler(dataset)`
- `make_weighted_sampler(dataset)`

`balanced` mode computes inverse-frequency class weights from dataset labels.

#### `builder.py`

Top-level dataloader factory used by Hydra.

It:

- builds train/val `ISICDataset`
- optionally loads a CSV of sample weights
- chooses sampler type:
  - `balanced`
  - `weighted`
  - or plain shuffle
- returns `(train_loader, valid_loader)`

This is the main entry point referenced by config files.

### `augmentations/`

Albumentations-based preprocessing.

#### `augmentations.py`

Defines `get_augmentations(img_size)`.

Returns a dict:

- `train`
- `val`

Training pipeline includes:

- flips / transpose
- brightness/contrast
- blur/noise
- distortions
- CLAHE
- hue/saturation changes
- affine transforms
- resize
- coarse dropout
- normalize
- `ToTensorV2`

#### `wrapper.py`

`AlbumentationsWrapper` adapts Albumentations API to the call signature expected by `ImageFolder`.

### `model/`

Classifier construction around timm.

#### `base_classifier.py`

`ISICClassifier`:

- creates a timm backbone
- configures output classes
- supports fine-tune modes:
  - `all`
  - `head`
  - `partial`

`partial` mode keeps only selected parameter prefixes trainable.

It also supports loading partially compatible checkpoints.

#### `builder.py`

Factory that builds `ISICClassifier` and moves it to the requested device.

### `configs/`

Hydra config tree for all training modes.

Contains:

- `pretrain.yaml`
- `fine_tune.yaml`
- `model/*.yaml`
- `dataloader/*.yaml`
- `optimizer/*.yaml`
- `scheduler/*.yaml`
- `logger/*.yaml`
- `train/train.yaml`

Important design:

- configs are compositional through Hydra defaults
- model presets include EdgeNeXt and EVA02 variants
- dataloader configs differ between pretrain and fine-tune
- logger configs target MLflow

Backend classifier runs later override many of these values at CLI level instead of editing files.

### `utils.py`

Small helpers:

- log Hydra config to MLflow
- extract MLflow run kwargs from config
- validate/resolve torch device

### What `src/tiny_augment` is and is not

It is:

- a reusable training stack for image classification
- designed to be driven by Hydra overrides
- used directly by backend classifier jobs

It is not:

- the main application backend
- aware of sessions, datasets, review, Redis, or Postgres

## `backend`: API, Persistence, Workers

The backend is the orchestration core of the product.

### Top-level backend entrypoints

#### `backend/app/asgi.py`

Defines the ASGI application object.

Main responsibilities:

- construct the router
- initialize runtime state during lifespan startup
- delegate HTTP and WebSocket requests
- convert `AppError` into JSON responses
- return 503 if startup failed

This file also declares all routes centrally by wiring handlers from `backend/app/api`.

#### `backend/worker.py`

Core worker loop for non-ML orchestration tasks.

It continuously dequeues tasks from the Redis core queue and dispatches to:

- dataset import
- fine-tune runtime preparation
- generation orchestration
- modification orchestration
- classifier orchestration

#### `backend/ml_worker.py`

GPU-oriented worker loop for heavy ML tasks.

It continuously dequeues tasks from the Redis ML queue and dispatches to:

- diffusion runtime preparation
- generation / modification execution
- classifier training execution

It also writes crash state back into filesystem bundles if a task crashes.

### `app/config/`

#### `settings.py`

Loads config from `APP_CONFIG_PATH` and environment.

Produces a `Settings` dataclass with:

- app bind params
- Postgres/Redis DSNs
- runtime directory
- queue names
- generator/segment script paths
- classifier pipeline root
- classifier validation ratio

This module is one of the most important glue layers in the repo.

### `app/runtime/`

Lightweight custom framework utilities.

#### `router.py`

Tiny regex-based router for HTTP and WebSocket paths.

#### `request.py`

Wraps ASGI scope/body into a convenient request object.

#### `response.py`

Helpers for:

- JSON responses
- text responses
- file streaming

#### `multipart.py`

Custom multipart parser used for uploads.

#### `errors.py`

Defines `AppError(status_code, message)`.

#### `logging.py`

Structured logging helpers.

### `app/storage/`

#### `postgres.py`

Minimal async DB wrapper using `psycopg.AsyncConnection`.

Provides:

- transactional connection context manager
- schema initialization

#### `schema.py`

Contains raw SQL schema creation.

Main tables:

- `sessions`
- `datasets`
- `dataset_versions`
- `dataset_assets`
- `dataset_asset_links`
- `tasks`
- `task_events`
- `augmentation_runs`
- `classifier_runs`

Conceptually:

- `sessions` track UI/workflow state
- `datasets` are logical projects
- `dataset_versions` are immutable-ish snapshots/manifests
- `dataset_assets` are original/generated/modified images
- `tasks` are long-running operations
- `augmentation_runs` track generation batches
- `classifier_runs` track classifier training metadata/results

### `app/domain/`

#### `enums.py`

Defines shared string enums:

- workflow stages
- workflow modes
- task statuses
- task types
- asset origins
- version kinds

These enums encode the product state machine.

### `app/repositories/`

This layer is pure persistence logic: SQL in, rows out.

Main modules:

#### `sessions.py`

Session lifecycle and snapshot persistence.

Key ideas:

- create pending/import sessions
- finalize session after import
- save selected classes and class targets
- return session snapshots used by frontend restoration

#### `datasets.py`

Dataset creation, version creation, asset insertion, stats, rename/status changes.

#### `tasks.py`

Task CRUD and state updates.

Important because the whole workflow uses explicit task rows with progress and errors.

#### `workflow_session.py`

Session-context queries and workflow-stage synchronization.

#### `workflow_assets.py`

Most complex repository in the backend.

Handles:

- approved asset lookup
- candidate asset creation
- asset-parent linking
- review approval/rejection
- version creation from reviewed state
- active asset listings
- version summaries and manifest path updates

This module is central to the “review and versioning” loop.

#### `workflow_runs.py`

Persistence for:

- augmentation runs
- classifier runs
- metrics retrieval

#### `catalog.py`

Dataset catalog queries for the home screen.

#### `job_queue.py`

Global jobs list and task cancellation.

### `app/services/`

This is the backend business-logic layer.

#### `bootstrap.py`

Bootstraps runtime resources:

- filesystem layout
- Postgres schema initialization
- Redis connections

Defines:

- `RuntimeState`
- `MLRuntimeState`

#### `filesystem.py`

Defines filesystem layout under `runtime_dir`.

Main runtime folders:

- `uploads`
- `datasets`
- `manifests`
- `temp`

And helpers like:

- `dataset_originals_dir`
- `dataset_generated_dir`
- `dataset_modified_dir`
- `dataset_exports_dir`

#### `uploads.py`

Large service for dataset upload and staged chunked upload.

Handles:

- upload initialization
- append chunk
- upload status
- archive finalization
- dataset import preparation
- archive extraction into originals storage
- manifest creation for initial dataset version
- classifier weights uploads

This module is the entry point for bringing files into the system.

#### `archive_layout.py`

Infers usable class/image layout from ZIP archives.

Important because uploads are not assumed to already have a strict single wrapper depth.

#### `catalog.py`

Transforms repository rows into dataset catalog behavior and operations like activate/rename/delete.

#### `sessions.py`

Adapts DB snapshots into API-facing session payloads and validates session IDs.

#### `configuration.py`

Generates default frontend generation configuration fields.

#### `queue.py`

Redis queue helpers for:

- enqueue/dequeue core tasks
- enqueue/dequeue ML tasks
- removing queued tasks on cancellation

#### `events.py`

Redis Pub/Sub helpers for per-session WebSocket events.

#### `jobs.py`

Builds global jobs payloads and handles global task cancellation.

#### `downloads.py`

Creates downloadable dataset archives from the current active dataset version.

#### `versioning.py`

Writes manifest files for dataset versions.

#### `zimage.py`

Filesystem bundle abstraction for generation/modification runs.

`ZImageRunBundle` points to files like:

- `manifest.json`
- `config.json`
- `state.json`
- `input.json`
- `segmented.json`
- `output.json`
- logs and output directories

This is the contract between core worker and `ml-worker`.

Also contains:

- record building from prompt/config/class pool
- segmentation command construction
- generation command construction
- subprocess execution helper
- result loading

#### `zimage_executor.py`

Bridges backend bundle logic to dynamically loaded segmentation/generation modules.

It prepares:

- polygon-based segmented input
- prompt-based segmented input
- actual generation result production

#### `diffusion_runtime.py`

Dynamic loader and runtime cache for diffusion scripts in `scripts_for_gen`.

Key design:

- loads Python modules by file path
- caches modules
- caches warmed generator runtime keyed by model/device/precision/lora/offload
- wraps generators for compatibility if pipeline APIs differ

This is how backend treats `scripts_for_gen` as pluggable executors.

#### `classifier_runtime.py`

Filesystem bundle abstraction for classifier training runs.

`ClassifierRunBundle` includes:

- train/val directories
- weights dir
- checkpoints dir
- state/config/metrics files
- stdout/stderr logs
- cancel signal

Also contains:

- train/val split analysis
- training layout materialization
- metrics discovery
- checkpoint discovery

Important rule in this module:

- validation is built only from original images
- synthetic images are allowed in train split

That is a key product decision.

#### `classifier_head_override.py`

Overrides model-building logic used during backend classifier runs.

The backend training command forces Hydra to use this target so it can control classifier-head behavior cleanly when class count changes.

### `app/api/`

HTTP and WebSocket handlers. Thin layer over services/repositories.

#### `session_handlers.py`

Handles:

- one-shot dataset upload
- staged/chunked dataset upload
- classifier weights upload
- session restoration
- class selection save

#### `workflow_handlers.py`

Main workflow API surface.

Handles:

- fine-tune start
- generation config
- generation start
- modification source fetch
- modification start
- generation/review results
- per-task status
- task cancellation
- classifier training start
- workflow state sync
- metrics
- classifier summary

This is the most important API module for the frontend workflow.

#### `review_handlers.py`

Approve/reject assets and finalize review stage.

#### `dataset_handlers.py`

Class distribution stats.

#### `catalog_handlers.py`

Dataset catalog list, activation, rename, delete.

#### `download_handlers.py`

Dataset export download.

#### `jobs_handlers.py`

Global jobs list/cancel.

#### `assets_handlers.py`

Streams files by internal relative path.

Frontend image URLs use this route.

#### `ws_handlers.py`

Per-session WebSocket stream backed by Redis Pub/Sub.

### `app/workers/`

Task execution logic split by task type.

#### `shared.py`

Shared helpers for:

- emitting task/session events
- completion/failure/cancel notifications
- cancellation checks
- checksums and archive export helpers

#### `import_dataset.py`

Runs prepared dataset import and updates task/session state.

#### `fine_tune.py`

This is not classifier fine-tuning.

It means “warm diffusion runtime in advance” so later modification starts faster.

#### `generation.py`

Core-side generation/modification orchestration.

Responsibilities:

- validate session and task context
- choose source/template asset
- build class pool
- create augmentation run row
- prepare `ZImageRunBundle`
- enqueue ML task
- watch bundle `state.json`
- index generated files back into `dataset_assets`
- advance session to review

#### `ml_generation.py`

ML-side execution of generation/modification.

Responsibilities:

- optionally run segmentation
- warm diffusion runtime
- call generation executor
- stream progress into `state.json`
- support stub mode

#### `classifier.py`

Core-side classifier orchestration.

Responsibilities:

- gather active assets
- analyze whether split is valid
- create `ClassifierRunBundle`
- materialize train/val folders
- enqueue ML classifier task
- monitor `state.json`
- read metrics
- finish classifier run
- prepare dataset export archive
- advance workflow to metrics

#### `ml_classifier.py`

ML-side classifier execution.

Responsibilities:

- read bundle config
- build `uv run do-finetune ...` command with Hydra overrides
- validate environment
- spawn subprocess in the classifier project root
- parse stdout/stderr for epoch progress
- write compact runtime progress to `state.json`
- surface errors and final metrics

This is the module that directly bridges product workflow to `src/tiny_augment`.

## `frontend/src`: React UI

The frontend is a workflow-oriented SPA.

### Internal layout

```text
frontend/src/
  app/
  features/
  pages/
  shared/
  store/
```

### `main.tsx` and `app/`

#### `main.tsx`

Mounts the React app and global CSS.

#### `app/App.tsx`

Wraps the router in application providers.

#### `app/providers/AppProviders.tsx`

Sets up:

- `BrowserRouter`
- React Query provider
- session bootstrap

#### `app/providers/SessionBootstrap.tsx`

On app load:

- restores session state from backend if a persisted `sessionId` exists
- resets local state if restore fails with 404/5xx

#### `app/router/AppRouter.tsx`

Encodes frontend navigation rules from current session state.

Routes exposed in practice:

- datasets/home
- upload
- dataset stats
- fine-tune warmup
- modify
- review
- classifier train
- metrics

Although `ModeSelectPage` and `GeneratePage` exist in code, the actual router currently drives the workflow toward modification-oriented flow.

#### `app/router/ProtectedRoute.tsx`

Simple hydration-aware route guard based on Zustand state.

### `store/`

#### `store/session/session.store.ts`

Main client-side workflow state.

Tracks:

- current session and dataset IDs
- selected classes and per-class targets
- generation config
- active job IDs
- reviewed assets
- classifier logs
- metrics
- workflow stage

This store is persisted via Zustand `persist`, so sessions survive page reloads.

#### `store/workspace/workspace.store.ts`

Tiny UI-only store for jobs drawer visibility.

### `shared/api/`

API client layer.

#### `workflow.api.ts`

All backend calls in one place.

Covers:

- catalog
- jobs
- upload init/chunk/complete
- session restore
- stats
- class selection
- workflow sync
- fine-tune start
- generation/modification
- review approve/reject/finalize
- classifier training
- classifier weights upload
- metrics

#### `workflow.hooks.ts`

React Query wrappers for `workflow.api.ts`.

Encodes:

- polling intervals
- enabled/disabled conditions
- mutation helpers

#### `workflow.socket.ts`

Shared WebSocket connection manager by `sessionId`.

Features:

- singleton connection reuse per session
- reconnect with backoff
- delayed close on idle
- runtime event schema validation

#### `contracts.ts`

Zod schemas for backend payloads and socket events.

#### `adapters.ts`

Transforms backend DTOs into UI-facing objects:

- converts file paths to `/api/assets?path=...` URLs
- normalizes workflow stages
- adapts metrics/catalog/results payloads

#### `http.ts`, `endpoints.ts`, `env.ts`

Base Axios client, endpoint builders, and runtime API/WS URL resolution.

### `shared/types/`

#### `workflow.ts`

Frontend canonical workflow types:

- stages
- mode
- dataset stats
- generation assets
- metrics
- catalog items
- global jobs

### `shared/lib/`

Utility layer.

Important modules:

- `upload-runtime.ts`
  resumable dataset chunk upload logic
- `upload-session-storage.ts`
  persistence of upload session across reloads
- `classifier-weights-upload-runtime.ts`
  resumable classifier weights upload
- `classifier-weights-upload-storage.ts`
  persistence for weights upload state
- `get-error-message.ts`
  normalizes error extraction
- `logger.ts`
  frontend logging helper

### `shared/ui/`

Reusable UI primitives/layouts.

Main files:

- `buttons/Button.tsx`
- `feedback/Modal.tsx`
- `feedback/Spinner.tsx`
- `layouts/AppShell.tsx`
- `layouts/PageFrame.tsx`
- `layouts/NotFoundPage.tsx`

`AppShell` is important because it:

- renders the workflow sidebar
- shows active dataset info
- shows recent jobs
- allows job cancellation

### `pages/`

Workflow screens.

#### `pages/home/HomePage.tsx`

Project catalog entry screen.

Combines:

- `DatasetCatalog`
- compact `DatasetUploadPanel`

Can open existing datasets or create new ones.

#### `pages/upload/UploadPage.tsx`

Dedicated upload screen with full upload panel.

#### `pages/dataset-stats/DatasetStatsPage.tsx`

Displays class histogram and lets user pick classes plus target counts.

After successful selection, moves workflow to fine-tune warmup page.

#### `pages/fine-tune/FineTunePage.tsx`

UI for optional diffusion runtime warm-up.

Important nuance:

- this does not train a classifier
- it triggers backend task `fine-tune` meaning “prepare diffusion runtime”

Logs are collected from WebSocket or fallback polling.

#### `pages/modify/ModifyPage.tsx`

Main synthetic data creation page.

Contains:

- prompt input
- generation config fields
- source image selection
- polygon area selection for inpainting
- task log stream
- review integration

This is the main operational page in current workflow.

#### `pages/review/ReviewPage.tsx`

Wraps `ReviewWorkspace` and lets the user either:

- return to modification
- or move to classifier training

#### `pages/classifier-train/ClassifierTrainPage.tsx`

Classifier launch page.

Supports:

- choosing model preset
- setting hyperparameters
- uploading custom pretrained weights
- resuming interrupted weights upload
- reusing previously produced model weights

#### `pages/metrics/MetricsPage.tsx`

Final page for classifier progress and per-class metrics.

Shows:

- classifier logs while training is active
- precision and recall charts when metrics are ready

#### `pages/mode-select/ModeSelectPage.tsx`

Mode picker between generation and modification.

This file still exists, but the main router currently does not expose it in the active route graph.

#### `pages/generate/GeneratePage.tsx`

Separate generation page exists in the repository but is not part of the currently wired routing flow shown in `AppRouter`.

### `features/`

Reusable workflow components.

#### `dataset-upload/DatasetUploadPanel.tsx`

Large, stateful upload component.

Handles:

- resumable chunked upload
- restoring unfinished uploads from local persistence
- monitoring import task
- exposing temporary “pending project” cards to the home screen

#### `dataset-library/DatasetCatalog.tsx`

Project cards, rename/delete/download actions, active dataset indicator.

#### `dataset-stats/ClassDistributionChart.tsx`

Interactive class histogram with per-class target-count inputs.

#### `fine-tune-training/TrainingLogPanel.tsx`

Generic scrolling log panel reused for both warm-up and classifier training.

#### `generation-config/GenerationConfigFields.tsx`

Renders backend-provided config fields dynamically.

#### `modification/ModificationCanvas.tsx`

Interactive polygon editor over the source image.

Outputs image-space coordinates used as `areaPoints` for segmentation/inpainting.

#### `generation-review/ReviewWorkspace.tsx`

Loads current review queue and performs approve/reject actions.

Uses:

- `ReviewQueue`
- backend approve/reject mutations

#### `generation-review/ReviewQueue.tsx`

Dialog-like UI for inspecting one synthetic candidate at a time, with class references and gallery of current batch.

#### `classifier-metrics/MetricsChart.tsx`

Simple bar chart for precision/recall.

#### `job-queue/JobsDrawer.tsx`

Global jobs panel.

## `scripts_for_gen`: External ML Executors

These scripts are not a separate service; they are loaded or called by `backend/ml-worker`.

### Internal layout

```text
scripts_for_gen/
  generate_zimage_json.py
  segment_sam2_json.py
  segment_evf_sam2_json.py
  train.py
  utils.py
  train.yaml
```

### `utils.py`

Small cross-script helpers:

- choose device
- choose dtype
- sanitize file stems
- resolve paths relative to JSON location

### `generate_zimage_json.py`

CLI script that reads an input JSON list and produces generated images plus output JSON.

Supports:

- img2img mode
- inpainting mode if masks are present
- model/device/precision selection
- LoRA injection
- offload modes
- default generation hyperparameters

It defines `ZImageGenerator`, and backend runtime code dynamically imports this class.

### `segment_sam2_json.py`

CLI script for segmentation with Hugging Face SAM2.

Input can describe:

- polygon area points
- bounding box
- SAM points/labels
- SAM box

Outputs:

- `mask_path`
- `mask_paths`

This is the default segmentation script referenced in `config/app.yaml`.

### `segment_evf_sam2_json.py`

Alternative prompt-driven segmentation script using EVF-SAM2.

This script expects text prompts and integrates a cloned EVF-SAM repository locally.

It exists as an alternative segmentation path but is not the default one referenced by app config.

### `train.py`

Separate LoRA-style training script for Z-Image pipelines.

This is distinct from classifier training.

It:

- reads a config YAML
- loads source/target image pairs with prompts
- trains LoRA adapters on a Z-Image img2img pipeline
- evaluates with image metrics like FID, LPIPS, SSIM, PSNR

This script does not appear to be the main path used by the web app today, but it is part of the repository’s ML experimentation/tooling area.

## Runtime Filesystem Contract

A lot of backend behavior depends on the runtime filesystem layout under `storage/tiny-augment` or whatever `runtime_dir` resolves to.

Main folders:

- `datasets/<dataset_id>/originals`
- `datasets/<dataset_id>/generated`
- `datasets/<dataset_id>/modified`
- `datasets/<dataset_id>/exports`
- `manifests/<dataset_id>`
- `uploads/<session_id>`
- `temp/uploads/<upload_id>`
- `temp/runs/zimage/<task_id>`
- `temp/runs/classifier/<task_id>`

Important design point:

- backend and workers communicate through both DB/Redis and filesystem bundles
- `state.json` files inside run directories are used as machine-readable progress channels

## Task Flow By Type

### Dataset import

Frontend upload -> `session_handlers` -> `uploads.py` -> `tasks` row -> core queue -> `workers/import_dataset.py` -> archive extraction -> dataset/assets/version rows.

### Diffusion warm-up

Frontend fine-tune page -> `workflow_handlers.start_fine_tune` -> core queue -> `workers/fine_tune.py` -> ML queue -> `workers/ml_generation.py` with `diffusion.prepare_weights`.

### Modification/generation

Frontend modify/generate page -> `workflow_handlers` -> task row -> core queue -> `workers/generation.py` -> filesystem run bundle -> ML queue -> `workers/ml_generation.py` -> generated files -> assets indexed -> review stage.

### Review and versioning

Frontend approve/reject/finalize -> `review_handlers` -> repository updates in `workflow_assets.py` -> new dataset version / active state update.

### Classifier training

Frontend classifier page -> `workflow_handlers.start_classifier_training` -> core queue -> `workers/classifier.py` -> train/val layout in temp run dir -> ML queue -> `workers/ml_classifier.py` -> `uv run do-finetune` in project root -> metrics back to backend.

## Important Terminology

- `fine-tune` in UI/backend task naming often means diffusion runtime warm-up, not classifier fine-tuning.
- `classifier` is the image-classification training pipeline built on `src/tiny_augment`.
- `review` is the step where generated/modified candidates become approved assets and can later influence dataset versions.
- `session` is the UI workflow state container.
- `dataset version` is the backend snapshot/manfiest unit for current approved dataset state.

## What To Read First If You Need To Modify Behavior

If the target is:

- upload/import flow:
  - `backend/app/api/session_handlers.py`
  - `backend/app/services/uploads.py`
  - `backend/app/repositories/datasets.py`
- review/versioning:
  - `backend/app/api/review_handlers.py`
  - `backend/app/repositories/workflow_assets.py`
- generation/modification:
  - `frontend/src/pages/modify/ModifyPage.tsx`
  - `backend/app/api/workflow_handlers.py`
  - `backend/app/workers/generation.py`
  - `backend/app/workers/ml_generation.py`
  - `backend/app/services/zimage.py`
- classifier training:
  - `frontend/src/pages/classifier-train/ClassifierTrainPage.tsx`
  - `backend/app/workers/classifier.py`
  - `backend/app/workers/ml_classifier.py`
  - `backend/app/services/classifier_runtime.py`
  - `src/tiny_augment/cli/fine_tune.py`
  - `src/tiny_augment/train/trainer.py`
- routing/navigation:
  - `frontend/src/app/router/AppRouter.tsx`
  - `frontend/src/shared/types/workflow.ts`
  - `frontend/src/store/session/session.store.ts`

## Short Bottom Line

This repository is best understood as a workflow product around dataset augmentation:

- backend owns state, task orchestration, persistence, and filesystem bundles
- frontend owns the human workflow through upload -> stats -> warm-up -> modify -> review -> classifier -> metrics
- `scripts_for_gen` owns diffusion/segmentation executors
- `src/tiny_augment` owns classifier training

The backend is the hub that connects all other pieces.
