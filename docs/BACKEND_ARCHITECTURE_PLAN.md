# План backend-архитектуры для Tiny Augment Anything

## 1. Цель документа

Нужно спроектировать backend для локального приложения по аугментации датасета, где фронтенд уже построен вокруг `sessionId`, пошагового workflow, восстановления состояния после перезагрузки и WebSocket-стрима прогресса. Backend должен:

- стабильно принимать большие `.zip`-архивы
- хранить состояние сессии между перезагрузками страницы и перезапусками контейнеров
- поддерживать долгие операции через WebSocket и polling fallback
- сохранять попытки аугментации и их результаты
- хранить происхождение сгенерированных изображений
- поддерживать версионирование датасета без вмешательства в ML-логику

## 2. Жёсткие ограничения

- При реализации использовать только Python, Uvicorn, PostgreSQL и Redis.
- Backend проектируется как ASGI-приложение на Python, запускаемое через Uvicorn.
- PostgreSQL является источником истины для бизнес-состояния.
- Redis используется только для очередей, pub/sub, блокировок и краткоживущего runtime-состояния.
- Хранилище файлов должно быть вынесено в volume на хосте, иначе требование восстановления между перезапусками контейнера не выполняется.
- Авторизации нет, приложение локальное и однопользовательское.
- ML-компоненты считаются внешним исполнителем с контрактом входа и выхода.
- Каждый этап реализации завершается отдельным git-коммитом.

## 3. Что уже ожидает frontend

По текущему коду фронтенда backend должен поддержать как минимум следующие сущности и сценарии:

- `sessionId`, который хранится в persisted store и используется для восстановления через `GET /sessions/{sessionId}`
- workflow-стадии: `upload`, `dataset-stats`, `modify`, `review`, `classifier-train`, `metrics`
- WebSocket-канал `.../sessions/{sessionId}/stream`
- получение статистики классов
- сохранение выбранных классов
- получение редактируемой конфигурации генерации
- запуск модификации
- review с подтверждением и отклонением каждого результата по одному
- запуск обучения классификатора
- получение метрик и скачивание готового архива из dataset catalog
- выдачу файлов по пути внутри backend storage через `/assets?path=...`

Из этого следует, что backend должен быть session-centric, а не job-centric.

## 4. Главный архитектурный принцип

Нужна не просто цепочка endpoint'ов, а единая модель рабочего состояния:

- сессия хранит текущий workflow и выбранный пользователем контекст
- долгие задачи изменяют состояние сессии транзакционно
- датасет живёт как набор версий
- генерации и модификации сначала создают кандидатов, а не сразу новую версию датасета
- новая версия датасета появляется только после пользовательского approve

Это даёт четыре полезных свойства:

1. перезагрузка страницы не ломает процесс
2. пропущенные WebSocket-события восстанавливаются из snapshot
3. review управляет именно кандидатами, а не уже закоммиченным датасетом
4. lineage можно хранить реляционно и прозрачно

## 5. Почему здесь не нужна Cassandra

Cassandra здесь избыточна.

Причины:

- приложение локальное и однопользовательское
- объём lineage ограничен сессиями одного пользователя, а не миллиардами событий
- нужны транзакции вокруг approve, reject и фиксации новой версии датасета
- нужны выборки по текущей версии, по run, по родителю и по дочерним изображениям
- PostgreSQL лучше подходит для связной модели данных и для агрегатов по workflow

Для связи родитель -> потомок достаточно PostgreSQL-таблицы рёбер:

- `dataset_asset_links`
- индекс по `parent_asset_id`
- индекс по `child_asset_id`
- уникальность на пару `parent_asset_id`, `child_asset_id`, `relation_type`

Если у результата всегда один родитель, можно хранить `parent_asset_id` прямо в `dataset_assets`. Если нужна заделка под несколько родителей, лучше сразу использовать отдельную таблицу связей. Для этого проекта второй вариант надёжнее.

## 6. Предлагаемая структура backend-модуля

```text
backend/
  app/
    asgi.py
    config/
      settings.py
    api/
      http/
        sessions.py
        datasets.py
        generation.py
        classifier.py
        assets.py
      ws/
        session_stream.py
    domain/
      enums.py
      models/
      dto/
    services/
      session_service.py
      dataset_service.py
      versioning_service.py
      task_service.py
      review_service.py
      export_service.py
    repositories/
      session_repository.py
      dataset_repository.py
      task_repository.py
      metrics_repository.py
    workers/
      queue_consumer.py
      modification_worker.py
      classifier_worker.py
    integrations/
      ml_contracts.py
      file_storage.py
      redis_bus.py
      postgres.py
    runtime/
      snapshot_builder.py
      event_publisher.py
      idempotency.py
      locks.py
```

Разделение должно быть таким:

- `api` только принимает и отдаёт DTO
- `services` управляют бизнес-правилами
- `repositories` работают с PostgreSQL
- `workers` выполняют долгие операции и общаются с внешним ML
- `runtime` занимается доставкой событий, блокировками и сборкой snapshot

## 7. Хранение данных и артефактов

### 7.1 PostgreSQL

PostgreSQL хранит:

- сессии
- выбранные классы
- стадии workflow
- задачи и их статусы
- версии датасета
- assets и lineage
- метрики
- ссылки на архивы, превью и исходники

### 7.2 Redis

Redis хранит:

- очереди долгих задач
- pub/sub для WebSocket-событий
- session lock на время критических операций
- heartbeat running-задач
- краткоживущий кэш свежего snapshot

### 7.3 Файловое хранилище

Нужно хранить не бинарные файлы в PostgreSQL, а только их относительные пути.

Рекомендуемая раскладка:

```text
runtime_data/
  uploads/
    {session_id}/source.zip
  datasets/
    {dataset_id}/
      originals/
      generated/
      modified/
      previews/
      exports/
  manifests/
    {dataset_id}/v{version_index}.json
  temp/
    {session_id}/
```

В БД нужно хранить только относительный путь от `runtime_data`.

## 8. Session model

Сессия должна быть отдельной доменной сущностью, а не просто связкой запросов.

Поля сессии:

- `id`
- `status`
- `workflow_stage`
- `dataset_id`
- `current_dataset_version_id`
- `selected_classes`
- `active_task_id`
- `last_error`
- `revision`
- `created_at`
- `updated_at`
- `last_seen_at`

Ключевой момент: каждое изменение сессии увеличивает `revision`. Это позволяет фронтенду восстанавливаться не только по WebSocket, но и по polling.

## 9. Модель версий датасета

Предлагается вести датасет как append-only историю версий.

### 9.1 Базовая идея

- после загрузки архива создаётся версия `v1`
- генерация и модификация создают кандидатов
- approve кандидата создаёт новую версию `vN+1`
- reject кандидата не создаёт версию, а переводит результат в terminal state
- текущей рабочей версией считается последняя approved-версия

### 9.2 Что считается версией

Версия описывает состав датасета, который можно:

- показать пользователю
- отправить в classifier training
- собрать в `.zip`
- восстановить позже

### 9.3 Практическая модель

Рекомендую хранить версию не как полную копию файлов, а как checkpoint состава датасета:

- таблица `dataset_versions` хранит метаданные версии
- таблица `dataset_assets` хранит физические файлы и их происхождение
- для быстрых восстановлений каждая версия дополнительно получает materialized manifest на диске

Это даёт баланс между простотой и воспроизводимостью.

## 10. Предлагаемая схема таблиц

### 10.1 sessions

- `id uuid pk`
- `workflow_stage text`
- `dataset_id uuid null`
- `current_dataset_version_id uuid null`
- `selected_classes jsonb not null default '[]'`
- `last_error jsonb null`
- `revision bigint not null`
- `created_at timestamptz`
- `updated_at timestamptz`
- `last_seen_at timestamptz`

### 10.2 datasets

- `id uuid pk`
- `session_id uuid not null`
- `name text`
- `source_archive_path text not null`
- `status text`
- `created_at timestamptz`
- `updated_at timestamptz`

### 10.3 dataset_versions

- `id uuid pk`
- `dataset_id uuid not null`
- `version_index integer not null`
- `parent_version_id uuid null`
- `kind text not null`
- `status text not null`
- `manifest_path text not null`
- `summary jsonb not null`
- `created_by_task_id uuid null`
- `created_at timestamptz`

Ограничения:

- unique `(dataset_id, version_index)`

### 10.4 dataset_assets

- `id uuid pk`
- `dataset_id uuid not null`
- `class_name text not null`
- `origin_type text not null`
- `storage_path text not null`
- `preview_path text null`
- `checksum text null`
- `width integer null`
- `height integer null`
- `source_run_id uuid null`
- `approved_in_version_id uuid null`
- `rejected_at timestamptz null`
- `deleted_at timestamptz null`
- `created_at timestamptz`

Смысл:

- оригинальные файлы получают `approved_in_version_id = v1`
- кандидаты генерации до approve остаются с `approved_in_version_id = null`

### 10.5 dataset_asset_links

- `id uuid pk`
- `child_asset_id uuid not null`
- `parent_asset_id uuid not null`
- `relation_type text not null`
- `position smallint not null default 0`
- `created_at timestamptz`

Индексы:

- `(parent_asset_id)`
- `(child_asset_id)`
- unique `(child_asset_id, parent_asset_id, relation_type, position)`

### 10.6 tasks

- `id uuid pk`
- `session_id uuid not null`
- `task_type text not null`
- `status text not null`
- `dataset_version_id uuid null`
- `payload jsonb not null`
- `result jsonb null`
- `progress numeric(5,2) null`
- `message text null`
- `error jsonb null`
- `heartbeat_at timestamptz null`
- `created_at timestamptz`
- `started_at timestamptz null`
- `finished_at timestamptz null`

### 10.7 task_events

- `id bigserial pk`
- `task_id uuid not null`
- `session_id uuid not null`
- `event_type text not null`
- `payload jsonb not null`
- `created_at timestamptz`

Эта таблица нужна для:

- восстановления логов после reload
- диагностики
- WebSocket replay при необходимости

### 10.8 augmentation_runs

- `id uuid pk`
- `session_id uuid not null`
- `task_id uuid not null`
- `mode text not null`
- `dataset_version_id uuid not null`
- `prompt text null`
- `source_asset_id uuid null`
- `config jsonb not null`
- `target_count integer not null`
- `generated_count integer not null default 0`
- `approved_count integer not null default 0`
- `rejected_count integer not null default 0`
- `status text not null`
- `created_at timestamptz`
- `updated_at timestamptz`

### 10.9 classifier_runs

- `id uuid pk`
- `session_id uuid not null`
- `task_id uuid not null`
- `dataset_version_id uuid not null`
- `status text not null`
- `metrics jsonb null`
- `created_at timestamptz`
- `finished_at timestamptz null`

## 11. Long-running task model

Все долгие операции нужно унифицировать:

- upload validation
- fine-tune
- generation
- modification
- classifier training
- export zip

У всех одинаковый lifecycle:

- `pending`
- `running`
- `success`
- `error`
- `cancelled`

Каждая задача обязана:

- писать heartbeat
- обновлять `progress`
- публиковать event в Redis и сохранять event в PostgreSQL
- менять snapshot сессии в одной транзакции с ключевыми бизнес-изменениями

## 12. WebSocket и polling

Frontend уже ориентирован на WebSocket, но только WebSocket недостаточен.

Нужна схема:

- WebSocket является основным live-каналом
- `GET /sessions/{sessionId}` возвращает полный snapshot
- `GET /sessions/{sessionId}/tasks/{taskId}` возвращает текущий status для polling fallback
- каждый snapshot содержит `revision`
- каждое событие WebSocket содержит `eventId` и `revision`

Рекомендуемый поток восстановления:

1. фронтенд поднимается и читает `sessionId` из local storage
2. вызывает `GET /sessions/{sessionId}`
3. получает актуальный snapshot
4. открывает WebSocket
5. если WebSocket умер, фронтенд продолжает polling по snapshot и task status

Такой дизайн устойчив к:

- reload страницы
- рестарту frontend-контейнера
- временному разрыву WebSocket
- пропуску отдельных событий

## 13. Контракт snapshot для восстановления сессии

Минимальный ответ `GET /sessions/{sessionId}` должен включать:

- `sessionId`
- `datasetId`
- `datasetName`
- `selectedClasses`
- `currentMode`
- `fineTuneEnabled`
- `fineTuneResolved`
- `workflowStage`
- `currentDatasetVersionId`
- `activeTasks`
- `latestMetrics`
- `downloadPath`
- `revision`

Желательно добавить:

- `pendingReviewCount`
- `approvedCount`
- `rejectedCount`
- `lastEventId`
- `lastError`

## 14. Контракт с внешним ML-слоем

ML-часть не трогаем, но backend должен быть строгим посредником.

### 14.1 Fine-tune input

- `task_id`
- `session_id`
- `dataset_id`
- `dataset_version_id`
- `selected_classes`
- `training_output_dir`
- `config`

### 14.2 Generation input

- `task_id`
- `session_id`
- `dataset_id`
- `dataset_version_id`
- `prompt`
- `sample_count`
- `config`
- `output_dir`

### 14.3 Modification input

- `task_id`
- `session_id`
- `dataset_id`
- `dataset_version_id`
- `source_asset_path`
- `source_asset_id`
- `sample_count`
- `config`
- `output_dir`

### 14.4 Classifier training input

- `task_id`
- `session_id`
- `dataset_id`
- `dataset_version_id`
- `dataset_manifest_path`
- `output_dir`

### 14.5 ML output, который backend обязан принять

- статус задачи
- прогресс
- лог-сообщения
- пути до артефактов
- метаданные изображений
- финальный результат или ошибка

## 15. Review и фиксация lineage

Review должен работать поверх кандидатов.

### 15.1 Generate

Для генерации без исходного изображения:

- создаётся `dataset_asset` c `origin_type = generated`
- при необходимости link не создаётся
- связь идёт через `source_run_id`

### 15.2 Modify

Для модификации:

- создаётся `dataset_asset` c `origin_type = modified`
- создаётся запись в `dataset_asset_links`
- `parent_asset_id` указывает на исходное изображение

### 15.3 Approve

При approve одного изображения backend делает атомарно:

1. создаёт новую версию датасета
2. проставляет кандидату `approved_in_version_id`
3. обновляет manifest новой версии
4. обновляет счётчики run
5. обновляет snapshot сессии

### 15.4 Reject

При reject backend делает атомарно:

1. помечает asset отклонённым
2. удаляет физический файл
3. оставляет metadata в БД для аудита попытки
4. обновляет счётчики run и snapshot

Именно так пользователь потом сможет понять, что из чего было получено, даже если файл уже удалён.

## 16. Экспорт итогового датасета

Нельзя собирать архив по клику пользователя синхронно.

Правильный поток:

- после classifier training или по отдельному явному действию создаётся export task
- task собирает `.zip` для текущей approved-версии
- путь до архива сохраняется в БД
- frontend на экране download получает уже готовую ссылку

## 17. Идемпотентность и защита от дублей

Без этого локальный UX быстро развалится.

Нужно защитить:

- повторную отправку выбора классов
- повторный запуск fine-tune
- двойной approve одного и того же asset
- повторный reject уже удалённого кандидата
- повторный запуск classifier training на той же версии

Минимальный механизм:

- session-level lock в Redis
- уникальные ограничения в PostgreSQL
- проверка terminal state перед изменением

## 18. Строгая типизация в Python

Так как требование на сильный typing явно задано, backend-план должен исходить из typed-first подхода:

- `dataclass(slots=True)` для внутренних DTO
- `TypedDict` для JSON payload, если нужен точный shape
- `Literal` и `Enum` для task type, workflow stage и asset origin
- `Protocol` для ML adapter и repository interface
- явные типы `UUID`, `Path`, `datetime`, `Decimal`, `Sequence[str]`
- никаких `Any`, кроме совсем неизбежных узких boundary-мест

## 19. Набор endpoint'ов

### 19.1 Sessions

- `POST /api/sessions/upload`
- `GET /api/sessions/{sessionId}`
- `GET /api/sessions/{sessionId}/tasks/{taskId}`
- `GET /ws/sessions/{sessionId}/stream`

### 19.2 Dataset

- `GET /api/sessions/{sessionId}/dataset/stats`
- `POST /api/sessions/{sessionId}/dataset/classes`
- `GET /api/assets?path=...`

### 19.3 Diffusion

- `POST /api/sessions/{sessionId}/diffusion/fine-tune`
- `GET /api/sessions/{sessionId}/generation/config`
- `POST /api/sessions/{sessionId}/generation`
- `GET /api/sessions/{sessionId}/modification/source`
- `POST /api/sessions/{sessionId}/modification`

### 19.4 Review

- `GET /api/sessions/{sessionId}/results`
- `POST /api/sessions/{sessionId}/results/{assetId}/approve`
- `POST /api/sessions/{sessionId}/results/{assetId}/reject`

### 19.5 Classifier and export

- `POST /api/sessions/{sessionId}/classifier/train`
- `GET /api/sessions/{sessionId}/metrics`
- `GET /api/sessions/{sessionId}/download`

## 20. Стратегия реализации по этапам

### Этап 1. Каркас backend

- поднять ASGI-приложение под Uvicorn
- добавить конфиг окружения
- подготовить PostgreSQL и Redis подключения
- подготовить volume для `runtime_data`

Коммит:

- `feat(backend): bootstrap asgi app with postgres and redis runtime`

### Этап 2. Session storage и snapshot

- реализовать `sessions`, `datasets`, `dataset_versions`
- реализовать `GET /sessions/{sessionId}`
- реализовать `revision` и snapshot builder

Коммит:

- `feat(backend): add persistent session snapshot model`

### Этап 3. Загрузка архива и анализ датасета

- реализовать upload endpoint
- сделать потоковую запись архива на диск
- валидировать структуру
- создать `v1` и статистику классов

Коммит:

- `feat(backend): add dataset upload and initial version creation`

### Этап 4. Task engine

- унифицировать long-running tasks
- подключить Redis queue и worker process
- сохранять `task_events` и heartbeat

Коммит:

- `feat(backend): add task queue, worker runtime and progress events`

### Этап 5. Fine-tune и live-стрим

- реализовать запуск fine-tune
- реализовать WebSocket session stream
- добавить fallback task polling

Коммит:

- `feat(backend): add fine-tune workflow with websocket recovery`

### Этап 6. Generation и modification

- реализовать конфиг генерации
- реализовать запуск генерации
- реализовать выдачу source image для modification
- сохранять candidate assets и run metadata

Коммит:

- `feat(backend): add generation and modification runs`

### Этап 7. Review и version control

- реализовать approve/reject
- реализовать `dataset_asset_links`
- реализовать создание новых версий датасета

Коммит:

- `feat(backend): add review flow and dataset version lineage`

### Этап 8. Classifier и export

- реализовать запуск classifier training
- сохранять метрики
- собирать и публиковать export zip

Коммит:

- `feat(backend): add classifier workflow and export pipeline`

### Этап 9. Recovery и edge cases

- проверить рестарт frontend-контейнера
- проверить рестарт backend-контейнера
- проверить потерю WebSocket
- проверить идемпотентность approve/reject

Коммит:

- `chore(backend): harden recovery and workflow edge cases`

## 21. Основные риски

- неочевиден точный формат связи с ML-исполнителем
- не определены лимиты по размеру архива и времени распаковки
- не определено, нужен ли список старых сессий, если local storage потерян
- не определено, нужно ли хранить отклонённые preview для последующего UX-показа
- не определено, считать ли approve одного изображения отдельной версией или группировать в review batch

## 22. Вопросы, которые стоит закрыть до реализации

1. ОТВЕТ: нужно хранить датасеты, к которым привязан будет последний сешн, в котором в них что-то правилось.
2. ОТВЕТ: пока не проанализирован архив, сайт должен висеть и показывать пользователю, что загрузка идёт.
3. ОТВЕТ: отклоненные изображения сохранять не нужно.
4. ОТВЕТ: версия датасета должна создаваться автоматически по нажатию на кнопку сохранить при аппрувах картинок, либо через каждые 5 минут во время правок пользователем.
5. ОТВЕТ: попробуем сделать полную систему контроля версий датасета с откатом и коммитами.
6. ОТВЕТ: только при открытии окна нужно пересчитывать статистику.
7. ОТВЕТ: classifier training, а также training дифффузионной сети должны быть доступны всегда, там пользователь может свободно ходить.
8. ОТВЕТ: пользователь всё может прервать.

## 23. Итоговое решение

Оптимальная архитектура для этого проекта — session-centric backend на Python под Uvicorn, где PostgreSQL хранит сессии, задачи, версии датасета и lineage, Redis обслуживает очередь и live-события, а файловое хранилище лежит на постоянном volume. Для связи родительских и дочерних изображений достаточно PostgreSQL-модели `dataset_assets` + `dataset_asset_links`; Cassandra здесь не даёт выгоды, зато усложняет консистентность, recovery и version control.
