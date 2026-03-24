# Проблемы хранения шаблонов и план решения

## Текущая ситуация

### Frontend реализация (✅ Готово)

**Типы шаблонов:**
1. **TextPromptTemplate** - текстовые промпты с negative prompts
   ```typescript
   {
     id: string
     name: string
     prompt: string
     negativePrompt?: string
   }
   ```

2. **SelectionPromptTemplate** - SAM prompts для сегментации
   ```typescript
   {
     id: string
     name: string
     text: string
   }
   ```

3. **PolygonTemplate** - сохраненные полигоны/маски
   ```typescript
   {
     id: string
     name: string
     points: AreaPoint[] // [x, y][]
   }
   ```

**Как хранятся:**
- Zustand store с persist middleware (`localStorage`)
- Поле `modificationTemplatesByDataset: Record<datasetId, templates>`
- Персистятся автоматически при изменениях

**UI компоненты:**
- ✅ `DatasetTemplatePanel` - управление шаблонами
- ✅ `BatchTemplatePlanner` - планирование batch с шаблонами
- ✅ Кнопки создания/удаления/применения в ModificationModal

---

## ❌ Критические проблемы

### 1. Только клиентское хранение (localStorage)

**Проблемы:**
- ❌ Шаблоны теряются при очистке браузера
- ❌ Нет синхронизации между устройствами/браузерами
- ❌ Нет backup/restore механизма
- ❌ Нет sharing шаблонов между пользователями
- ❌ Ограничение размера localStorage (~5-10MB)

**Пример сценария:**
```
Пользователь на компьютере A:
- Создал 20 текстовых шаблонов
- Создал 10 полигонов
- Переключился на компьютер B
- ❌ Все шаблоны потеряны!
```

### 2. Отсутствие серверной поддержки

**Что НЕТ в backend:**
- ❌ Таблиц БД для шаблонов
- ❌ API endpoints для CRUD операций
- ❌ Repository functions
- ❌ Валидация и нормализация данных

**Что нужно:**
```sql
-- Таблиц НЕТ в backend/app/storage/schema.py
CREATE TABLE modification_templates (...)
CREATE TABLE modification_template_polygon_points (...)
```

```python
# Handlers НЕТ в backend/app/api/
def get_dataset_templates(...)
def create_template(...)
def delete_template(...)
```

### 3. Риски потери данных

**Сценарии:**
1. **Очистка данных браузера** → все шаблоны потеряны навсегда
2. **Переустановка браузера** → все шаблоны потеряны
3. **Смена устройства** → невозможно перенести шаблоны
4. **Работа в команде** → невозможно поделиться шаблонами

### 4. Масштабируемость

**Текущие ограничения:**
- localStorage limit ~5MB для всего домена
- Если у пользователя 10 датасетов по 50 шаблонов каждый = проблема
- Polygon templates с большим количеством точек занимают много места

---

## 🎯 Решение: Backend Storage

### Архитектура

```
┌─────────────┐
│  Frontend   │
│  (Zustand)  │ ← Cache layer (быстрый доступ)
└──────┬──────┘
       │
       │ REST API
       ▼
┌─────────────┐
│   Backend   │
│ (Postgres)  │ ← Source of truth
└─────────────┘
```

**Стратегия:**
1. **Backend** = source of truth (Postgres)
2. **Frontend** = cache + optimistic updates
3. При загрузке страницы: fetch templates from backend
4. При создании/удалении: sync to backend + update local cache

---

## План реализации

### Phase 1: Backend Database Schema

**Новая таблица**: `modification_templates`

```sql
CREATE TABLE IF NOT EXISTS modification_templates (
    id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,

    -- Тип шаблона
    template_type text NOT NULL CHECK (template_type IN ('text', 'selection', 'polygon')),

    -- Общие поля
    name text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,

    -- Для text/selection templates
    prompt_text text NULL,
    negative_prompt_text text NULL,

    -- Для polygon templates
    polygon_points jsonb NULL, -- [[x, y], [x, y], ...]

    -- Constraints
    CONSTRAINT valid_text_template CHECK (
        template_type != 'text' OR prompt_text IS NOT NULL
    ),
    CONSTRAINT valid_selection_template CHECK (
        template_type != 'selection' OR prompt_text IS NOT NULL
    ),
    CONSTRAINT valid_polygon_template CHECK (
        template_type != 'polygon' OR polygon_points IS NOT NULL
    )
);

CREATE INDEX idx_modification_templates_dataset ON modification_templates(dataset_id);
CREATE INDEX idx_modification_templates_type ON modification_templates(dataset_id, template_type);
```

**Альтернатива: Нормализованная схема (если полигоны большие)**

```sql
-- Main table
CREATE TABLE modification_templates (
    id uuid PRIMARY KEY,
    dataset_id uuid NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    template_type text NOT NULL,
    name text NOT NULL,
    prompt_text text NULL,
    negative_prompt_text text NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

-- Отдельная таблица для точек полигона
CREATE TABLE modification_template_points (
    id uuid PRIMARY KEY,
    template_id uuid NOT NULL REFERENCES modification_templates(id) ON DELETE CASCADE,
    point_index integer NOT NULL,
    x numeric NOT NULL,
    y numeric NOT NULL,
    UNIQUE(template_id, point_index)
);

CREATE INDEX idx_template_points_template ON modification_template_points(template_id);
```

**Рекомендация:** Начать с первого варианта (jsonb для points), если полигоны не слишком большие.

---

### Phase 2: Backend Repository

**Новый файл**: `backend/app/repositories/modification_templates.py`

```python
from __future__ import annotations
from uuid import UUID, uuid4
from datetime import datetime, timezone
import json
from typing import Any

async def list_dataset_templates(
    connection,
    dataset_id: UUID,
) -> dict[str, list[dict[str, Any]]]:
    """
    Получить все шаблоны датасета, сгруппированные по типу.

    Returns:
        {
            "textTemplates": [...],
            "selectionTemplates": [...],
            "polygonTemplates": [...]
        }
    """
    rows = await connection.fetch(
        """
        SELECT
            id, template_type, name, prompt_text,
            negative_prompt_text, polygon_points,
            created_at, updated_at
        FROM modification_templates
        WHERE dataset_id = $1
        ORDER BY created_at DESC
        """,
        dataset_id
    )

    text_templates = []
    selection_templates = []
    polygon_templates = []

    for row in rows:
        if row["template_type"] == "text":
            text_templates.append({
                "id": str(row["id"]),
                "name": row["name"],
                "prompt": row["prompt_text"],
                "negativePrompt": row["negative_prompt_text"],
            })
        elif row["template_type"] == "selection":
            selection_templates.append({
                "id": str(row["id"]),
                "name": row["name"],
                "text": row["prompt_text"],
            })
        elif row["template_type"] == "polygon":
            polygon_templates.append({
                "id": str(row["id"]),
                "name": row["name"],
                "points": json.loads(row["polygon_points"]) if row["polygon_points"] else [],
            })

    return {
        "textTemplates": text_templates,
        "selectionTemplates": selection_templates,
        "polygonTemplates": polygon_templates,
    }


async def create_text_template(
    connection,
    dataset_id: UUID,
    name: str,
    prompt: str,
    negative_prompt: str | None = None,
) -> UUID:
    """Создать текстовый шаблон."""
    template_id = uuid4()
    now = datetime.now(timezone.utc)

    await connection.execute(
        """
        INSERT INTO modification_templates
        (id, dataset_id, template_type, name, prompt_text, negative_prompt_text, created_at, updated_at)
        VALUES ($1, $2, 'text', $3, $4, $5, $6, $6)
        """,
        template_id, dataset_id, name, prompt, negative_prompt, now
    )

    return template_id


async def create_selection_template(
    connection,
    dataset_id: UUID,
    name: str,
    text: str,
) -> UUID:
    """Создать selection (SAM) шаблон."""
    template_id = uuid4()
    now = datetime.now(timezone.utc)

    await connection.execute(
        """
        INSERT INTO modification_templates
        (id, dataset_id, template_type, name, prompt_text, created_at, updated_at)
        VALUES ($1, $2, 'selection', $3, $4, $5, $5)
        """,
        template_id, dataset_id, name, text, now
    )

    return template_id


async def create_polygon_template(
    connection,
    dataset_id: UUID,
    name: str,
    points: list[list[float]],
) -> UUID:
    """Создать polygon шаблон."""
    template_id = uuid4()
    now = datetime.now(timezone.utc)

    await connection.execute(
        """
        INSERT INTO modification_templates
        (id, dataset_id, template_type, name, polygon_points, created_at, updated_at)
        VALUES ($1, $2, 'polygon', $3, $4, $5, $5)
        """,
        template_id, dataset_id, name, json.dumps(points), now
    )

    return template_id


async def delete_template(
    connection,
    template_id: UUID,
    dataset_id: UUID,
) -> bool:
    """
    Удалить шаблон.

    Returns:
        True если шаблон был удален, False если не найден.
    """
    result = await connection.execute(
        """
        DELETE FROM modification_templates
        WHERE id = $1 AND dataset_id = $2
        """,
        template_id, dataset_id
    )

    return result == "DELETE 1"


async def update_template_name(
    connection,
    template_id: UUID,
    dataset_id: UUID,
    new_name: str,
) -> bool:
    """Переименовать шаблон."""
    now = datetime.now(timezone.utc)

    result = await connection.execute(
        """
        UPDATE modification_templates
        SET name = $3, updated_at = $4
        WHERE id = $1 AND dataset_id = $2
        """,
        template_id, dataset_id, new_name, now
    )

    return result == "UPDATE 1"
```

---

### Phase 3: Backend API Handlers

**Новый файл**: `backend/app/api/template_handlers.py`

```python
from __future__ import annotations
from uuid import UUID
from backend.app.runtime.response import JSONResponse
from backend.app.runtime.errors import AppError
from backend.app.repositories import modification_templates


async def handle_list_dataset_templates(request, runtime_state):
    """
    GET /api/sessions/{sessionId}/templates

    Получить все шаблоны текущего датасета.
    """
    session_id = UUID(request.path_params["sessionId"])

    async with runtime_state.database.connection() as conn:
        # Get dataset_id from session
        session_row = await conn.fetchrow(
            "SELECT dataset_id FROM sessions WHERE id = $1",
            session_id
        )

        if not session_row or not session_row["dataset_id"]:
            raise AppError(404, "Датасет не найден для этой сессии")

        dataset_id = session_row["dataset_id"]

        # Get templates
        templates = await modification_templates.list_dataset_templates(
            conn, dataset_id
        )

        return JSONResponse(templates)


async def handle_create_text_template(request, runtime_state):
    """
    POST /api/sessions/{sessionId}/templates/text

    Body:
    {
      "name": "Add medical mask",
      "prompt": "add a medical mask to the person's face",
      "negativePrompt": "blurry, distorted"
    }
    """
    session_id = UUID(request.path_params["sessionId"])
    payload = await request.json()

    name = payload.get("name", "").strip()
    prompt = payload.get("prompt", "").strip()
    negative_prompt = payload.get("negativePrompt", "").strip() or None

    if not name:
        raise AppError(400, "name обязателен")
    if not prompt:
        raise AppError(400, "prompt обязателен")

    async with runtime_state.database.connection() as conn:
        session_row = await conn.fetchrow(
            "SELECT dataset_id FROM sessions WHERE id = $1",
            session_id
        )

        if not session_row or not session_row["dataset_id"]:
            raise AppError(404, "Датасет не найден")

        dataset_id = session_row["dataset_id"]

        template_id = await modification_templates.create_text_template(
            conn, dataset_id, name, prompt, negative_prompt
        )

        return JSONResponse({"id": str(template_id)}, status_code=201)


async def handle_create_selection_template(request, runtime_state):
    """
    POST /api/sessions/{sessionId}/templates/selection

    Body:
    {
      "name": "Face region",
      "text": "face of the person"
    }
    """
    session_id = UUID(request.path_params["sessionId"])
    payload = await request.json()

    name = payload.get("name", "").strip()
    text = payload.get("text", "").strip()

    if not name or not text:
        raise AppError(400, "name и text обязательны")

    async with runtime_state.database.connection() as conn:
        session_row = await conn.fetchrow(
            "SELECT dataset_id FROM sessions WHERE id = $1",
            session_id
        )

        if not session_row or not session_row["dataset_id"]:
            raise AppError(404, "Датасет не найден")

        dataset_id = session_row["dataset_id"]

        template_id = await modification_templates.create_selection_template(
            conn, dataset_id, name, text
        )

        return JSONResponse({"id": str(template_id)}, status_code=201)


async def handle_create_polygon_template(request, runtime_state):
    """
    POST /api/sessions/{sessionId}/templates/polygon

    Body:
    {
      "name": "Upper head region",
      "points": [[0.2, 0.1], [0.8, 0.1], [0.8, 0.4], [0.2, 0.4]]
    }
    """
    session_id = UUID(request.path_params["sessionId"])
    payload = await request.json()

    name = payload.get("name", "").strip()
    points = payload.get("points", [])

    if not name:
        raise AppError(400, "name обязателен")
    if not isinstance(points, list) or len(points) < 3:
        raise AppError(400, "points должен содержать минимум 3 точки")

    # Validate points format
    for point in points:
        if not isinstance(point, list) or len(point) != 2:
            raise AppError(400, "Каждая точка должна быть [x, y]")
        if not all(isinstance(coord, (int, float)) for coord in point):
            raise AppError(400, "Координаты должны быть числами")

    async with runtime_state.database.connection() as conn:
        session_row = await conn.fetchrow(
            "SELECT dataset_id FROM sessions WHERE id = $1",
            session_id
        )

        if not session_row or not session_row["dataset_id"]:
            raise AppError(404, "Датасет не найден")

        dataset_id = session_row["dataset_id"]

        template_id = await modification_templates.create_polygon_template(
            conn, dataset_id, name, points
        )

        return JSONResponse({"id": str(template_id)}, status_code=201)


async def handle_delete_template(request, runtime_state):
    """
    DELETE /api/sessions/{sessionId}/templates/{templateId}
    """
    session_id = UUID(request.path_params["sessionId"])
    template_id = UUID(request.path_params["templateId"])

    async with runtime_state.database.connection() as conn:
        session_row = await conn.fetchrow(
            "SELECT dataset_id FROM sessions WHERE id = $1",
            session_id
        )

        if not session_row or not session_row["dataset_id"]:
            raise AppError(404, "Датасет не найден")

        dataset_id = session_row["dataset_id"]

        deleted = await modification_templates.delete_template(
            conn, template_id, dataset_id
        )

        if not deleted:
            raise AppError(404, "Шаблон не найден")

        return JSONResponse({"success": True})


async def handle_update_template_name(request, runtime_state):
    """
    PATCH /api/sessions/{sessionId}/templates/{templateId}

    Body:
    {
      "name": "New name"
    }
    """
    session_id = UUID(request.path_params["sessionId"])
    template_id = UUID(request.path_params["templateId"])
    payload = await request.json()

    new_name = payload.get("name", "").strip()
    if not new_name:
        raise AppError(400, "name обязателен")

    async with runtime_state.database.connection() as conn:
        session_row = await conn.fetchrow(
            "SELECT dataset_id FROM sessions WHERE id = $1",
            session_id
        )

        if not session_row or not session_row["dataset_id"]:
            raise AppError(404, "Датасет не найден")

        dataset_id = session_row["dataset_id"]

        updated = await modification_templates.update_template_name(
            conn, template_id, dataset_id, new_name
        )

        if not updated:
            raise AppError(404, "Шаблон не найден")

        return JSONResponse({"success": True})
```

**Регистрация в роутере** (`backend/app/asgi.py`):

```python
# Add routes
router.get("/api/sessions/:sessionId/templates", template_handlers.handle_list_dataset_templates)
router.post("/api/sessions/:sessionId/templates/text", template_handlers.handle_create_text_template)
router.post("/api/sessions/:sessionId/templates/selection", template_handlers.handle_create_selection_template)
router.post("/api/sessions/:sessionId/templates/polygon", template_handlers.handle_create_polygon_template)
router.delete("/api/sessions/:sessionId/templates/:templateId", template_handlers.handle_delete_template)
router.patch("/api/sessions/:sessionId/templates/:templateId", template_handlers.handle_update_template_name)
```

---

### Phase 4: Frontend API Integration

**Расширить**: `frontend/src/shared/api/endpoints.ts`

```typescript
export const endpoints = {
  // ... existing

  // Templates
  datasetTemplates: (sessionId: string) => `/sessions/${sessionId}/templates`,
  createTextTemplate: (sessionId: string) => `/sessions/${sessionId}/templates/text`,
  createSelectionTemplate: (sessionId: string) => `/sessions/${sessionId}/templates/selection`,
  createPolygonTemplate: (sessionId: string) => `/sessions/${sessionId}/templates/polygon`,
  deleteTemplate: (sessionId: string, templateId: string) =>
    `/sessions/${sessionId}/templates/${templateId}`,
  updateTemplate: (sessionId: string, templateId: string) =>
    `/sessions/${sessionId}/templates/${templateId}`,
}
```

**Расширить**: `frontend/src/shared/api/workflow.api.ts`

```typescript
// Get all templates for current dataset
async getDatasetTemplates(sessionId: string) {
  const response = await http.get(endpoints.datasetTemplates(sessionId))
  return response.data
}

// Create text template
async createTextTemplate(sessionId: string, payload: {
  name: string
  prompt: string
  negativePrompt?: string
}) {
  const response = await http.post(
    endpoints.createTextTemplate(sessionId),
    payload
  )
  return response.data
}

// Create selection template
async createSelectionTemplate(sessionId: string, payload: {
  name: string
  text: string
}) {
  const response = await http.post(
    endpoints.createSelectionTemplate(sessionId),
    payload
  )
  return response.data
}

// Create polygon template
async createPolygonTemplate(sessionId: string, payload: {
  name: string
  points: number[][]
}) {
  const response = await http.post(
    endpoints.createPolygonTemplate(sessionId),
    payload
  )
  return response.data
}

// Delete template
async deleteTemplate(sessionId: string, templateId: string) {
  const response = await http.delete(
    endpoints.deleteTemplate(sessionId, templateId)
  )
  return response.data
}

// Update template name
async updateTemplateName(sessionId: string, templateId: string, name: string) {
  const response = await http.patch(
    endpoints.updateTemplate(sessionId, templateId),
    { name }
  )
  return response.data
}
```

**Новые hooks**: `frontend/src/shared/api/workflow.hooks.ts`

```typescript
// Query hook для загрузки шаблонов
export function useDatasetTemplatesQuery(sessionId: string | null) {
  return useQuery({
    queryKey: ['dataset-templates', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      return await workflowApi.getDatasetTemplates(sessionId)
    },
    enabled: Boolean(sessionId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Mutation для создания текстового шаблона
export function useCreateTextTemplateMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ sessionId, payload }: {
      sessionId: string
      payload: { name: string; prompt: string; negativePrompt?: string }
    }) => {
      return await workflowApi.createTextTemplate(sessionId, payload)
    },
    onSuccess: (_, { sessionId }) => {
      // Invalidate cache to refetch templates
      queryClient.invalidateQueries(['dataset-templates', sessionId])
    }
  })
}

// Аналогично для других операций...
export function useCreateSelectionTemplateMutation() { ... }
export function useCreatePolygonTemplateMutation() { ... }
export function useDeleteTemplateMutation() { ... }
export function useUpdateTemplateNameMutation() { ... }
```

---

### Phase 5: Frontend Integration

**Изменить**: `frontend/src/pages/modify/useModifyPage.ts`

```typescript
// Instead of using Zustand state directly, use API
const { data: serverTemplates, isLoading } = useDatasetTemplatesQuery(sessionId)
const createTextMutation = useCreateTextTemplateMutation()
const createSelectionMutation = useCreateSelectionTemplateMutation()
const createPolygonMutation = useCreatePolygonTemplateMutation()
const deleteMutation = useDeleteTemplateMutation()

// Merge server templates with local cache
const datasetTemplates = useMemo(() => {
  if (!serverTemplates) {
    // Fallback to localStorage while loading
    return datasetId
      ? modificationTemplatesByDataset[datasetId] ?? EMPTY_DATASET_TEMPLATES
      : EMPTY_DATASET_TEMPLATES
  }
  return serverTemplates
}, [serverTemplates, datasetId, modificationTemplatesByDataset])

// Update create functions to use mutations
const createDatasetTextTemplate = async (name: string) => {
  const prompt = form.getValues('prompt').trim()
  if (!prompt || !sessionId) return

  try {
    await createTextMutation.mutateAsync({
      sessionId,
      payload: {
        name: name.trim(),
        prompt,
        negativePrompt: (fieldValues.negative_prompt ?? '').trim() || undefined,
      }
    })
    // Optimistically update local state
    updateDatasetTemplates({
      ...datasetTemplates,
      textTemplates: [
        ...datasetTemplates.textTemplates,
        { id: `temp:${Date.now()}`, name, prompt } // temporary ID
      ]
    })
  } catch (error) {
    setErrorMessage('Не удалось сохранить шаблон')
  }
}

// Similar for delete, etc.
```

**Migration strategy:**
1. При первой загрузке: fetch templates from server
2. Если сервер недоступен: fallback to localStorage
3. При создании/удалении: sync to server + update local cache
4. Постепенная миграция старых localStorage шаблонов на сервер

---

## Преимущества решения

### ✅ Надёжность
- Шаблоны хранятся в Postgres (backup, replication)
- Не теряются при очистке браузера
- Cascade deletion при удалении датасета

### ✅ Доступность
- Синхронизация между устройствами
- Доступ с любого браузера
- Можно восстановить при переезде

### ✅ Масштабируемость
- Нет ограничений localStorage
- Можно хранить тысячи шаблонов
- Эффективные индексы БД

### ✅ Sharing (будущее)
- Можно добавить поле `is_public`
- Шаблоны можно расшарить между датасетами
- Template marketplace

### ✅ Versioning (будущее)
- История изменений шаблонов
- Rollback к предыдущим версиям
- Audit log

---

## Migration план

### Step 1: Backend Foundation (2-3 часа)
1. Добавить schema в `backend/app/storage/schema.py`
2. Создать `backend/app/repositories/modification_templates.py`
3. Создать `backend/app/api/template_handlers.py`
4. Зарегистрировать routes в `backend/app/asgi.py`

### Step 2: Frontend API (1-2 часа)
1. Добавить endpoints
2. Добавить API methods
3. Добавить hooks (useQuery, useMutation)

### Step 3: Integration (2-3 часа)
1. Изменить `useModifyPage` для использования API
2. Добавить loading states
3. Добавить error handling
4. Оптимистичные updates

### Step 4: Migration Tool (1-2 часа)
1. Кнопка "Sync templates to server"
2. Читает localStorage
3. Отправляет на сервер
4. Очищает localStorage (опционально)

### Step 5: Testing (1-2 часа)
1. Тестировать CRUD операции
2. Тестировать offline fallback
3. Тестировать синхронизацию

**Total: 7-12 часов**

---

## Backwards Compatibility

### Стратегия миграции

**Phase 1: Dual mode** (обе системы работают)
```typescript
// Load from server
const serverTemplates = useDatasetTemplatesQuery(sessionId)

// Fallback to localStorage
const localTemplates = modificationTemplatesByDataset[datasetId]

// Merge (server priority)
const templates = serverTemplates || localTemplates
```

**Phase 2: Migration prompt**
```typescript
useEffect(() => {
  if (localTemplates && !serverTemplates) {
    // Show banner: "Migrate your templates to cloud storage?"
    setShowMigrationBanner(true)
  }
}, [localTemplates, serverTemplates])
```

**Phase 3: Deprecation** (через 2-3 месяца)
- Удалить localStorage persistence
- Оставить только server storage

---

## Альтернативные решения (не рекомендуются)

### ❌ Альтернатива 1: Session storage в БД

```sql
-- Хранить templates как jsonb в sessions
ALTER TABLE sessions ADD COLUMN templates jsonb;
```

**Минусы:**
- Сложнее query по отдельным шаблонам
- Нет нормализации
- Сложнее делать sharing
- Нет индексов по имени/типу

### ❌ Альтернатива 2: File storage

```
storage/datasets/{dataset_id}/templates/
  text_template_123.json
  polygon_template_456.json
```

**Минусы:**
- Сложнее CRUD операции
- Нет транзакций
- Нет foreign keys
- Нужна отдельная индексация

### ❌ Альтернатива 3: IndexedDB на клиенте

**Минусы:**
- Всё ещё клиентское хранение
- Не решает синхронизацию
- Сложнее API

---

## Итого

### Проблемы:
1. ❌ Шаблоны только в localStorage (ненадёжно)
2. ❌ Нет бэкенд поддержки (нет API, БД)
3. ❌ Риск потери данных
4. ❌ Нет синхронизации между устройствами

### Решение:
✅ **Postgres-based storage** с frontend cache

### Оценка:
- Backend: 2-3 часа
- Frontend API: 1-2 часа
- Integration: 2-3 часа
- Migration: 1-2 часа
- Testing: 1-2 часа
- **Total: 7-12 часов**

### Приоритет:
⚠️ **ВЫСОКИЙ** - критично для production использования
