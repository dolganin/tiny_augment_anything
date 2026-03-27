# tiny_augment_anything

Full-stack приложение для работы с датасетами изображений: импорт архива, выбор классов, генерация и модификация изображений, review результатов и обучение классификатора.

## Что умеет

- импортировать zip-архивы с датасетами;
- хранить версии датасета и превью ассетов;
- запускать single и batch модификацию изображений;
- запускать генерацию через ML worker;
- проводить review результатов и сохранять одобренные изображения обратно в датасет;
- обучать классификатор на текущем датасете и показывать метрики по версиям.

## Архитектура

Проект состоит из четырёх основных сервисов:

- `frontend` - React + Vite интерфейс;
- `backend` - ASGI API, работа с сессиями, каталогом, задачами и review;
- `worker` - core worker для импорта датасетов, orchestration и фоновых задач;
- `ml-worker` - GPU worker для генерации и обучения классификатора.

Инфраструктурные зависимости:

- `postgres` - состояние проекта, версии датасетов, задачи, сессии;
- `redis` - очереди задач и события.

## Основной workflow

Пользовательский сценарий в UI выглядит так:

1. Загрузка нового архива или открытие существующего датасета.
2. Просмотр статистики датасета и выбор классов.
3. Переход в `/modify` для генерации или модификации изображений.
4. Переход в `/review` для отбора результатов.
5. Либо сохранение результатов в датасет, либо запуск обучения классификатора.
6. Переход в `/classifier/train`, затем в `/metrics`.

Актуальные frontend routes:

- `/datasets`
- `/dataset/stats`
- `/modify`
- `/review`
- `/classifier/train`
- `/metrics`

## API и runtime

Backend поднимает:

- HTTP API для датасетов, upload, шаблонов, задач, review, classifier и metrics;
- WebSocket stream `/ws/sessions/{session_id}/stream` для событий по сессии;
- health endpoint `/api/health`.

Core upload flow для датасета chunked:

1. `POST /api/uploads/init`
2. `PUT /api/uploads/{upload_id}/parts`
3. `POST /api/uploads/{upload_id}/complete`

Старый multipart upload endpoint удалён; актуален только chunked upload.

## Быстрый старт через Docker Compose

Подготовка локального конфига:

```bash
cp config/app.yaml.example config/app.yaml
cp .env.example .env
mkdir -p storage/tiny-augment
```

Запуск:

```bash
docker compose up --build
```

После старта сервисы доступны по адресам:

- frontend: `http://localhost:5444`
- backend API: `http://localhost:8000`
- healthcheck: `http://localhost:8000/api/health`

## Конфигурация

Основной runtime config хранится в локальном файле `config/app.yaml`, который не должен коммититься. Шаблон лежит в [config/app.yaml.example](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/config/app.yaml.example).

Ключевые настройки:

- `app.host`, `app.port`, `app.log_level`
- `storage.runtime_dir`
- `postgres.dsn`
- `redis.dsn`
- `executor.script_path`
- `executor.segment_script_path`
- `classifier.pipeline_root`
- `classifier.uv_bin`

Часть параметров может быть переопределена через env vars:

- `APP_CONFIG_PATH`
- `APP_RUNTIME_DIR`
- `POSTGRES_DSN`
- `REDIS_DSN`
- `EXECUTOR_*`
- `CLASSIFIER_*`

Для `docker-compose.yml` используется [`.env.example`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/.env.example).

## Runtime storage

Локальные runtime-данные живут под `storage/` и игнорируются git.

Ожидаемая структура:

```text
storage/
└── tiny-augment/
    ├── datasets/
    ├── sessions/
    ├── temp/
    └── uploads/
```

`storage/` может быстро разрастаться из-за:

- загруженных архивов;
- временных run directories;
- результатов генерации;
- промежуточных файлов обучения.

Это локальное состояние. Перед ручной очисткой стоит убедиться, что в каталоге нет нужных данных.

## Локальная разработка

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend runtime dependencies

Минимальный runtime-набор для backend описан в [backend/requirements.runtime.txt](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/backend/requirements.runtime.txt).

### ML runtime dependencies

ML-часть использует зависимости из:

- [pyproject.toml](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/pyproject.toml)
- [backend/requirements.ml.txt](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/backend/requirements.ml.txt)

Из-за активного merge по зависимостям lockfile стоит обновлять только после разрешения `pyproject.toml` и регенерации `uv.lock`.

## Структура репозитория

```text
backend/        API, workers, repositories, services
frontend/       React приложение
config/         локальные и example-конфиги
docs/           планы, архитектурные заметки и refactor docs
scripts_for_gen/ standalone скрипты для генерации и сегментации
src/            training pipeline и ML код классификатора
storage/        локальные runtime-данные, не в git
```

## Manual scripts

Каталог [`scripts_for_gen/`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/scripts_for_gen) содержит standalone утилиты для ручной подготовки данных и экспериментов. Backend не вызывает их напрямую как часть обычного user flow.

Примеры:

```bash
python scripts_for_gen/segment_evf_sam2_json.py --input-json data/input.json --output-json data/output.json
python scripts_for_gen/segment_sam2_json.py --input-json data/input.json --output-json data/output.json
python scripts_for_gen/train.py --config scripts_for_gen/train.yaml
```

## Tooling

В корне репозитория лежат стандартные project-level файлы:

- [`.gitignore`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/.gitignore)
- [`.editorconfig`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/.editorconfig)
- [`.pre-commit-config.yaml`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/.pre-commit-config.yaml)
- [`.env.example`](/workspace_0/code/YSDA/ML_spring/tiny_augment_anything/.env.example)

Это нормальное место для них: git, editorconfig, pre-commit и docker tooling ожидают такие файлы именно в корне проекта.
