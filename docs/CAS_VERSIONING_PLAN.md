# План рефакторинга системы версионирования датасетов

## Цель
Трансформировать текущую систему версионирования в Content-Addressable Storage (CAS) систему по типу Git для обеспечения:
- Экономии дискового пространства через дедупликацию (приоритет №1)
- Полной истории версий с возможностью rollback
- Эффективного хранения больших датасетов (10K-100K+ изображений)

## Текущие проблемы

### Критические
1. **Нет файлового версионирования** - все файлы в общих папках, rollback невозможен
2. **Дублирование данных** - манифесты дублируют БД без синхронизации
3. **Мертвые файлы** - soft delete без garbage collection накапливает файлы
4. **Нет дедупликации** - идентичные файлы хранятся отдельно
5. **ROLLBACK объявлен но не реализован** - `VersionKind.ROLLBACK` существует но не работает

### Текущая архитектура (baseline)
- БД = источник истины (manifests только для архива)
- SHA256 checksums уже вычисляются (uploads.py:4) но не используются для dedup
- Hard links используются в classifier training (доказывает работоспособность)
- Parent-child tracking версий уже есть
- Asset linking отслеживает derivation

## Решение: Content-Addressable Storage (CAS)

### Архитектура

```
┌─────────────────────────────────────────┐
│         CAS ARCHITECTURE                 │
├─────────────────────────────────────────┤
│                                          │
│  Database (metadata)                     │
│    ├─ Version snapshots (lightweight)   │
│    ├─ Asset → blob_hash references      │
│    └─ Blob registry (hash → path)       │
│                      ↓                   │
│  Filesystem (content)                    │
│    └─ blobs/{hash[:2]}/{hash[2:]}       │
│         (immutable, deduplicated)        │
└─────────────────────────────────────────┘
```

### Преимущества над альтернативами

| Подход | Storage | Rollback | Для больших датасетов |
|--------|---------|----------|----------------------|
| **CAS (выбрано)** | Отлично (dedup) | Мгновенно | ✅ Отлично |
| Delta encoding | Хорошо | Медленно (replay) | ⚠️ Сложность |
| Copy-on-Write | Хорошо | Средне | ✅ Хорошо |
| Full snapshots | Плохо | Мгновенно | ❌ Раздувается |

**Почему CAS оптимален:**
- Бинарные изображения плохо сжимаются дельтами
- Originals не меняются между версиями → нулевая дупликация
- Случайно идентичные generated изображения автоматически дедуплицируются
- SHA256 уже вычисляется, просто используем для хранения
- Hard links уже работают в коде

## Фазы реализации

### Фаза 1: Схема БД и blob storage (Неделя 1)
**Цель:** Фундамент - таблицы и файловая структура

**Файлы для модификации:**

1. **backend/app/storage/schema.py** (160 строк → +150 строк SQL)
   - Добавить таблицы:
     ```sql
     -- Реестр content blobs
     CREATE TABLE content_blobs (
         blob_hash text PRIMARY KEY,
         size_bytes bigint NOT NULL,
         storage_path text NOT NULL,
         first_seen_at timestamptz NOT NULL,
         ref_count integer NOT NULL DEFAULT 0
     );

     -- Привязка assets к blobs
     CREATE TABLE asset_blobs (
         id uuid PRIMARY KEY,
         asset_id uuid NOT NULL REFERENCES dataset_assets(id),
         blob_hash text NOT NULL REFERENCES content_blobs(blob_hash),
         is_preview boolean NOT NULL DEFAULT false
     );
     ```
   - Расширить dataset_assets:
     ```sql
     ALTER TABLE dataset_assets
     ADD COLUMN blob_hash text NULL,
     ADD COLUMN preview_blob_hash text NULL,
     ADD COLUMN legacy_storage_path text NULL;
     ```
   - Расширить dataset_versions:
     ```sql
     ALTER TABLE dataset_versions
     ADD COLUMN blob_count integer NULL,
     ADD COLUMN rollback_target_version_id uuid NULL;
     ```

2. **backend/app/services/filesystem.py** (94 строки → +30 строк)
   - Добавить функции:
     ```python
     def blob_storage_path(blob_hash: str) -> Path:
         """blobs/ab/cdef123456..."""
         return Path("blobs") / blob_hash[:2] / blob_hash[2:]

     def blob_storage_dir(runtime_paths: RuntimePaths) -> Path:
         return runtime_paths.base / "blobs"
     ```

3. **backend/app/services/blob_storage.py** (НОВЫЙ, ~300 строк)
   - Реализовать:
     ```python
     async def store_blob(connection, runtime_root: Path, file_data: bytes) -> tuple[str, Path]
     async def get_blob_path(connection, blob_hash: str) -> Path | None
     def compute_blob_hash(file_data: bytes) -> str
     async def verify_blob_integrity(runtime_root: Path, blob_hash: str) -> bool
     ```
   - Паттерн: похож на uploads.py, но для content-addressable storage

**Критерий готовности:**
- Миграция схемы применяется без ошибок
- `store_blob()` сохраняет файл в `blobs/{hash[:2]}/{hash[2:]}`
- Дубликаты дедуплицируются (ref_count увеличивается)
- Unit tests покрывают blob operations

---

### Фаза 2: Hybrid режим - новые uploads через CAS (Неделя 2)
**Цель:** Новые данные идут через CAS, старые работают через legacy paths

**Файлы для модификации:**

4. **backend/app/services/uploads.py** (526 строк → +50 строк)
   - Изменить `_extract_assets()` (строка ~400+):
     ```python
     # Было:
     target_path.write_bytes(data)
     checksum = sha256(data).hexdigest()

     # Станет:
     blob_hash, blob_path = await store_blob(connection, runtime_root, data)
     # storage_path для backward compat
     storage_path = str(blob_path)
     ```
   - Обновить INSERT в `create_assets()`:
     ```python
     INSERT INTO dataset_assets (..., blob_hash, storage_path, checksum)
     VALUES (..., %s, %s, %s)
     ```

5. **backend/app/workers/ml_generation.py** (515 строк → +30 строк)
   - Изменить сохранение результатов (строка ~260):
     ```python
     # Было:
     target_path.write_bytes(result_path.read_bytes())

     # Станет:
     data = result_path.read_bytes()
     blob_hash, blob_path = await store_blob(connection, runtime_root, data)
     ```

6. **backend/app/api/assets_handlers.py** (139 строк → +30 строк)
   - Расширить `asset_by_path()` для blob resolution:
     ```python
     # Поддержать blob hash как path:
     if re.match(r'^[0-9a-f]{64}$', raw_path):
         blob_path = await get_blob_path(connection, raw_path)
         resolved_path = runtime_root / blob_path
     else:
         # Legacy path
         resolved_path = runtime_root / raw_path
     ```

7. **backend/app/services/downloads.py** (45 строк → +20 строк)
   - Обновить `build_dataset_download_archive()`:
     ```python
     # JOIN с content_blobs для получения blob paths
     SELECT a.id, a.class_name, a.blob_hash,
            cb.storage_path as blob_storage_path,
            a.storage_path as legacy_path
     FROM dataset_assets a
     LEFT JOIN content_blobs cb ON cb.blob_hash = a.blob_hash
     ...

     # Resolve path: prefer blob, fallback to legacy
     file_path = runtime_root / (blob_storage_path or legacy_path)
     ```

**Критерий готовности:**
- Новый uploaded датасет создает blobs в `blobs/*/`
- Generated изображения сохраняются как blobs
- Export работает как с blob paths, так и legacy paths
- Существующие датасеты продолжают работать (backward compat)
- E2E test: upload → generate → export

---

### Фаза 3: CAS версионирование и ROLLBACK (Неделя 3)
**Цель:** Версии становятся lightweight snapshots, rollback работает

**Файлы для модификации:**

8. **backend/app/repositories/workflow_assets.py** (513 строк → +100 строк)
   - Изменить `finalize_review_decisions()` (строка ~300+):
     ```python
     # Вместо копирования asset rows, просто создать version snapshot
     # Подсчитать unique blob_hash'и:
     unique_blobs = set(row['blob_hash'] for row in active_assets)

     # При INSERT в dataset_versions добавить:
     blob_count = len(unique_blobs)
     total_bytes = sum(blob_sizes)
     ```
   - Обновить `create_version_from_current_state()` аналогично

9. **backend/app/services/versioning.py** (36 строк → +50 строк)
   - Расширить `write_version_manifest()`:
     ```json
     {
       "datasetId": "...",
       "versionId": "...",
       "summary": {
         "assetCount": 1500,
         "uniqueBlobsCount": 1200,
         "totalBytes": 450000000
       },
       "assets": [
         {
           "id": "...",
           "className": "...",
           "blobHash": "abcdef...",
           "sizeBytes": 245000
         }
       ],
       "blobIndex": {
         "abcdef...": {"assetIds": ["..."], "refCount": 2}
       }
     }
     ```

10. **backend/app/repositories/versions.py** (НОВЫЙ, ~400 строк)
    - Реализовать:
      ```python
      async def rollback_to_version(connection, session_id: UUID, target_version_id: UUID) -> UUID
      async def list_dataset_versions(connection, dataset_id: UUID) -> list[dict]
      async def get_version_diff(connection, version1_id: UUID, version2_id: UUID) -> dict
      ```
    - Ключевая логика rollback:
      ```python
      # 1. Найти assets из target version
      # 2. Создать новую version с kind=ROLLBACK
      # 3. Создать новые asset rows с теми же blob_hash
      # 4. Обновить session.current_dataset_version_id
      # НЕТ копирования файлов - только метаданные!
      ```

11. **backend/app/api/workflow_handlers.py** (+30 строк)
    - Добавить endpoint:
      ```python
      @app.post("/api/datasets/{dataset_id}/rollback")
      async def rollback_dataset(request, params, state):
          target_version_id = UUID(request.json()["targetVersionId"])
          new_version_id = await rollback_to_version(
              connection, session_id, target_version_id
          )
          return {"versionId": str(new_version_id)}
      ```

**Критерий готовности:**
- Создание версии занимает <100ms (только metadata INSERT)
- Rollback к любой версии работает мгновенно (<500ms)
- После rollback все assets доступны
- Version history отображает ROLLBACK версии корректно
- E2E test: import → modify → approve → rollback → verify

---

### Фаза 4: Миграция существующих данных (Неделя 4)
**Цель:** Перевести legacy датасеты в CAS формат

**Файлы для создания:**

12. **backend/app/services/migration.py** (НОВЫЙ, ~400 строк)
    - Реализовать:
      ```python
      async def migrate_dataset_to_cas(
          connection,
          runtime_root: Path,
          dataset_id: UUID,
          batch_size: int = 100
      ) -> dict

      async def verify_migration(connection, dataset_id: UUID) -> dict

      async def get_migration_status(connection, dataset_id: UUID) -> dict
      ```
    - Логика миграции:
      ```python
      # 1. Найти все assets без blob_hash
      # 2. Для каждого батча:
      #    - Прочитать файл из legacy path
      #    - Вычислить SHA256, проверить checksum
      #    - store_blob() (дедуплицирует автоматически)
      #    - UPDATE dataset_assets SET blob_hash, legacy_storage_path
      # 3. Вернуть статистику (migrated, deduplicated, bytes_saved)
      ```

13. **backend/app/api/admin_handlers.py** (НОВЫЙ, ~150 строк)
    - Admin endpoints:
      ```python
      POST /api/admin/datasets/{id}/migrate  # Запустить миграцию
      GET  /api/admin/datasets/{id}/migrate  # Статус миграции
      POST /api/admin/migrate-all            # Мигрировать все датасеты
      ```

14. **scripts/migrate_to_cas.py** (НОВЫЙ, ~200 строк)
    - CLI tool:
      ```bash
      python scripts/migrate_to_cas.py --dataset-id <uuid>
      python scripts/migrate_to_cas.py --all --batch-size 50
      python scripts/migrate_to_cas.py --dry-run  # Только анализ
      ```
    - Выводить:
      ```
      Migrating dataset: AK_PIC (12,543 assets)
      ████████████████████ 100% | 12,543/12,543 | 2.3GB → 1.8GB (21% saved)
      Deduplicated: 2,891 files
      ```

**Критерий готовности:**
- Migration script мигрирует тестовый датасет без потерь
- Checksums всех файлов совпадают до и после
- Deduplication работает (bytes_saved > 0)
- После миграции все функции работают (export, training)
- Dry-run показывает точную статистику без изменений

---

### Фаза 5: Garbage Collection (Неделя 5)
**Цель:** Автоматическая очистка неиспользуемых blobs

**Файлы для создания:**

15. **backend/app/services/garbage_collection.py** (НОВЫЙ, ~350 строк)
    - Реализовать:
      ```python
      async def garbage_collect_blobs(
          connection,
          runtime_root: Path,
          dry_run: bool = False
      ) -> dict

      async def rebuild_reference_counts(connection) -> dict

      async def find_orphaned_blobs(
          connection,
          grace_period_hours: int = 1
      ) -> list[dict]
      ```
    - Стратегия: Mark-and-sweep
      ```python
      # 1. Пересчитать ref_count из dataset_assets
      UPDATE content_blobs SET ref_count = 0;
      UPDATE content_blobs SET ref_count = (
          SELECT COUNT(*) FROM dataset_assets
          WHERE blob_hash = content_blobs.blob_hash
            AND deleted_at IS NULL
      );

      # 2. Найти orphans (ref_count = 0, old enough)
      SELECT * FROM content_blobs
      WHERE ref_count = 0
        AND first_seen_at < NOW() - INTERVAL '1 hour';

      # 3. Удалить файлы и DB records
      ```

16. **backend/app/workers/gc_worker.py** (НОВЫЙ, ~100 строк)
    - Scheduled task (через Redis/Celery):
      ```python
      @periodic_task(cron="0 3 * * 0")  # Каждое воскресенье в 3am
      async def weekly_gc():
          stats = await garbage_collect_blobs(
              connection, runtime_root, dry_run=False
          )
          logger.info(f"GC freed {stats['bytes_freed']} bytes")
      ```

17. **backend/app/api/admin_handlers.py** (+50 строк)
    - Добавить endpoints:
      ```python
      POST /api/admin/gc/run        # Запустить GC вручную
      POST /api/admin/gc/dry-run    # Анализ без удаления
      GET  /api/admin/gc/stats      # Статистика GC
      ```

**Критерий готовности:**
- GC находит и удаляет orphaned blobs
- Grace period защищает новые blobs от удаления
- Dry-run показывает что будет удалено без изменений
- Soft-deleted assets (deleted_at IS NOT NULL) обрабатываются корректно
- Blobs используемые в любой версии НЕ удаляются
- E2E test: создать orphan → GC → verify deletion

---

### Фаза 6: Оптимизация и мониторинг (Неделя 6)
**Цель:** Performance tuning и observability

**Файлы для модификации:**

18. **backend/app/storage/schema.py** (+20 строк индексов)
    - Добавить индексы:
      ```sql
      CREATE INDEX idx_content_blobs_ref_count ON content_blobs(ref_count);
      CREATE INDEX idx_dataset_assets_blob_hash ON dataset_assets(blob_hash);
      CREATE INDEX idx_asset_blobs_blob_hash ON asset_blobs(blob_hash);
      ```

19. **backend/app/services/blob_storage.py** (+50 строк)
    - Добавить in-memory LRU cache:
      ```python
      from functools import lru_cache

      @lru_cache(maxsize=1024)
      def _get_blob_path_cached(blob_hash: str) -> Path:
          return blob_storage_path(blob_hash)
      ```
    - Batch operations:
      ```python
      async def store_blobs_batch(
          connection, runtime_root: Path, files: list[bytes]
      ) -> list[tuple[str, Path]]
      ```

20. **backend/app/services/monitoring.py** (НОВЫЙ, ~200 строк)
    - Метрики (Prometheus format):
      ```python
      cas_total_blobs = Gauge("cas_total_blobs")
      cas_total_bytes = Gauge("cas_total_bytes")
      cas_dedup_ratio = Gauge("cas_dedup_ratio")  # >1 = хорошо
      cas_avg_ref_count = Gauge("cas_avg_ref_count")
      cas_orphaned_blobs = Gauge("cas_orphaned_blobs")
      ```
    - Периодический сбор:
      ```python
      async def collect_cas_metrics(connection):
          stats = await get_cas_statistics(connection)
          cas_total_blobs.set(stats['total_blobs'])
          cas_dedup_ratio.set(stats['dedup_ratio'])
      ```

**Критерий готовности:**
- Индексы ускоряют blob queries (измерить EXPLAIN ANALYZE)
- LRU cache уменьшает DB queries (hit rate > 80%)
- Метрики экспортируются в Prometheus/Grafana
- Dashboard показывает: storage usage, dedup ratio, GC stats
- Performance benchmarks пройдены:
  - Version create: <100ms
  - Rollback: <500ms
  - Blob store overhead: <10%

---

## Структура файловой системы (после рефакторинга)

```
runtime_data/
├── blobs/                          # CAS storage (новое)
│   ├── 00/
│   │   └── 123456789abcdef...      # blob files
│   ├── 01/
│   ├── ...
│   └── ff/
├── datasets/                       # Legacy (deprecated после миграции)
│   └── {dataset_id}/
│       ├── originals/              # → будет удалено после миграции
│       ├── generated/              # → будет удалено после миграции
│       └── exports/                # Остается (temporary archives)
├── manifests/                      # Enhanced manifests
│   └── {dataset_id}/
│       └── {version_id}.json       # Теперь включает blob index
└── temp/                           # Unchanged
```

## Критические файлы (приоритет реализации)

1. **schema.py** - Фундамент (таблицы)
2. **blob_storage.py** - Core API для CAS
3. **uploads.py** - Entry point для новых данных
4. **workflow_assets.py** - Versioning logic
5. **versions.py** - Rollback implementation
6. **migration.py** - Перевод legacy → CAS
7. **garbage_collection.py** - Cleanup

## Проверка результата (End-to-End тест)

```python
# 1. Upload dataset
upload_result = await upload_dataset("test_dataset.zip")

# 2. Generate images
generated_count = await generate_images(session_id, count=100)

# 3. Approve some, reject others
await approve_assets(asset_ids[:50])
await reject_assets(asset_ids[50:])

# 4. Create version
version_v2 = await finalize_review(session_id)
assert version_v2["blobCount"] < version_v2["assetCount"]  # Dedup worked

# 5. Rollback to v1
await rollback_to_version(session_id, version_v1)
stats = await get_dataset_stats(session_id)
assert stats["assetCount"] == original_count  # Rollback worked

# 6. Run GC
gc_stats = await garbage_collect_blobs(dry_run=False)
assert gc_stats["deleted"] > 0  # Orphans cleaned

# 7. Verify storage efficiency
storage_stats = await get_cas_statistics()
assert storage_stats["dedup_ratio"] > 1.0  # Space saved
```

## Риски и митигации

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Потеря данных при миграции | Средняя | Dry-run режим, checksum validation, backup legacy paths |
| Performance деградация | Низкая | LRU cache, batch operations, индексы БД |
| Orphan blobs накапливаются | Средняя | Automated GC, grace periods, monitoring alerts |
| Сложность отладки | Средняя | Подробное логирование, admin UI, dry-run everywhere |
| Rollback ломает in-progress tasks | Низкая | Task validation, session locking |

## Метрики успеха

1. **Storage efficiency**: Dedup ratio > 1.5 для типичных датасетов
2. **Performance**: Version create <100ms, rollback <500ms
3. **Reliability**: Zero data loss during migration
4. **Maintainability**: GC работает без вмешательства
5. **User experience**: Rollback работает из UI за 1 клик
