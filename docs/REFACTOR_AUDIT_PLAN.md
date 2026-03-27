# План рефакторинга по итогам аудита

## 1. Цель

Зафиксировать текущие расхождения между требованиями из:

- `docs/BACKEND_ARCHITECTURE_PLAN.md`
- `docs/FRONTEND_ARCHITECTURE_PLAN.md`

и реальным состоянием репозитория, а также определить безопасный порядок рефакторинга.

Документ нужен как рабочий backlog, чтобы не потерять найденные проблемы и не смешивать:

- реальные дефекты архитектуры
- последствия уже выполненного рефакторинга workflow
- устаревшие требования в самих markdown-документах

## 2. Важное уточнение

Часть несоответствий вызвана не плохой реализацией, а тем, что архитектурные `.md` устарели после удаления отдельного diffusion warm-up / fine-tune этапа.

Поэтому все наблюдения ниже разделяются на:

- реальные проблемы кодовой базы
- документальный дрейф

## 3. Краткий вывод

### 3.1 Backend

Backend в целом соответствует ключевым архитектурным требованиям:

- Python + ASGI + Uvicorn
- PostgreSQL как источник истины
- Redis для очередей и live-событий
- файловое runtime-хранилище на volume
- session-centric модель
- отдельные `worker` и `ml-worker`

Основной долг backend сейчас:

- несколько слишком крупных файлов
- местами недостаточно строгая типизация
- висячие enum/state-сущности после смены workflow
- структура модулей не полностью совпадает с идеальным деревом из backend-плана

### 3.2 Frontend

Frontend расходится с frontend-планом сильнее:

- активный workflow уже изменён
- часть старых экранов и типов осталась в коде
- есть неиспользуемые компоненты
- есть файлы больше рекомендованного лимита
- есть как минимум один комментарий, хотя по плану комментарии запрещены
- визуальная система уже не соответствует исходной тёмной палитре из плана

## 4. Проверка backend на соответствие требованиям

### 4.1 Что соответствует

- ASGI backend поднят вручную и запускается через Uvicorn:
  - `backend/app/asgi.py`
  - `docker-compose.yml`
- PostgreSQL используется как основное persistent storage:
  - `backend/app/storage/postgres.py`
  - `backend/app/storage/schema.py`
- Redis используется для очередей и session stream:
  - `backend/app/services/queue.py`
  - `backend/app/services/events.py`
- runtime storage вынесен в volume:
  - `docker-compose.yml`
  - `config/app.yaml`
- есть session-centric snapshot-модель:
  - `backend/app/services/sessions.py`
  - `backend/app/repositories/sessions.py`
  - `backend/app/repositories/workflow_session.py`
- есть WebSocket stream:
  - `backend/app/api/ws_handlers.py`
  - `backend/app/asgi.py`

### 4.2 Что не совпадает с backend-планом

- Структура backend не совпадает полностью с целевой схемой из документа.
  Сейчас используется более плоская структура:
  - `api/*_handlers.py`
  - `services/*`
  - `repositories/*`
  Вместо более строгого деления вроде:
  - `api/http/*`
  - `api/ws/*`
  - `domain/dto/*`
  - `domain/models/*`
- В коде слабее выражена строгая типизация, чем ожидалось в плане.
  Примеры:
  - `state: object` в handler-слое
  - местами неаннотированные connection/runtime зависимости
- В enum'ах остались сущности, которые уже не выглядят частью текущего workflow:
  - `WorkflowStage.MODE_SELECT`
  - `WorkflowStage.DOWNLOAD`
  - `TaskType.EXPORT`
  - `WorkflowMode`

### 4.3 Ограничение по размеру файлов backend

Принято новое правило:

- целевой размер backend-файла: до `300` строк
- если логически не удаётся дробить без ухудшения структуры, допускаются исключения

Текущее состояние backend:

- всего Python-файлов: `55`
- файлов больше `300` строк: `9`

Наиболее крупные backend-файлы:

1. `backend/app/services/uploads.py` — `525`
2. `backend/app/repositories/workflow_assets.py` — `512`
3. `backend/app/api/workflow_handlers.py` — `501`
4. `backend/app/workers/ml_classifier.py` — `497`
5. `backend/app/workers/ml_generation.py` — `462`
6. `backend/app/services/zimage_executor.py` — `365`
7. `backend/app/services/diffusion_runtime.py` — `362`
8. `backend/app/api/session_handlers.py` — `362`
9. `backend/app/workers/generation.py` — `337`

Вывод:

- backend не выглядит разваленным по размеру файлов
- но 9 крупных файлов уже являются приоритетными кандидатами на декомпозицию

## 5. Проверка frontend на соответствие требованиям

### 5.1 Что соответствует

- стек соответствует ожиданиям:
  - React
  - TypeScript / TSX
  - React Router
  - TanStack Query
  - Zustand
  - Axios
- маршрутизация и store действительно построены вокруг workflow и session state
- модалки открываются поверх размытого фона:
  - `frontend/src/shared/ui/feedback/modal.css`

### 5.2 Что не совпадает с frontend-планом

- Frontend-план всё ещё ожидает отдельные этапы:
  - `/diffusion/fine-tune`
  - `/mode`
  - `/generate`
- Реальный router уже обслуживает другой сценарий:
  - `/upload`
  - `/dataset/stats`
  - `/modify`
  - `/review`
  - `/classifier/train`
  - `/metrics`
- Из-за этого в проекте остались куски старого workflow, которые больше не участвуют в маршрутизации.
- Визуальная система отошла от исходной тёмной палитры из frontend-плана.
  Сейчас токены ориентированы на светлую тему:
  - `frontend/src/app/styles/tokens.css`
- В frontend есть комментарий, хотя по плану комментарии и докстринги запрещены:
  - `frontend/src/pages/classifier-train/ClassifierTrainPage.tsx`

### 5.3 Ограничение по размеру файлов frontend

Правило frontend:

- целевой размер TS/TSX файла: до `250-300` строк
- допускаются исключения, если дробление делает код хуже

Текущее состояние frontend:

- TS/TSX-файлов: `51`
- файлов больше `300` строк: `4`

Крупнейшие frontend TS/TSX-файлы:

1. `frontend/src/pages/classifier-train/ClassifierTrainPage.tsx` — `618`
2. `frontend/src/pages/modify/ModifyPage.tsx` — `514`
3. `frontend/src/features/dataset-upload/DatasetUploadPanel.tsx` — `514`
4. `frontend/src/shared/api/contracts.ts` — `304`

Почти у границы или заметно тяжёлые:

- `frontend/src/features/dataset-library/DatasetCatalog.tsx` — `253`
- `frontend/src/shared/api/workflow.api.ts` — `233`
- `frontend/src/pages/metrics/MetricsPage.tsx` — `221`
- `frontend/src/pages/generate/GeneratePage.tsx` — `210`
- `frontend/src/shared/api/workflow.hooks.ts` — `190`
- `frontend/src/features/generation-review/ReviewQueue.tsx` — `187`
- `frontend/src/shared/api/adapters.ts` — `185`

## 6. Неиспользуемый и частично мёртвый код

### 6.1 Явно неиспользуемые frontend-файлы

Следующие файлы присутствуют в дереве, но не участвуют в текущем маршруте приложения:

- `frontend/src/pages/mode-select/ModeSelectPage.tsx`
- `frontend/src/pages/generate/GeneratePage.tsx`

Дополнительно найден отдельный UI-компонент, который сейчас не используется:

- `frontend/src/features/job-queue/JobsDrawer.tsx`
- `frontend/src/features/job-queue/job-queue.css`

Причина:

- очередь задач уже рендерится непосредственно в `AppShell`
- `JobsDrawer` не импортируется в активный UI

### 6.2 Логически мёртвые frontend-типы и stage-описания

В `frontend/src/shared/types/workflow.ts` остались stage/path-описания для неиспользуемых шагов:

- `mode-select`
- `generate`

Это не обязательно ломает приложение прямо сейчас, но:

- раздувает типовую модель
- маскирует реальный workflow
- повышает риск случайной регрессии при дальнейших изменениях

### 6.3 Логически мёртвые backend-сущности

В `backend/app/domain/enums.py` остались значения, которые уже не выглядят задействованными в актуальном сценарии:

- `WorkflowStage.DOWNLOAD`
- `WorkflowStage.MODE_SELECT`
- `TaskType.EXPORT`
- `WorkflowMode`

Отдельно:

- `WorkflowStage.GENERATE` ещё используется в generation worker и не является полностью мёртвым
- но на уровне текущего frontend-router этот путь уже не является частью основного сценария

## 7. Документальный дрейф

Сами архитектурные markdown-планы уже не полностью соответствуют текущей кодовой базе, потому что раньше проект предполагал отдельный шаг warm-up / fine-tune diffusion runtime.

Из-за этого документы всё ещё ожидают:

- `fine-tune` stage
- `fine-tune` route
- отдельный этап выбора/запуска diffusion warm-up

После выполненного рефакторинга это больше не соответствует продуктовой логике.

Следствие:

- нельзя трактовать каждое несоответствие как баг реализации
- сначала нужно обновить архитектурные `.md`, а уже потом доводить код до нового контракта

## 8. Приоритетный план рефакторинга

### Этап 1. Очистка мёртвого frontend-кода

Цель:

- убрать прямой мусор и остатки старого сценария

Задачи:

1. Удалить:
   - `frontend/src/pages/mode-select/ModeSelectPage.tsx`
   - `frontend/src/pages/generate/GeneratePage.tsx`
2. Удалить:
   - `frontend/src/features/job-queue/JobsDrawer.tsx`
   - `frontend/src/features/job-queue/job-queue.css`
3. Привести `frontend/src/shared/types/workflow.ts` к фактическому маршруту приложения.
4. Проверить и удалить оставшиеся импорты, адаптеры, query hooks и типы, которые существовали только под старые шаги.

Ожидаемый эффект:

- меньше шума в коде
- реальный workflow станет виден прямо из типов и router-слоя

### Этап 2. Обновление архитектурной документации

Цель:

- синхронизировать планы с текущим направлением продукта

Задачи:

1. Обновить `docs/FRONTEND_ARCHITECTURE_PLAN.md`.
2. Обновить `docs/BACKEND_ARCHITECTURE_PLAN.md`.
3. Обновить `REPOSITORY_OVERVIEW_FOR_LLM.md`.

Что исправить в документах:

- убрать обязательный warm-up / fine-tune шаг диффузии
- описать lazy diffusion init внутри generation/modification задачи
- пересобрать актуальный список workflow stages
- отдельно отметить, какие стадии являются опциональными или устаревшими

### Этап 3. Декомпозиция самых больших frontend-файлов

Цель:

- привести frontend к более поддерживаемой модульности

Порядок:

1. `frontend/src/pages/classifier-train/ClassifierTrainPage.tsx`
2. `frontend/src/pages/modify/ModifyPage.tsx`
3. `frontend/src/features/dataset-upload/DatasetUploadPanel.tsx`
4. `frontend/src/shared/api/contracts.ts`

Рекомендации по разбиению:

- выносить form sections в feature-components
- выносить upload/runtime orchestration в hooks или lib-утилиты
- разбивать большие zod-contract файлы по доменам:
  - session
  - review
  - classifier
  - jobs
  - dataset catalog

### Этап 4. Декомпозиция самых больших backend-файлов

Цель:

- удержать backend в пределах читаемости и уменьшить связанность модулей

Порядок:

1. `backend/app/api/workflow_handlers.py`
2. `backend/app/api/session_handlers.py`
3. `backend/app/services/uploads.py`
4. `backend/app/repositories/workflow_assets.py`
5. `backend/app/workers/ml_generation.py`
6. `backend/app/workers/ml_classifier.py`
7. `backend/app/services/diffusion_runtime.py`
8. `backend/app/services/zimage_executor.py`
9. `backend/app/workers/generation.py`

Рекомендации по разбиению:

- разделить handler-файлы по областям ответственности:
  - session
  - dataset
  - generation/modification
  - classifier
  - review
- в `uploads.py` разнести:
  - chunked upload lifecycle
  - import finalization
  - classifier weights upload lifecycle
- в `workflow_assets.py` разнести:
  - queries для review
  - version-related queries
  - lineage-related queries
- в ML-worker коде отделить:
  - bundle/state I/O
  - progress publication
  - runtime loading
  - domain-specific execution

### Этап 5. Удаление висячих backend enum/state-сущностей

Цель:

- убрать остатки старой модели workflow

Задачи:

1. Проверить реальную необходимость:
   - `WorkflowStage.MODE_SELECT`
   - `WorkflowStage.DOWNLOAD`
   - `TaskType.EXPORT`
   - `WorkflowMode`
2. Удалить всё, что больше не используется ни backend, ни frontend.
3. Если что-то пока нужно ради совместимости, явно задокументировать это в коде и в `.md`.

### Этап 6. Ужесточение backend typing

Цель:

- приблизить backend к исходному требованию о строгой типизации

Задачи:

1. Заменять `object` на конкретные runtime types там, где это уже возможно.
2. Типизировать connection/runtime зависимости.
3. Сократить количество словарей без явного typed-контракта на границах сервисов.
4. Постепенно выделять typed DTO/adapters на уровне API и worker payload.

## 9. Предлагаемая последовательность коммитов

1. `chore(frontend): remove dead workflow pages and unused jobs drawer`
2. `chore(docs): update architecture plans after diffusion warmup removal`
3. `refactor(frontend): split classifier and modification pages`
4. `refactor(frontend): split upload panel and api contracts`
5. `refactor(backend): split workflow and session handlers`
6. `refactor(backend): split upload and workflow asset services`
7. `refactor(backend): split ml generation and classifier workers`
8. `refactor(shared): remove obsolete workflow enums and stages`
9. `refactor(backend): tighten typing across session and worker services`

## 10. Что не делать в первую очередь

- Не начинать с тотальной перестройки backend-дерева каталогов под идеальную схему из документа.
  Это большой косметико-структурный рефакторинг с высоким риском шума.
- Не дробить всё подряд только ради лимита строк.
  Сначала убирать мёртвый код и расхождения workflow.
- Не переписывать визуальную тему frontend раньше очистки workflow.
  Это не главный источник технического долга.

## 11. Итог

На текущий момент:

- backend архитектурно в рабочем состоянии и ближе к требованиям
- frontend нуждается в более жёсткой очистке от хвостов старого workflow
- крупные файлы есть и там, и там, но это не самая острая проблема
- первым делом стоит убрать неиспользуемые страницы и компоненты, затем обновить документацию, и только после этого дробить самые тяжёлые файлы
