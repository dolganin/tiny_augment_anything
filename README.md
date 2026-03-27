# tiny_augment_anything

Full-stack приложение для работы с датасетами изображений: импорт архива, выбор классов, генерация и модификация изображений, review результатов и обучение классификатора.

## Что это

`tiny_augment_anything` - рабочее приложение для сборки и расширения image dataset'ов через полуавтоматический augmentation pipeline.

![Tiny Augment Anything header](docs/readme-assets/header.jpg)

Проект объединяет в одном интерфейсе несколько этапов:

- загрузку и хранение датасетов;
- выбор рабочих классов;
- генерацию и модификацию изображений;
- отбор результатов;
- дообучение классификатора на обновлённом датасете;
- просмотр метрик по версиям датасета.

Идея проекта в том, чтобы не разносить dataset management, diffusion workflow, review и classifier training по разным скриптам и временным ноутбукам, а держать весь цикл в одной системе с сохранением состояния, задач и артефактов.

## Установка и запуск

Базовый локальный сценарий рассчитан на запуск через Docker Compose.

Подготовка:

```bash
cp config/app.yaml.example config/app.yaml
cp .env.example .env
mkdir -p storage/tiny-augment
```

Запуск всех сервисов:

```bash
docker compose up --build
```

После запуска:

- frontend будет доступен на `http://localhost:5444`;
- backend API будет доступен на `http://localhost:8000`;
- healthcheck backend: `http://localhost:8000/api/health`.

Если нужен локальный runtime config, основой служит `config/app.yaml.example`, а рабочий файл должен лежать в `config/app.yaml`.

## Пайплайн работы

Обычный пользовательский сценарий выглядит так:

1. Создать новый проект через загрузку zip-архива с датасетом или открыть уже существующий.
2. Посмотреть статистику датасета и выбрать классы, с которыми дальше будет работать pipeline.
3. Перейти в режим модификации и подготовить single или batch запуск.
4. Запустить генерацию или модификацию изображений.
5. Перейти в review и отобрать удачные результаты.
6. Либо сохранить результаты обратно в датасет, либо сразу передать их в обучение классификатора.
7. Запустить обучение классификатора и затем смотреть метрики по версиям.

На уровне интерфейса это соответствует маршрутам:

- `/datasets`
- `/dataset/stats`
- `/modify`
- `/review`
- `/classifier/train`
- `/metrics`

![Как работает генерация](docs/readme-assets/workflow-generation.jpg)

## Системные требования

Минимальный practical baseline для разработки и локального запуска:

- Docker и Docker Compose;
- Node.js 20+, если запускать frontend отдельно;
- Python 3.10+, если запускать части backend или ML-инструменты вне контейнеров;
- PostgreSQL 16 и Redis 7, если не использовать compose;
- NVIDIA GPU для `ml-worker`, если нужен полноценный generation/classifier workflow на локальной машине.

Без GPU проект частично поднимется, но ML-сценарии будут либо недоступны, либо сильно ограничены в практической полезности.

## Что умеет

- импортировать zip-архивы с датасетами;
- хранить версии датасета и превью ассетов;
- запускать single и batch модификацию изображений;
- запускать генерацию через ML worker;
- проводить review результатов и сохранять одобренные изображения обратно в датасет;
- обучать классификатор на текущем датасете и показывать метрики по версиям.

## Как устроен проект

Проект состоит из четырёх основных сервисов:

- `frontend` - React + Vite интерфейс;
- `backend` - ASGI API, работа с сессиями, каталогом, задачами и review;
- `worker` - core worker для импорта датасетов, orchestration и фоновых задач;
- `ml-worker` - GPU worker для генерации и обучения классификатора.

Инфраструктурные зависимости:

- `postgres` - состояние проекта, версии датасетов, задачи, сессии;
- `redis` - очереди задач и события.

![Архитектура проекта](docs/readme-assets/architecture.jpg)

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

## Пример результата

Ниже пример пары изображений и промптов, с которыми работает пайплайн при генерации и последующем review качества:

![Пример результата генерации](docs/readme-assets/result-example.jpg)
