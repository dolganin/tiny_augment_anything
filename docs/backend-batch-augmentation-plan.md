# План batch-аугментации для бэкенда

## Проблема

**Текущая ситуация:**
- Для каждой картинки нужно вручную задавать промпт и маску
- Это долго и утомительно
- Но если давать всем одинаковое - может получиться хрень (разные композиции требуют разных масок)
- Хочется: поставить пачку аугментаций, потом ревьюить результаты

**Желаемое:**
- Возможность задать промпт + маску
- Выбрать картинки, к которым это применить
- Запустить batch генерацию
- Потом просто отбирать где удалось

---

## Рассуждения о подходах

### Подход 1: Шаблоны модификации (Modification Templates)

**Концепция:**
Пользователь создает переиспользуемые "шаблоны модификации":
- Название шаблона (например, "Add sunglasses")
- Промпт
- Маска (polygon или SAM prompt)
- Параметры генерации (strength, steps, etc.)

Потом применяет шаблон к набору картинок.

**Пример workflow:**
```
1. Создать шаблон "Add hat":
   - Промпт: "add a stylish hat"
   - Negative: "blurry, distorted"
   - Маска: верхняя часть головы (polygon)
   - Strength: 0.7

2. Выбрать 20 картинок класса "person"

3. Применить шаблон "Add hat" ко всем 20 картинкам

4. Получить ~100 вариаций (по 5 на каждую картинку)

5. Отбирать в review
```

**Плюсы:**
- Переиспользование шаблонов (библиотека модификаций)
- Явное управление
- Можно создать набор проверенных шаблонов

**Минусы:**
- Нужна дополнительная таблица в БД
- Усложняет UI (нужен экран управления шаблонами)
- Маска может не подходить для всех картинок (разные композиции)

**База данных:**
```sql
CREATE TABLE modification_templates (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL,
    name text NOT NULL,
    prompt text NOT NULL,
    negative_prompt text NULL,
    sam_prompt text NULL,
    area_points jsonb NULL, -- normalized coordinates
    config jsonb NOT NULL,
    created_at timestamptz NOT NULL
);
```

---

### Подход 2: Batch с автоадаптацией масок

**Концепция:**
Пользователь задает промпт + маску на одной референсной картинке.
Система автоматически адаптирует маску для других картинок:
- Или использует те же нормализованные координаты
- Или пытается найти семантически похожую область (через SAM)

**Пример workflow:**
```
1. Выбрать референсную картинку
2. Нарисовать маску на области "очки"
3. Промпт: "replace glasses with sunglasses"
4. Выбрать 15 других картинок с людьми в очках
5. Система:
   - Пытается найти очки на каждой картинке (через SAM + визуальное сходство)
   - Применяет маску к найденной области
   - Генерирует результаты
6. Review
```

**Плюсы:**
- Умная адаптация
- Не нужно вручную рисовать маску для каждой картинки

**Минусы:**
- Сложная реализация (нужна семантическая сегментация)
- Может не сработать для сильно разных композиций
- Непредсказуемость: не всегда понятно, какую область найдет система

**Технически:**
- Нужен дополнительный ML-пайплайн для поиска похожих областей
- Можно использовать SAM с визуальными эмбеддингами
- Или CLIP для поиска похожих регионов

---

### Подход 3: Multi-source batch task (⭐ Рекомендуемый)

**Концепция:**
Расширить существующий `augmentation_run` для поддержки нескольких источников.
Одна задача = batch обработка N картинок.

**Ключевая идея:**
- **Общий промпт**: применяется ко всем картинкам
- **Индивидуальные маски**: можно задать для каждой картинки (или пропустить)
- **Опция "apply to all"**: можно применить одну маску ко всем (нормализованные координаты)
- **Custom overrides**: можно override промпт для конкретных картинок

**Пример workflow:**
```
1. Выбрать 10 картинок класса "person"

2. Задать общий промпт: "add a medical mask"

3. Выбрать режим:
   [x] Use same normalized mask for all
   [ ] Customize mask per image

4. Нарисовать маску на одной картинке (она будет применена ко всем)

5. Опционально: кликнуть на конкретную картинку и подкорректировать маску

6. Запустить batch модификацию

7. Получить ~50 результатов (по 5 на каждую картинку)

8. Review все результаты в галерее
```

**База данных:**

**Вариант A: Расширить augmentation_runs**
```sql
ALTER TABLE augmentation_runs
ADD COLUMN source_asset_ids jsonb NULL; -- [uuid1, uuid2, ...]
ADD COLUMN batch_config jsonb NULL; -- {commonPrompt, applyMaskToAll, ...}
```

**Вариант B: Отдельная таблица (чище)**
```sql
CREATE TABLE augmentation_run_sources (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES augmentation_runs(id) ON DELETE CASCADE,
    source_asset_id uuid NOT NULL REFERENCES dataset_assets(id),
    area_points jsonb NULL, -- null = use default
    custom_prompt text NULL, -- null = use run's prompt
    position integer NOT NULL, -- порядок обработки
    status text NOT NULL, -- pending, processing, completed, failed
    generated_count integer NOT NULL DEFAULT 0,
    error_message text NULL,
    created_at timestamptz NOT NULL,
    started_at timestamptz NULL,
    finished_at timestamptz NULL
);

CREATE INDEX idx_augmentation_run_sources_run ON augmentation_run_sources(run_id);
CREATE INDEX idx_augmentation_run_sources_asset ON augmentation_run_sources(source_asset_id);
```

**Workflow:**

**Фронтенд → Бэкенд:**
```typescript
// API request
POST /api/sessions/{sessionId}/modification/batch

{
  mode: "modify",
  commonPrompt: "add a hat to the person",
  negativePrompt: "blurry, distorted",
  config: {
    strength: 0.7,
    steps: 30,
    guidance_scale: 7.5
  },
  sources: [
    {
      assetId: "uuid1",
      areaPoints: [[0.2, 0.1], [0.8, 0.1], ...], // или null
      customPrompt: null // или override
    },
    {
      assetId: "uuid2",
      areaPoints: null, // use common
      customPrompt: null
    },
    ...
  ],
  classTargets: {
    "person": 5, // generate 5 per source
    "face": 5
  }
}
```

**Бэкенд обработка:**
```python
async def run_batch_modification(session_id, payload):
    # 1. Создать augmentation_run
    run_id = await create_augmentation_run(
        session_id=session_id,
        task_id=task_id,
        mode="modify",
        prompt=payload["commonPrompt"],
        config=payload["config"],
        target_count=len(payload["sources"]) * sum(classTargets.values())
    )

    # 2. Создать записи для каждого источника
    for i, source in enumerate(payload["sources"]):
        await create_augmentation_run_source(
            run_id=run_id,
            source_asset_id=source["assetId"],
            area_points=source.get("areaPoints"),
            custom_prompt=source.get("customPrompt"),
            position=i
        )

    # 3. Поставить задачу в очередь ML worker
    await enqueue_ml_task({
        "taskType": "diffusion.batch_modify",
        "runId": run_id,
        ...
    })
```

**ML Worker обработка:**
```python
async def process_batch_modification(run_id):
    run = await get_augmentation_run(run_id)
    sources = await get_augmentation_run_sources(run_id)

    results = []
    for source in sources:
        # Update source status
        await update_source_status(source.id, "processing")

        try:
            # Prepare bundle for this source
            prompt = source.custom_prompt or run.prompt
            area_points = source.area_points or run.default_area_points

            # Generate
            generated = await generate_for_source(
                source_asset=source.source_asset_id,
                prompt=prompt,
                area_points=area_points,
                config=run.config,
                class_targets=run.class_targets
            )

            # Index results
            await index_results(generated, parent_id=source.source_asset_id)

            await update_source_status(source.id, "completed",
                                      generated_count=len(generated))
            results.extend(generated)

        except Exception as e:
            await update_source_status(source.id, "failed",
                                      error=str(e))

    # Complete run
    await complete_augmentation_run(run_id, len(results))
```

**Плюсы:**
- ✅ Минимальные изменения в существующей архитектуре
- ✅ Покрывает основной use case (batch с общим промптом)
- ✅ Гибкость (можно override для конкретных картинок)
- ✅ Легко масштабируется
- ✅ Прогресс можно отслеживать по каждому источнику
- ✅ Можно retry failed sources

**Минусы:**
- Нужно модифицировать workers
- Немного больше таблиц в БД

---

### Подход 4: Prompt variants с автокомбинированием

**Концепция:**
Пользователь задает шаблон промпта с вариациями, система генерирует все комбинации.

**Пример:**
```
Base prompt: "add {object} on the {location}"
Objects: ["hat", "sunglasses", "scarf"]
Locations: ["head", "face", "neck"]

Sources: [img1, img2]

Результат:
- img1 + "add hat on the head" (5 samples)
- img1 + "add hat on the face" (5 samples)
- img1 + "add hat on the neck" (5 samples)
- img1 + "add sunglasses on the head" (5 samples)
- ... (всего 2 sources × 3 objects × 3 locations × 5 samples = 90 results)
```

**Плюсы:**
- Автоматическое создание разнообразия
- Быстро протестировать много вариаций
- Полезно для data augmentation research

**Минусы:**
- Может сгенерировать ОЧЕНЬ много
- Сложно контролировать
- Можно получить бессмысленные комбинации
- Дорого по compute

**Применимость:**
- Скорее для продвинутых пользователей
- Или как отдельный "experimental mode"

---

## Рекомендация: Hybrid подход

**Начать с Подхода 3 (Multi-source batch)** как основу.
**Добавить элементы Подхода 1 (Templates)** как опцию.

### Фаза 1: Multi-source batch (MVP)

**Функционал:**
1. Выбор нескольких источников (картинок)
2. Общий промпт для всех
3. Опция "Apply same mask to all" (normalize coordinates)
4. Опция "Customize mask per image"
5. Batch генерация
6. Review в галерее

**Изменения:**

**База данных:**
```sql
-- Новая таблица
CREATE TABLE augmentation_run_sources (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES augmentation_runs(id) ON DELETE CASCADE,
    source_asset_id uuid NOT NULL REFERENCES dataset_assets(id),
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

CREATE INDEX idx_augmentation_run_sources_run ON augmentation_run_sources(run_id);

-- Расширить augmentation_runs
ALTER TABLE augmentation_runs
ADD COLUMN is_batch boolean NOT NULL DEFAULT false;
ADD COLUMN batch_mode text NULL; -- 'common_mask', 'custom_masks'
```

**API endpoints:**

```python
# Новый endpoint
POST /api/sessions/{sessionId}/modification/batch
{
  commonPrompt: string
  negativePrompt?: string
  config: object
  sources: Array<{
    assetId: string
    areaPoints?: number[][]
    customPrompt?: string
  }>
  classTargets: Record<string, number>
  batchMode: 'common_mask' | 'custom_masks'
}

# Новый endpoint для получения прогресса batch
GET /api/sessions/{sessionId}/augmentation-runs/{runId}/sources
Response: Array<{
  id: string
  sourceAssetId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  generatedCount: number
  errorMessage?: string
}>
```

**Workers:**

```python
# backend/app/workers/batch_generation.py
async def run_batch_generation(runtime_state, session_id, task_id, run_id):
    """
    Core worker для batch генерации.
    Координирует обработку множества источников.
    """
    sources = await get_augmentation_run_sources(run_id)

    for source in sources:
        # Update progress
        await emit_batch_progress(session_id, task_id, source.position, len(sources))

        # Dispatch ML task for this source
        await dispatch_source_generation(
            runtime_state=runtime_state,
            run_id=run_id,
            source_id=source.id,
            ...
        )

        # Check cancellation
        if await is_cancelled(task_id):
            break

    # Complete
    await complete_batch_run(run_id)

# backend/app/workers/ml_batch_generation.py
async def process_source_generation(source_id):
    """
    ML worker для обработки одного источника в batch.
    """
    source = await get_run_source(source_id)
    run = await get_augmentation_run(source.run_id)

    # Build bundle
    bundle = build_source_bundle(source, run)

    # Generate
    await generate_with_diffusion(bundle)

    # Index results
    results = await index_source_results(source, bundle)

    # Update source
    await complete_source(source.id, len(results))
```

### Фаза 2: Templates (опционально)

После MVP можно добавить систему шаблонов:

```sql
CREATE TABLE modification_templates (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL,
    name text NOT NULL,
    description text NULL,
    prompt text NOT NULL,
    negative_prompt text NULL,
    sam_prompt text NULL,
    area_points jsonb NULL,
    config jsonb NOT NULL,
    is_public boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

-- Связь run с template
ALTER TABLE augmentation_runs
ADD COLUMN template_id uuid NULL REFERENCES modification_templates(id);
```

**API:**
```python
# Template management
POST /api/sessions/{sessionId}/templates
GET /api/sessions/{sessionId}/templates
PUT /api/sessions/{sessionId}/templates/{templateId}
DELETE /api/sessions/{sessionId}/templates/{templateId}

# Apply template
POST /api/sessions/{sessionId}/modification/batch-from-template
{
  templateId: string
  sourceAssetIds: string[]
  overrides?: { config?, prompt? }
}
```

---

## Детальная архитектура изменений

### 1. Database schema

```sql
-- Новая таблица для источников в batch
CREATE TABLE augmentation_run_sources (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES augmentation_runs(id) ON DELETE CASCADE,
    source_asset_id uuid NOT NULL REFERENCES dataset_assets(id) ON DELETE CASCADE,

    -- Override parameters (NULL = use from run)
    area_points jsonb NULL,
    custom_prompt text NULL,

    -- Processing state
    position integer NOT NULL,
    status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    generated_count integer NOT NULL DEFAULT 0,
    error_message text NULL,

    -- Timestamps
    created_at timestamptz NOT NULL,
    started_at timestamptz NULL,
    finished_at timestamptz NULL
);

CREATE INDEX idx_augmentation_run_sources_run ON augmentation_run_sources(run_id);
CREATE INDEX idx_augmentation_run_sources_status ON augmentation_run_sources(run_id, status);

-- Расширить augmentation_runs для batch режима
ALTER TABLE augmentation_runs
ADD COLUMN is_batch boolean NOT NULL DEFAULT false;
ADD COLUMN batch_mode text NULL CHECK (batch_mode IN ('common_mask', 'custom_masks', 'auto_adapt'));
ADD COLUMN source_count integer NOT NULL DEFAULT 0;

-- Templates (опционально, Фаза 2)
CREATE TABLE modification_templates (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NULL,
    prompt text NOT NULL,
    negative_prompt text NULL,
    sam_prompt text NULL,
    area_points jsonb NULL,
    config jsonb NOT NULL,
    usage_count integer NOT NULL DEFAULT 0,
    last_used_at timestamptz NULL,
    is_favorite boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX idx_modification_templates_session ON modification_templates(session_id);
```

### 2. API handlers

**Новый файл: `backend/app/api/batch_modification_handlers.py`**

```python
async def handle_start_batch_modification(request, runtime_state):
    """
    POST /api/sessions/{sessionId}/modification/batch

    Создает batch модификацию для нескольких источников.
    """
    session_id = UUID(request.path_params["sessionId"])
    payload = await request.json()

    # Validate
    sources = payload.get("sources", [])
    if not sources or len(sources) > 100:  # limit
        raise AppError(400, "Invalid sources count")

    common_prompt = payload.get("commonPrompt", "")
    config = payload.get("config", {})
    class_targets = payload.get("classTargets", {})
    batch_mode = payload.get("batchMode", "common_mask")

    async with runtime_state.database.connection() as conn:
        # Create task
        task_id = await create_task(
            conn,
            session_id=session_id,
            task_type="batch_modification",
            payload={
                "sources": sources,
                "commonPrompt": common_prompt,
                "negativePrompt": payload.get("negativePrompt"),
                "config": config,
                "classTargets": class_targets,
                "batchMode": batch_mode,
            }
        )

        # Enqueue
        await enqueue_core_task(
            runtime_state.redis,
            runtime_state.settings,
            {
                "taskId": str(task_id),
                "sessionId": str(session_id),
                "taskType": "batch_modification",
            }
        )

        return JSONResponse({"taskId": str(task_id)})


async def handle_get_batch_progress(request, runtime_state):
    """
    GET /api/sessions/{sessionId}/augmentation-runs/{runId}/sources

    Получить прогресс обработки источников в batch.
    """
    run_id = UUID(request.path_params["runId"])

    async with runtime_state.database.connection() as conn:
        sources = await get_augmentation_run_sources(conn, run_id)

        return JSONResponse({
            "sources": [
                {
                    "id": str(s["id"]),
                    "sourceAssetId": str(s["source_asset_id"]),
                    "status": s["status"],
                    "generatedCount": s["generated_count"],
                    "errorMessage": s["error_message"],
                    "position": s["position"],
                }
                for s in sources
            ]
        })
```

### 3. Repository functions

**Расширить: `backend/app/repositories/workflow_runs.py`**

```python
async def create_augmentation_run_with_sources(
    connection,
    session_id: UUID,
    task_id: UUID,
    mode: str,
    dataset_version_id: UUID,
    prompt: str,
    config: dict,
    sources: list[dict],
    class_targets: dict[str, int],
    batch_mode: str,
) -> UUID:
    """
    Создать augmentation_run с несколькими источниками.
    """
    target_count = len(sources) * sum(class_targets.values())

    # Create run
    run_id = await create_augmentation_run(
        connection,
        session_id=session_id,
        task_id=task_id,
        mode=mode,
        dataset_version_id=dataset_version_id,
        prompt=prompt,
        source_asset_id=None,  # batch mode
        config=config,
        target_count=target_count,
    )

    # Update run for batch
    await connection.execute(
        """
        UPDATE augmentation_runs
        SET is_batch = true,
            batch_mode = $2,
            source_count = $3
        WHERE id = $1
        """,
        run_id, batch_mode, len(sources)
    )

    # Create source records
    for i, source_spec in enumerate(sources):
        await create_augmentation_run_source(
            connection,
            run_id=run_id,
            source_asset_id=UUID(source_spec["assetId"]),
            area_points=source_spec.get("areaPoints"),
            custom_prompt=source_spec.get("customPrompt"),
            position=i,
        )

    return run_id


async def create_augmentation_run_source(
    connection,
    run_id: UUID,
    source_asset_id: UUID,
    area_points: list | None,
    custom_prompt: str | None,
    position: int,
) -> UUID:
    """Создать запись источника для batch run."""
    source_id = uuid4()
    now = datetime.now(timezone.utc)

    await connection.execute(
        """
        INSERT INTO augmentation_run_sources
        (id, run_id, source_asset_id, area_points, custom_prompt, position, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
        """,
        source_id, run_id, source_asset_id,
        json.dumps(area_points) if area_points else None,
        custom_prompt, position, now
    )

    return source_id


async def get_augmentation_run_sources(
    connection,
    run_id: UUID,
) -> list[dict]:
    """Получить все источники batch run."""
    rows = await connection.fetch(
        """
        SELECT
            id, run_id, source_asset_id,
            area_points, custom_prompt,
            position, status, generated_count, error_message,
            created_at, started_at, finished_at
        FROM augmentation_run_sources
        WHERE run_id = $1
        ORDER BY position
        """,
        run_id
    )

    return [dict(row) for row in rows]


async def update_source_status(
    connection,
    source_id: UUID,
    status: str,
    generated_count: int | None = None,
    error_message: str | None = None,
) -> None:
    """Обновить статус обработки источника."""
    now = datetime.now(timezone.utc)

    if status == "processing":
        await connection.execute(
            """
            UPDATE augmentation_run_sources
            SET status = $2, started_at = $3
            WHERE id = $1
            """,
            source_id, status, now
        )
    elif status == "completed":
        await connection.execute(
            """
            UPDATE augmentation_run_sources
            SET status = $2, generated_count = $3, finished_at = $4
            WHERE id = $1
            """,
            source_id, status, generated_count or 0, now
        )
    elif status == "failed":
        await connection.execute(
            """
            UPDATE augmentation_run_sources
            SET status = $2, error_message = $3, finished_at = $4
            WHERE id = $1
            """,
            source_id, status, error_message, now
        )
```

### 4. Worker implementation

**Новый файл: `backend/app/workers/batch_generation.py`**

```python
async def run_batch_generation(runtime_state, session_id: UUID, task_id: UUID) -> None:
    """
    Core worker для batch модификации.
    Обрабатывает task с множественными источниками.
    """
    async with runtime_state.database.connection() as connection:
        task = await get_task(connection, task_id)
        if not task:
            return

        payload = task["payload"]
        sources_spec = payload.get("sources", [])
        common_prompt = payload.get("commonPrompt", "")
        config = payload.get("config", {})
        class_targets = parse_class_targets(payload.get("classTargets"))
        batch_mode = payload.get("batchMode", "common_mask")

        # Get context
        context = await get_session_context(connection, session_id)
        if not context or not context["dataset_id"]:
            await emit_failure(runtime_state, connection, session_id, task_id,
                             "Сессия не готова")
            return

        # Create batch run with sources
        run_id = await create_augmentation_run_with_sources(
            connection,
            session_id=session_id,
            task_id=task_id,
            mode=WorkflowStage.MODIFY.value,
            dataset_version_id=context["current_dataset_version_id"],
            prompt=common_prompt,
            config=config,
            sources=sources_spec,
            class_targets=class_targets,
            batch_mode=batch_mode,
        )

        # Get source records
        sources = await get_augmentation_run_sources(connection, run_id)

        # Process each source
        total_generated = 0
        for i, source in enumerate(sources):
            # Check cancellation
            if await ensure_not_cancelled(connection, task_id):
                await emit_cancelled(runtime_state, connection, session_id, task_id,
                                    "Batch модификация отменена")
                return

            # Emit progress
            progress = (i / len(sources)) * 0.9  # 0-90%
            await emit_event(
                runtime_state, connection, session_id, task_id,
                "batch_modification.progress",
                {
                    "progress": progress,
                    "message": f"Обрабатываю источник {i+1}/{len(sources)}",
                    "currentSource": i,
                    "totalSources": len(sources),
                },
                status=TaskStatus.RUNNING,
                progress=progress,
            )

            # Mark source as processing
            await update_source_status(connection, source["id"], "processing")

            try:
                # Get asset
                asset = await find_asset_by_id(connection, session_id,
                                              source["source_asset_id"])
                if not asset:
                    raise ValueError("Source asset not found")

                # Resolve prompt and area
                prompt = source["custom_prompt"] or common_prompt
                area_points = source["area_points"]
                if area_points is None and batch_mode == "common_mask":
                    # Use first source's area_points for all
                    area_points = sources[0]["area_points"]

                # Build class pool for this source
                class_pool = build_class_pool(context,
                                             template_class_name=asset["class_name"],
                                             class_targets=class_targets)

                # Dispatch ML generation for this source
                source_path = runtime_state.settings.runtime_dir / Path(asset["storage_path"])

                # Create mini-bundle for this source
                source_bundle = build_run_bundle(runtime_state.runtime_paths,
                                                 source["id"])
                records = build_records(
                    source_path=source_path,
                    class_names=class_pool,
                    prompt=prompt,
                    sample_count=len(class_pool),
                    config=config,
                    area_points=area_points,
                )
                prepare_run_bundle(source_bundle, records, {
                    "sourceId": str(source["id"]),
                    "runId": str(run_id),
                    "taskId": str(task_id),
                }, config)

                # Enqueue ML task
                await enqueue_ml_task(
                    runtime_state.redis,
                    runtime_state.settings,
                    {
                        "taskId": str(task_id),
                        "sessionId": str(session_id),
                        "taskType": "diffusion.batch_source",
                        "runDir": str(source_bundle.run_dir),
                        "sourceId": str(source["id"]),
                    }
                )

                # Wait for ML result
                state = await wait_for_source_ml_result(
                    runtime_state, connection, source_bundle
                )

                if state.get("status") != "success":
                    raise ValueError(state.get("message") or "Generation failed")

                # Index results
                produced = await index_generated_results(
                    connection=connection,
                    runtime_state=runtime_state,
                    run_id=run_id,
                    task_id=task_id,
                    mode=WorkflowStage.MODIFY.value,
                    dataset_id=context["dataset_id"],
                    parent_asset_id=source["source_asset_id"],
                    class_pool=class_pool,
                    bundle=source_bundle,
                )

                total_generated += produced

                # Mark source as completed
                await update_source_status(connection, source["id"], "completed",
                                          generated_count=produced)

            except Exception as e:
                # Mark source as failed
                await update_source_status(connection, source["id"], "failed",
                                          error_message=str(e))
                # Continue with next source (не падаем на одной ошибке)

        # Complete batch run
        await complete_augmentation_run(connection, run_id, total_generated)

        # Emit completion
        await emit_completion(runtime_state, connection, session_id, task_id,
                            WorkflowStage.REVIEW)


async def wait_for_source_ml_result(runtime_state, connection, bundle) -> dict:
    """Wait for ML worker to process one source."""
    # Similar to wait_for_ml_result but for source bundle
    while True:
        state = load_state(bundle)
        status = state.get("status")
        if status in {"success", "error", "cancelled"}:
            return state
        await asyncio.sleep(0.5)
```

### 5. Frontend changes

**Новые типы:**

```typescript
// frontend/src/shared/types/workflow.ts

export type BatchModificationSource = {
  assetId: string
  areaPoints?: number[][]
  customPrompt?: string
}

export type BatchModificationRequest = {
  commonPrompt: string
  negativePrompt?: string
  config: Record<string, unknown>
  sources: BatchModificationSource[]
  classTargets: Record<string, number>
  batchMode: 'common_mask' | 'custom_masks'
}

export type BatchSourceStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type BatchSource = {
  id: string
  sourceAssetId: string
  status: BatchSourceStatus
  generatedCount: number
  errorMessage?: string
  position: number
}
```

**API client:**

```typescript
// frontend/src/shared/api/workflow.api.ts

export async function startBatchModification(
  sessionId: string,
  request: BatchModificationRequest
): Promise<{ taskId: string }> {
  const response = await http.post(
    `/api/sessions/${sessionId}/modification/batch`,
    request
  )
  return response.data
}

export async function getBatchProgress(
  sessionId: string,
  runId: string
): Promise<{ sources: BatchSource[] }> {
  const response = await http.get(
    `/api/sessions/${sessionId}/augmentation-runs/${runId}/sources`
  )
  return response.data
}
```

---

## Примеры использования

### Случай 1: Одинаковая маска для всех

```typescript
// User selects 10 images
const selectedAssets = [...] // 10 asset IDs

// User draws mask on first image
const commonMask = [[0.2, 0.1], [0.8, 0.1], ...]

// User enters prompt
const prompt = "add a surgical mask to the person's face"

// Start batch
await startBatchModification(sessionId, {
  commonPrompt: prompt,
  negativePrompt: "blurry, distorted",
  config: {
    strength: 0.75,
    steps: 30,
  },
  sources: selectedAssets.map(assetId => ({
    assetId,
    areaPoints: commonMask, // same mask for all
  })),
  classTargets: { person: 5 },
  batchMode: 'common_mask',
})
```

### Случай 2: Индивидуальные маски

```typescript
// User selects 5 images and draws custom mask for each
const sources = [
  {
    assetId: 'uuid1',
    areaPoints: [[0.2, 0.1], ...], // custom mask 1
  },
  {
    assetId: 'uuid2',
    areaPoints: [[0.3, 0.2], ...], // custom mask 2
  },
  ...
]

await startBatchModification(sessionId, {
  commonPrompt: "add sunglasses",
  sources,
  classTargets: { person: 3 },
  batchMode: 'custom_masks',
})
```

### Случай 3: Некоторые с custom промптами

```typescript
const sources = [
  {
    assetId: 'uuid1',
    areaPoints: [[...]],
    customPrompt: "add blue sunglasses", // override
  },
  {
    assetId: 'uuid2',
    areaPoints: [[...]],
    // will use commonPrompt
  },
  {
    assetId: 'uuid3',
    areaPoints: [[...]],
    customPrompt: "add red sunglasses", // override
  },
]

await startBatchModification(sessionId, {
  commonPrompt: "add sunglasses",
  sources,
  classTargets: { person: 5 },
  batchMode: 'custom_masks',
})
```

---

## Преимущества решения

1. **Эффективность**: не нужно вручную работать с каждой картинкой
2. **Гибкость**: можно использовать общий промпт+маску ИЛИ кастомизировать
3. **Масштабируемость**: легко обработать 100+ картинок
4. **Прогресс**: видно, какие источники обработаны, какие failed
5. **Retry**: можно перезапустить только failed sources
6. **Расширяемость**: легко добавить templates позже

---

## Migration path

### Обратная совместимость

Существующие single-source runs продолжат работать:
```python
if run["is_batch"]:
    # Process as batch
    await run_batch_generation(...)
else:
    # Process as single (legacy)
    await run_generation(...)
```

### Поэтапное внедрение

**Этап 1: Backend foundation**
- [ ] Добавить schema (augmentation_run_sources)
- [ ] Создать repository functions
- [ ] Создать batch worker
- [ ] Создать API handlers

**Этап 2: Frontend MVP**
- [ ] Multi-select для источников
- [ ] UI для batch модификации
- [ ] Прогресс batch обработки
- [ ] Галерея результатов (из предыдущего плана)

**Этап 3: Advanced features**
- [ ] Templates система
- [ ] Template library
- [ ] Auto-adaptation масок (опционально)
- [ ] Prompt variants (опционально)

---

## Вопросы для обсуждения

1. **Лимиты**: сколько максимум источников в одном batch? (рекомендую 100)
2. **Параллелизм**: обрабатывать sources последовательно или параллельно?
   - Последовательно: проще, предсказуемо
   - Параллельно: быстрее, но сложнее управлять GPU memory
3. **Retry strategy**: автоматически retry failed sources или вручную?
4. **Templates**: нужны ли сразу или можно отложить?
5. **Auto-adaptation**: нужна ли умная адаптация масок или достаточно normalize coordinates?

---

## Итоговая рекомендация

✅ **Начать с Multi-source batch (Подход 3)**:
- Минимальные изменения
- Покрывает 80% use cases
- Легко расширяется

✅ **Добавить Templates (Подход 1) во второй итерации**:
- Для power users
- Библиотека проверенных модификаций

❌ **Отложить auto-adaptation (Подход 2)**:
- Сложная реализация
- Непредсказуемые результаты
- Можно добавить позже как experimental feature

❌ **Отложить prompt variants (Подход 4)**:
- Слишком специфичный use case
- Можно реализовать как отдельный mode позже
