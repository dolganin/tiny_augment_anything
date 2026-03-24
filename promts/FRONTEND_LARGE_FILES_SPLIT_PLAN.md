# План дробления крупных frontend-файлов

## 1. Цель

Зафиксировать, как довести оставшиеся крупные frontend-файлы до более устойчивой структуры без потери текущего UX, маршрутов и store/API-контрактов.

На момент составления плана крупный frontend-файл остался один:

1. `frontend/src/features/dataset-upload/DatasetUploadPanel.tsx` — `514` строк

## 2. Общий принцип дробления frontend

- Не менять внешний import path компонента на первом шаге.
- Сначала выделять orchestration в hook, затем выносить JSX-секции в presentation-компоненты.
- Не смешивать в одном файле:
  - persisted upload session lifecycle
  - import polling / import completion logic
  - UI dropzone / progress / error modal
- Коммиты должны идти маленькими этапами, каждый этап должен оставлять рабочий контейнер-компонент.

## 3. Основной кандидат: `DatasetUploadPanel.tsx`

### 3.1 Что сейчас смешано в одном файле

Внутри файла одновременно живут:

- работа с persisted upload session:
  - `createUploadSession`
  - `loadActiveUploadSession`
  - `saveActiveUploadSession`
  - `clearActiveUploadSession`
- resumable upload runtime:
  - `runResumableUpload`
  - `AbortController`
  - resume/reset/cancel flow
- import orchestration:
  - polling `useTaskStatusQuery`
  - success/error handling
  - restore session и navigation
  - invalidation query cache
  - удаление dataset при reset во время import
- derived UI model:
  - `pendingImport`
  - `pendingProject`
  - `uploadStatusLabel`
  - `showCompactMeta`
- presentation:
  - file input / dropzone
  - progress block
  - compact/full metadata cards
  - error modal
  - иконка

Это хороший кандидат на разрезание по слоям, потому что границы ответственности уже видны.

### 3.2 Целевая структура

Рекомендуемое дерево:

```text
frontend/src/features/dataset-upload/
  DatasetUploadPanel.tsx
  useDatasetUploadPanel.ts
  dataset-upload.types.ts
  DatasetUploadDropzone.tsx
  DatasetUploadStatus.tsx
  DatasetUploadMeta.tsx
  dataset-upload.lib.ts
```

### 3.3 Что куда переносить

#### `DatasetUploadPanel.tsx`

Оставить как container примерно на 100-180 строк:

- инициализация `useDatasetUploadPanel`
- сборка финального JSX
- wiring `Modal`
- wiring `compact` / `openOnImportComplete` / `navigateTo`

Файл не должен содержать:

- `resumeUpload`
- import success/error side effects
- вычисление `pendingImport`
- вычисление `pendingProject`

#### `useDatasetUploadPanel.ts`

Вынести сюда orchestration:

- загрузка `loadActiveUploadSession()` при mount
- resume-on-focus / resume-on-online / resume-on-visibility
- polling import task
- success flow после import:
  - clear persisted upload session
  - invalidate queries
  - optional restore session + navigate
- failure/reset flow
- handlers:
  - `openFileDialog`
  - `handleFileSelect`
  - `handleResetUpload`
  - `resumeUpload`

Что должен возвращать hook:

- primary state:
  - `uploadSession`
  - `errorMessage`
  - `uploadProgress`
  - `isUploading`
  - `isCancelling`
  - `isImportPending`
  - `isBusy`
- derived state:
  - `selectedFileName`
  - `uploadStatusLabel`
  - `pendingProject`
  - `showCompactMeta`
  - `importProgress`
- actions:
  - `openFileDialog`
  - `handleFileSelect`
  - `handleResetUpload`
  - `setErrorMessage`

#### `dataset-upload.types.ts`

Вынести типы:

- `DatasetUploadPanelProps`
- `PendingImportState`
- возможно `DatasetUploadViewModel`, если hook начнёт возвращать большой объект

#### `DatasetUploadDropzone.tsx`

Презентационный компонент:

- hidden file input
- dropzone button
- `UploadIcon`
- текст/hint по текущему статусу

Должен получать только данные и callbacks:

- `disabled`
- `fileInputRef`
- `isBusy`
- `isImportPending`
- `isUploading`
- `uploadProgress`
- `uploadPhase`
- `onFileChange`
- `onOpenFileDialog`
- `compact`

#### `DatasetUploadStatus.tsx`

Отдельный блок progress/status:

- spinner
- reset button
- progress bar

Это позволит убрать из основного файла повторяющуюся conditional rendering-логику.

#### `DatasetUploadMeta.tsx`

Отдельный блок metadata:

- compact meta card
- expanded info card

Можно сделать одним компонентом с `compact` prop.

#### `dataset-upload.lib.ts`

Небольшие чистые функции:

- `isDomAbortError`
- построение `uploadStatusLabel`
- сборка `pendingProject`
- возможно `buildPendingImportState`

Это полезно, чтобы hook не разрастался логикой форматирования текста и view-модели.

## 4. Рекомендуемая последовательность коммитов

### Коммит 1

`refactor(frontend): extract dataset upload types and helpers`

Сделать:

- вынести типы в `dataset-upload.types.ts`
- вынести `UploadIcon`
- вынести `isDomAbortError`
- вынести функции для derived labels/view-model

Цель:

- уменьшить шум без изменения orchestration

### Коммит 2

`refactor(frontend): extract dataset upload hook`

Сделать:

- создать `useDatasetUploadPanel.ts`
- перенести туда весь resumable upload + import polling lifecycle
- оставить `DatasetUploadPanel.tsx` как thin container

Цель:

- отделить side effects от JSX

### Коммит 3

`refactor(frontend): split dataset upload presentation blocks`

Сделать:

- вынести `DatasetUploadDropzone.tsx`
- вынести `DatasetUploadStatus.tsx`
- вынести `DatasetUploadMeta.tsx`

Цель:

- получить маленькие UI-компоненты, не завязанные на Query/store/runtime

## 5. Что не делать

- Не переписывать upload-flow целиком на drag-and-drop или новый state machine.
- Не менять persisted upload contract до завершения разрезания.
- Не переносить `queryClient.invalidateQueries` в presentation components.
- Не дробить на десяток микрофайлов меньше 40 строк без явного выигрыша.

## 6. Ожидаемый результат

После разрезания должно получиться:

- `DatasetUploadPanel.tsx` — container
- `useDatasetUploadPanel.ts` — orchestration
- 2-3 небольших presentation components
- helper/type files для derived state

Итоговая структура должна сохранить:

- resumable upload
- auto-resume после возврата во вкладку
- import polling
- reset/cancel flow
- compact/full modes
- интеграцию с dataset catalog
