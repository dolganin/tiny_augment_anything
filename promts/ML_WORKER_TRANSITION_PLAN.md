# План перехода на раздельные runtime и ML worker

## Цель

Разделить текущую архитектуру на лёгкий backend runtime и отдельный ML runtime, чтобы:

- backend не тянул тяжёлые ML-зависимости
- worker не зависел от train и inference стека без необходимости
- генерация, сегментация и обучение жили в отдельном контейнере
- сборка API не падала из-за скачивания гигабайтных пакетов и нестабильного доступа к PyPI
- очередь задач оставалась под нашим контролем через Redis, без обязательного внедрения Celery

## Целевая схема сервисов

Предлагаемая структура:

- `frontend`
- `backend`
- `worker`
- `ml-worker`
- `postgres`
- `redis`

Роли:

- `frontend`
  UI, маршрутизация, polling, WebSocket, загрузка датасетов, этапы пайплайна

- `backend`
  HTTP и WebSocket API, работа с сессиями, БД, версиями датасета, постановка задач

- `worker`
  orchestration задач, routing по очередям, смена статусов, отмена, heartbeat, регистрация артефактов, файловые run bundle

- `ml-worker`
  исполнение тяжёлых ML задач:
  - `segment_sam2_json.py`
  - `generate_zimage_json.py`
  - позже `train.py`
  - позже обучение классификатора

- `postgres`
  сессии, задачи, версии, lineage, артефакты, статусы

- `redis`
  очереди задач и event stream

## Почему не Celery прямо сейчас

Celery не решает главную текущую проблему, потому что проблема не в отсутствии брокера, а в смешении ролей и зависимостей.

У нас уже есть:

- Redis
- своя очередь задач
- worker lifecycle
- event stream

Поэтому на текущем этапе лучше:

- сохранить свой queue protocol
- развести контейнеры по ответственности
- отделить ML runtime от backend runtime

Celery можно добавить позже, если появится реальная потребность:

- приоритеты задач
- retries policy на уровне фреймворка
- расписания
- несколько пулов исполнителей

Но сейчас это будет лишним слоем сложности.

## Главная проблема текущего состояния

Сейчас `backend` и `worker` собираются через общий `pyproject.toml`, в котором смешаны:

- backend runtime
- train CLI из `src`
- зависимости для `hydra`
- `mlflow`
- `timm`
- `pandas`
- `scikit-learn`
- другие пакеты, которые backend сам по себе не использует

Из-за этого:

- образ скачивает слишком много лишнего
- rebuild ломает docker cache
- любой timeout до PyPI валит runtime image
- backend становится связан с train stack

## Новый принцип сборки

Нужно перестать использовать единый набор зависимостей для всех ролей.

### Для `backend`

Оставить только то, что нужно runtime API:

- `uvicorn`
- `redis`
- `psycopg[binary]`
- `omegaconf`
- всё, что реально импортируется в `backend/app/*`

### Для `worker`

Оставить только orchestration runtime:

- доступ к Redis
- доступ к Postgres
- файловый runtime
- общие backend service modules

Без:

- `torch`
- `diffusers`
- `hydra`
- `mlflow`
- training extras

### Для `ml-worker`

Собрать отдельный образ с тяжёлыми зависимостями:

- `torch`
- `torchvision`
- `diffusers`
- `transformers`
- `accelerate`
- `safetensors`
- `scripts_for_gen/requirements.generate.txt`

Позже:

- отдельный training requirements для `train.py`
- classifier stack

## Очереди задач

Нужно ввести две отдельные очереди:

- `tiny_augment:tasks:core`
- `tiny_augment:tasks:ml`

Тогда:

- `backend` ставит задачу в БД
- `worker` забирает core-задачи
- `worker` создаёт run bundle и при необходимости публикует ML envelope в `tiny_augment:tasks:ml`
- `ml-worker` слушает только ML очередь

## Типы задач

Предлагаемый набор task types:

- `import.dataset`
- `session.select_classes`
- `diffusion.prepare_weights`
- `diffusion.modify`
- `diffusion.train`
- `classifier.train`
- `dataset.export`

На текущем этапе реально нужны:

- `import.dataset`
- `diffusion.modify`
- `dataset.export`
- `classifier.train`

## Контракт между `worker` и `ml-worker`

Не нужно передавать большие JSON payload через Redis.

Правильнее:

- Redis хранит только лёгкий envelope
- все тяжёлые входные и выходные файлы лежат на общем volume

### Envelope в Redis

Пример:

```json
{
  "taskId": "uuid",
  "sessionId": "uuid",
  "taskType": "diffusion.modify",
  "runDir": "/big_data/augment_anything/temp/runs/zimage/..."
}
```

### Что лежит в `runDir`

- `input.json`
- `manifest.json`
- `config.json`
- `segmented.json`
- `output.json`
- `masks/`
- `generated/`
- `stdout.log`
- `stderr.log`

## Поток выполнения задачи модификации

Текущая целевая схема для `diffusion.modify`:

1. `backend` создаёт task в БД
2. `worker` забирает task
3. `worker` создаёт `runDir`
4. `worker` пишет `input.json`
5. `worker` отправляет envelope в ML очередь
6. `ml-worker` читает `runDir`
7. если передана область, запускает `segment_sam2_json.py`
8. затем запускает `generate_zimage_json.py`
9. пишет `output.json`
10. пишет артефакты и логи
11. обновляет статус или публикует event
12. `worker` индексирует результаты в `dataset_assets`
13. `worker` создаёт lineage и переводит сессию на `review`

## Ownership статусов

Есть два варианта.

### Вариант A

`worker` владеет статусами в БД, `ml-worker` только исполняет и пишет файловые результаты.

Плюсы:

- один владелец task state
- проще консистентность

Минусы:

- нужен polling run directory или промежуточный event channel

### Вариант B

`ml-worker` сам обновляет task state и шлёт session events.

Плюсы:

- меньше посредничества
- проще отображать прогресс

Минусы:

- ML runtime получает прямой доступ к БД и session lifecycle
- сложнее разграничить ответственность

На первом этапе лучше вариант B не делать. Практичнее оставить владельцем статусов core worker.

## Файловое хранилище

Все сервисы должны видеть общий runtime volume, например:

- `/big_data/augment_anything`

Он уже используется как общий runtime root. Это правильно и нужно сохранить.

Важно, чтобы одинаково были примонтированы:

- `backend`
- `worker`
- `ml-worker`

Иначе снова появится ошибка с путями на разных контейнерах.

## Что нужно поменять в Docker

### Новый `backend/Dockerfile`

Только лёгкие runtime зависимости.

Без:

- `uv sync` по полному `pyproject.toml`
- train stack
- ML inference stack

### Новый `worker/Dockerfile`

Тоже лёгкий образ, возможно вообще от того же base layer, что и backend.

### Новый `ml/Dockerfile`

Тяжёлый ML image с:

- `torch`
- `torchvision`
- `scripts_for_gen/requirements.generate.txt`
- позже training requirements

### Compose

Нужно добавить сервис:

- `ml-worker`

И примонтировать в него:

- `./scripts_for_gen:/app/scripts_for_gen`
- `./storage/tiny-augment:/big_data/augment_anything`
- при необходимости checkpoints directory

## Что делать с `pyproject.toml`

Есть два рабочих варианта.

### Вариант 1

Вообще не использовать `pyproject.toml` для `backend` и `worker` image.

Вместо этого:

- `backend/requirements.runtime.txt`
- `worker/requirements.runtime.txt`

Это самый практичный путь для текущего состояния.

### Вариант 2

Разделить `pyproject.toml` на optional extras:

- runtime
- train
- experiment
- generate

Это чище долгосрочно, но потребует аккуратного рефакторинга зависимостей.

На ближайшем этапе лучше вариант 1.

## Пошаговый план перехода

### Этап 1

Разрезать Docker images:

- облегчить `backend`
- облегчить `worker`
- добавить `ml-worker`

### Этап 2

Ввести две Redis очереди:

- core
- ml

### Этап 3

Перенести `diffusion.modify` в ML очередь.

### Этап 4

Оставить у `worker`:

- import
- status updates
- indexing results
- versioning
- review transition

### Этап 5

Позже вынести туда же:

- `diffusion.prepare_weights`
- `diffusion.train`
- classifier training

## Плюсы новой схемы

- backend перестаёт зависеть от тяжёлого ML стека
- пересборка API становится быстрой
- сетевые проблемы с PyPI бьют только по `ml-worker`
- проще поддерживать GPU отдельно
- проще масштабировать ML executors
- orchestration и business logic остаются в одном месте

## Минусы новой схемы

- контейнеров становится больше
- нужно аккуратно организовать ownership task state
- нужен строгий файловый контракт
- понадобится аккуратный routing задач

## Минимальный practical результат после перехода

После первого законченного этапа должно быть так:

- `backend` и `worker` собираются быстро и стабильно
- `backend` не тянет `hydra-core`, `antlr4-python3-runtime`, `mlflow`, `timm`
- `ml-worker` отдельно собирает только нужный inference stack
- задача модификации исполняется через ML очередь
- файловый runtime остаётся общим

## Следующий шаг реализации

Следующим шагом имеет смысл реализовать:

1. новый `ml/Dockerfile`
2. сервис `ml-worker` в `docker-compose.yml`
3. новую ML queue в Redis
4. routing `diffusion.modify` в `ml-worker`
5. облегчение `backend` и `worker` до runtime-only образов
