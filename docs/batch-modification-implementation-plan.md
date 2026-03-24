# План реализации Batch-модификации

## Статус: Частично реализовано

### ✅ Что УЖЕ готово

#### Backend (100% готов!)
- ✅ **Database schema** (`backend/app/storage/schema.py`):
  - Таблица `augmentation_run_sources`
  - Поля `is_batch`, `batch_mode` в `augmentation_runs`

- ✅ **Repository layer** (`backend/app/repositories/workflow_runs.py`):
  - `create_augmentation_run_source`
  - `list_augmentation_run_sources`
  - `mark_augmentation_run_source_processing`
  - `complete_augmentation_run_source`
  - `fail_augmentation_run_source`

- ✅ **API handlers** (`backend/app/api/generation_handlers.py`):
  - `start_batch_modification` - принимает batch запросы
  - `batch_modification_sources` - возвращает прогресс источников
  - Валидация `_normalize_batch_sources`, `_normalize_area_points`

- ✅ **Worker logic** (`backend/app/workers/generation.py`):
  - `_run_batch_modification` - полная обработка batch:
    - Создает source записи
    - Последовательно обрабатывает каждый source
    - Отслеживает прогресс (progress_range)
    - Помечает sources как processing/completed/failed
    - Суммирует total_generated_count
    - Обрабатывает cancellation

#### Frontend (частично готов)
- ✅ **API client** (`frontend/src/shared/api/workflow.api.ts`):
  - `startBatchModification(sessionId, payload)` - метод уже есть!

- ✅ **Contracts** (`frontend/src/shared/api/contracts/generation.ts`):
  - `batchModificationStartPayloadSchema`
  - `batchModificationSourceSchema`

- ✅ **Endpoints** (`frontend/src/shared/api/endpoints.ts`):
  - `startBatchModification`
  - `batchModificationSources`

- ✅ **Существующие компоненты для переиспользования**:
  - `ModificationModal` - базовый modal
  - `ModificationModalCanvas` - canvas с polygon
  - `ModificationModalParams` - параметры генерации
  - `ReviewWorkspace` - review галерея

---

## ❌ Что НУЖНО добавить

### Frontend (осталось реализовать UI)

#### 1. Страница выбора источников

**Новый файл**: `frontend/src/pages/modify/BatchSourceSelectionPage.tsx`

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { Button } from '@/shared/ui/buttons/Button'
import { useSessionStore } from '@/store/session/session.store'
import { useApprovedAssetsQuery } from '@/shared/api/workflow.hooks'

export function BatchSourceSelectionPage() {
  const sessionId = useSessionStore(state => state.sessionId)
  const navigate = useNavigate()
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [filterClass, setFilterClass] = useState<string | null>(null)

  const { data: assets, isLoading } = useApprovedAssetsQuery(sessionId)

  const handleToggleSelect = (assetId: string) => {
    const newSet = new Set(selectedAssetIds)
    if (newSet.has(assetId)) {
      newSet.delete(assetId)
    } else {
      newSet.add(assetId)
    }
    setSelectedAssetIds(newSet)
  }

  const handleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) {
      setSelectedAssetIds(new Set())
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map(a => a.id)))
    }
  }

  const handleContinue = () => {
    if (selectedAssetIds.size > 0) {
      navigate('/modify/batch/setup', {
        state: { selectedAssetIds: Array.from(selectedAssetIds) }
      })
    }
  }

  const filteredAssets = filterClass
    ? assets?.filter(a => a.className === filterClass) || []
    : assets || []

  return (
    <PageFrame title="Batch Modification - Select Sources">
      <div className="batch-source-selector">
        {/* Filters */}
        <div className="batch-source-filters">
          <select onChange={e => setFilterClass(e.target.value || null)}>
            <option value="">All classes</option>
            {/* populate with unique classes */}
          </select>
        </div>

        {/* Toolbar */}
        <div className="batch-source-toolbar">
          <label>
            <input
              type="checkbox"
              checked={selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0}
              onChange={handleSelectAll}
            />
            Select All
          </label>
          <span>Selected: {selectedAssetIds.size}</span>
        </div>

        {/* Gallery grid */}
        <div className="batch-source-grid">
          {isLoading ? (
            <Spinner />
          ) : (
            filteredAssets.map(asset => (
              <div
                key={asset.id}
                className={`batch-source-card ${selectedAssetIds.has(asset.id) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  className="batch-source-checkbox"
                  checked={selectedAssetIds.has(asset.id)}
                  onChange={() => handleToggleSelect(asset.id)}
                />
                <img
                  src={asset.previewUrl}
                  alt={asset.className}
                  className="batch-source-image"
                />
                <div className="batch-source-info">
                  <span>{asset.className}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="batch-source-actions">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button
            disabled={selectedAssetIds.size === 0}
            onClick={handleContinue}
          >
            Continue with {selectedAssetIds.size} images
          </Button>
        </div>
      </div>
    </PageFrame>
  )
}
```

**Новый CSS**: `frontend/src/pages/modify/batch-source-selection.css`

```css
.batch-source-selector {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
}

.batch-source-filters {
  display: flex;
  gap: 12px;
}

.batch-source-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--surface-secondary);
  border-radius: 8px;
}

.batch-source-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.batch-source-card {
  position: relative;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.batch-source-card:hover {
  border-color: var(--accent-primary);
}

.batch-source-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-alpha);
}

.batch-source-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 20px;
  height: 20px;
  z-index: 1;
}

.batch-source-image {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
}

.batch-source-info {
  padding: 8px;
  background: var(--surface-tertiary);
  text-align: center;
}

.batch-source-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
```

---

#### 2. Batch Setup Modal

**Новый файл**: `frontend/src/features/batch-modification/BatchModificationSetupModal.tsx`

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/shared/ui/buttons/Button'
import { ModificationModalCanvas } from '@/features/modification/ModificationModalCanvas'
import { ModificationModalParams } from '@/features/modification/ModificationModalParams'
import { type AreaPoint } from '@/pages/modify/modify.types'
import './batch-modification-setup.css'

type BatchMaskMode = 'common_mask' | 'custom_masks'

type BatchModificationSetupModalProps = {
  selectedAssetIds: string[]
  onClose: () => void
  onSubmit: (payload: BatchModificationPayload) => void
}

export function BatchModificationSetupModal({
  selectedAssetIds,
  onClose,
  onSubmit
}: BatchModificationSetupModalProps) {
  const form = useForm()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [maskMode, setMaskMode] = useState<BatchMaskMode>('common_mask')
  const [commonPrompt, setCommonPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [config, setConfig] = useState({})

  // Maps assetId -> AreaPoint[]
  const [masks, setMasks] = useState<Map<string, AreaPoint[]>>(new Map())

  const currentAssetId = selectedAssetIds[currentIndex]
  const currentMask = masks.get(currentAssetId) || []

  const handleMaskChange = (newMask: AreaPoint[]) => {
    if (maskMode === 'common_mask') {
      // Apply to all
      const newMasks = new Map()
      selectedAssetIds.forEach(id => newMasks.set(id, newMask))
      setMasks(newMasks)
    } else {
      // Apply only to current
      const newMasks = new Map(masks)
      newMasks.set(currentAssetId, newMask)
      setMasks(newMasks)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()

    const sources = selectedAssetIds.map(assetId => ({
      assetId,
      areaPoints: masks.get(assetId) || null,
      customPrompt: null, // можно расширить позже
    }))

    onSubmit({
      commonPrompt,
      negativePrompt,
      config,
      sources,
      batchMode: maskMode,
      classTargets: {}, // from form
    })
  }

  return (
    <div className="batch-setup-modal-layer" onClick={onClose}>
      <div className="batch-setup-modal" onClick={e => e.stopPropagation()}>
        <header className="batch-setup-modal__header">
          <h2>Batch Modification Setup</h2>
          <button onClick={onClose}>×</button>
        </header>

        <form className="batch-setup-modal__content" onSubmit={handleSubmit}>
          {/* Left: Canvas */}
          <div className="batch-setup-modal__left">
            <ModificationModalCanvas
              assetId={currentAssetId}
              areaPoints={currentMask}
              onAreaPointsChange={handleMaskChange}
              // ... other props
            />

            {/* Navigation */}
            <div className="batch-setup-nav">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(i => i - 1)}
              >
                &lt; Prev
              </button>
              <span>{currentIndex + 1} / {selectedAssetIds.length}</span>
              <button
                type="button"
                disabled={currentIndex === selectedAssetIds.length - 1}
                onClick={() => setCurrentIndex(i => i + 1)}
              >
                Next &gt;
              </button>
            </div>

            {/* Thumbnails */}
            <div className="batch-setup-thumbnails">
              {selectedAssetIds.map((assetId, index) => (
                <button
                  key={assetId}
                  type="button"
                  className={`batch-thumbnail ${index === currentIndex ? 'active' : ''}`}
                  onClick={() => setCurrentIndex(index)}
                >
                  <img src={getAssetPreviewUrl(assetId)} alt={`Source ${index + 1}`} />
                  {masks.has(assetId) && <span className="batch-thumbnail-badge">✓</span>}
                </button>
              ))}
            </div>

            {/* Mask mode */}
            <div className="batch-mask-mode">
              <label>
                <input
                  type="radio"
                  checked={maskMode === 'common_mask'}
                  onChange={() => setMaskMode('common_mask')}
                />
                Apply same mask to all
              </label>
              <label>
                <input
                  type="radio"
                  checked={maskMode === 'custom_masks'}
                  onChange={() => setMaskMode('custom_masks')}
                />
                Customize per image
              </label>
            </div>
          </div>

          {/* Right: Settings */}
          <div className="batch-setup-modal__right">
            <h3>Common Settings</h3>

            <label>
              Common Prompt
              <textarea
                value={commonPrompt}
                onChange={e => setCommonPrompt(e.target.value)}
                placeholder="Describe modification..."
                required
              />
            </label>

            <label>
              Negative Prompt
              <textarea
                value={negativePrompt}
                onChange={e => setNegativePrompt(e.target.value)}
                placeholder="What to avoid..."
              />
            </label>

            <ModificationModalParams
              // ... generation params
            />

            <div className="batch-summary">
              <p>Total sources: <strong>{selectedAssetIds.length}</strong></p>
              <p>Total generations: <strong>{selectedAssetIds.length * 5}</strong></p>
            </div>
          </div>
        </form>

        <footer className="batch-setup-modal__footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!commonPrompt}>
            Start Batch Generation
          </Button>
        </footer>
      </div>
    </div>
  )
}
```

---

#### 3. API Hook для batch progress

**Расширить**: `frontend/src/shared/api/workflow.hooks.ts`

```typescript
// Add to workflow.hooks.ts

export function useBatchModificationSources(sessionId: string | null, runId: string | null) {
  return useQuery({
    queryKey: ['batch-modification-sources', sessionId, runId],
    queryFn: async () => {
      if (!sessionId || !runId) return null
      const response = await http.get(endpoints.batchModificationSources(sessionId, runId))
      return response.data
    },
    enabled: Boolean(sessionId && runId),
    refetchInterval: 2000, // Poll every 2 seconds while batch is running
  })
}
```

**Добавить в workflow.api.ts**:

```typescript
async getBatchModificationSources(sessionId: string, runId: string) {
  const response = await http.get(endpoints.batchModificationSources(sessionId, runId))
  return response.data // TODO: add schema validation
}
```

---

#### 4. Batch Progress Panel

**Новый файл**: `frontend/src/features/batch-modification/BatchProgressPanel.tsx`

```tsx
import { useBatchModificationSources } from '@/shared/api/workflow.hooks'
import './batch-progress.css'

type BatchProgressPanelProps = {
  runId: string
  sessionId: string
}

export function BatchProgressPanel({ runId, sessionId }: BatchProgressPanelProps) {
  const { data } = useBatchModificationSources(sessionId, runId)

  if (!data) return null

  const completedCount = data.items.filter(s => s.status === 'completed').length
  const totalCount = data.items.length
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  return (
    <div className="batch-progress-panel">
      <h3>Batch Modification Progress</h3>

      <div className="batch-progress-summary">
        <p>Processing: {completedCount} / {totalCount} sources</p>
        <div className="batch-progress-bar">
          <div className="batch-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="batch-progress-sources">
        {data.items.map((source, index) => (
          <div
            key={source.id}
            className={`batch-source-progress batch-source-progress--${source.status}`}
          >
            <span className="batch-source-icon">
              {source.status === 'completed' ? '✓' :
               source.status === 'failed' ? '❌' :
               source.status === 'processing' ? '⏳' : '⏱'}
            </span>
            <span>Image {index + 1}</span>
            {source.status === 'completed' && (
              <span className="batch-source-count">
                {source.generatedCount} generated
              </span>
            )}
            {source.status === 'failed' && (
              <span className="batch-source-error">
                {source.errorMessage}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="batch-progress-total">
        <p>Total generated: {data.items.reduce((sum, s) => sum + s.generatedCount, 0)}</p>
      </div>
    </div>
  )
}
```

---

#### 5. Интеграция в ModifyPage

**Изменить**: `frontend/src/pages/modify/ModifyPage.tsx`

```tsx
// Add button to open batch modification
<div className="modify-panel__actions">
  <Button onClick={() => setIsModificationModalOpen(true)}>
    Single Modification
  </Button>
  <Button onClick={() => navigate('/modify/batch')} variant="secondary">
    Batch Modification
  </Button>
  {/* ... existing review button */}
</div>
```

---

#### 6. Routing

**Изменить**: `frontend/src/app/router/AppRouter.tsx`

```tsx
// Add routes
<Route path="/modify" element={<ModifyPage />} />
<Route path="/modify/batch" element={<BatchSourceSelectionPage />} />
<Route path="/modify/batch/setup" element={<BatchSetupPage />} />
```

**Новый файл**: `frontend/src/pages/modify/BatchSetupPage.tsx`

```tsx
import { useLocation, useNavigate } from 'react-router-dom'
import { BatchModificationSetupModal } from '@/features/batch-modification/BatchModificationSetupModal'
import { useSessionStore } from '@/store/session/session.store'
import { workflowApi } from '@/shared/api/workflow.api'

export function BatchSetupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionId = useSessionStore(state => state.sessionId)

  const selectedAssetIds = location.state?.selectedAssetIds || []

  const handleSubmit = async (payload) => {
    if (!sessionId) return

    try {
      await workflowApi.startBatchModification(sessionId, payload)
      navigate('/modify') // return to modify page
    } catch (error) {
      console.error('Failed to start batch modification:', error)
    }
  }

  if (selectedAssetIds.length === 0) {
    navigate('/modify/batch')
    return null
  }

  return (
    <BatchModificationSetupModal
      selectedAssetIds={selectedAssetIds}
      onClose={() => navigate('/modify/batch')}
      onSubmit={handleSubmit}
    />
  )
}
```

---

#### 7. Query hook для approved assets

**Расширить**: `frontend/src/shared/api/workflow.hooks.ts`

```typescript
export function useApprovedAssetsQuery(sessionId: string | null) {
  return useQuery({
    queryKey: ['approved-assets', sessionId],
    queryFn: async () => {
      if (!sessionId) return []
      // Call existing API or create new endpoint
      // For now, can reuse modification source
      const response = await workflowApi.getModificationSource(sessionId)
      return response.items // all approved assets
    },
    enabled: Boolean(sessionId),
  })
}
```

---

## Итоговый чек-лист реализации

### Backend ✅ (Готово)
- [x] Database schema (augmentation_run_sources)
- [x] Repository functions
- [x] API handlers (start_batch_modification, batch_modification_sources)
- [x] Worker logic (_run_batch_modification)

### Frontend ❌ (Нужно реализовать)

#### Core UI
- [ ] `BatchSourceSelectionPage.tsx` - выбор источников
- [ ] `batch-source-selection.css` - стили для selection page
- [ ] `BatchModificationSetupModal.tsx` - настройка batch
- [ ] `batch-modification-setup.css` - стили для modal
- [ ] `BatchSetupPage.tsx` - wrapper page для setup modal

#### Progress tracking
- [ ] `BatchProgressPanel.tsx` - отображение прогресса
- [ ] `batch-progress.css` - стили для прогресса
- [ ] `useBatchModificationSources` hook в workflow.hooks.ts

#### Integration
- [ ] Добавить кнопку "Batch Modification" в ModifyPage
- [ ] Routing для `/modify/batch` и `/modify/batch/setup`
- [ ] `useApprovedAssetsQuery` hook для получения списка источников

#### Optional (можно отложить)
- [ ] Batch progress в TrainingLogPanel (вместо отдельной панели)
- [ ] Inline batch mode в ModificationModal (альтернатива отдельной странице)
- [ ] Template system (сохранение промпт+маска как шаблон)

---

## Порядок реализации (рекомендуемый)

### Phase 1: Базовый UI (MVP)
1. `BatchSourceSelectionPage.tsx` + CSS
2. `useApprovedAssetsQuery` hook
3. Routing для `/modify/batch`
4. Кнопка в ModifyPage

**Тестирование**: можно выбрать картинки и увидеть список

### Phase 2: Setup Modal
1. `BatchModificationSetupModal.tsx` + CSS
2. `BatchSetupPage.tsx`
3. Routing для `/modify/batch/setup`
4. Интеграция `startBatchModification` API call

**Тестирование**: можно запустить batch модификацию

### Phase 3: Progress Tracking
1. `useBatchModificationSources` hook
2. `BatchProgressPanel.tsx` + CSS
3. Интеграция в TrainingLogPanel или ModifyPage

**Тестирование**: видно прогресс обработки источников

### Phase 4: Polish
1. Keyboard shortcuts (Esc, arrows)
2. Loading states, spinners
3. Error handling, toasts
4. Accessibility (ARIA labels)

---

## Примеры использования (User Flow)

### Flow 1: Common mask for all
```
1. User: /modify → "Batch Modification" button
2. BatchSourceSelectionPage:
   - Select 10 images
   - Click "Continue with 10 images"
3. BatchSetupModal:
   - Enter prompt: "add medical mask"
   - Draw mask on first image
   - Select "Apply same mask to all"
   - Click "Start Batch Generation"
4. ModifyPage:
   - See BatchProgressPanel
   - Watch progress: 3/10 sources processed
5. When complete:
   - Navigate to Review
   - See ~50 results (10 sources × 5 samples)
```

### Flow 2: Custom masks per image
```
1. User: /modify/batch
2. Select 5 images
3. BatchSetupModal:
   - Enter prompt: "add sunglasses"
   - Select "Customize per image"
   - Image 1: draw mask on eyes area
   - Next → Image 2: draw different mask
   - Next → Image 3: draw mask
   - etc.
   - Click "Start Batch Generation"
4. Progress tracking
5. Review
```

---

## Оценка сложности

### Backend: 0 часов (уже готово!)
- Вся логика batch уже реализована
- API endpoints работают
- Worker обрабатывает batch корректно

### Frontend: ~12-16 часов
- BatchSourceSelectionPage: 3-4 часа
- BatchModificationSetupModal: 4-5 часов
- Progress tracking: 2-3 часа
- Integration + routing: 2-3 часа
- Testing + polish: 1-2 часа

**Total: 12-16 часов** для полной реализации frontend части.

---

## Риски и замечания

### Риски:
1. **Asset loading** - нужен endpoint для получения всех approved assets
   - Решение: использовать `/modification/source` items
2. **Large batches** - если выбрать 100 картинок, может тормозить
   - Решение: добавить лимит (макс 50 источников)
3. **Memory** - все маски хранятся в state
   - Решение: для common_mask режима хранить только одну

### Замечания:
- Backend уже ПОЛНОСТЬЮ готов - это отличная новость!
- Основная работа - создать удобный UI на фронтенде
- Можно начать с MVP (selection + simple modal) и итеративно улучшать
- Прогресс tracking уже работает через WebSocket events

---

## Дополнительные улучшения (будущее)

1. **Template system**:
   - Сохранять промпт + маску + параметры как named template
   - Переиспользовать для других батчей

2. **Bulk operations in review**:
   - Approve/reject all in gallery
   - Filter by source

3. **Smart mask adaptation**:
   - Использовать SAM для auto-сегментации похожих областей
   - Нормализация координат с учётом aspect ratio

4. **Batch templates composition**:
   - Применить несколько промптов к одному источнику
   - Комбинаторика вариаций

---

## Контрольные точки

### Milestone 1: Selection UI
- [ ] Можно выбрать картинки
- [ ] Видно счётчик выбранных
- [ ] Можно filter по классу
- [ ] Кнопка Continue работает

### Milestone 2: Setup Modal
- [ ] Можно ввести промпт
- [ ] Можно нарисовать маску
- [ ] Можно переключаться между источниками
- [ ] Можно выбрать режим (common/custom)
- [ ] Запуск batch работает

### Milestone 3: Progress
- [ ] Видно прогресс обработки
- [ ] Видно статус каждого source
- [ ] Видно количество сгенерированных
- [ ] Обновляется в реальном времени

### Milestone 4: Review
- [ ] Все результаты в галерее
- [ ] Можно approve/reject
- [ ] Видно от какого source картинка
- [ ] Batch upload в датасет работает
