# UX для Batch-модификации (Frontend)

## Проблема

Нужно понять, **где и как** пользователь будет:
1. Выбирать несколько картинок для batch-модификации
2. Задавать промпт и маски
3. Запускать batch обработку
4. Видеть прогресс

---

## Решение: Multi-step flow

### Overview flow

```
┌─────────────────────┐
│  1. Source Selection│  ← Выбор картинок из галереи
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. Batch Setup Modal│  ← Настройка промпта + масок
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. Batch Processing │  ← Прогресс обработки
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   4. Review Gallery │  ← Отбор результатов
└─────────────────────┘
```

---

## Шаг 1: Source Selection (Выбор картинок)

### Где: Новая вкладка на странице Modify

**Текущая структура ModifyPage:**
```
ModifyPage
├── Single modification (текущий режим)
└── Batch modification (новый режим) ← добавляем
```

**Вариант A: Tabs на ModifyPage**
```tsx
<ModifyPage>
  <Tabs>
    <Tab label="Single modification">
      {/* Текущий ModifyWorkbench */}
    </Tab>
    <Tab label="Batch modification">
      {/* Новый BatchSourceSelector */}
    </Tab>
  </Tabs>
</ModifyPage>
```

**Вариант B: Separate page (чище)**
```
/modify          - single modification (current)
/modify/batch    - batch modification (new)
```

**Рекомендую Вариант B** - отдельная страница `/modify/batch`.

### UI: BatchSourceSelector

```
┌─────────────────────────────────────────────────────────┐
│ Batch Modification - Select Sources                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  [Filter by class: All ▼]  [Search: ______]            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ☐ Select All  |  Selected: 0                     │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Gallery Grid (3-4 columns):                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │☑ [img1] │ │☐ [img2] │ │☑ [img3] │ │☐ [img4] │      │
│  │ person  │ │ person  │ │ face    │ │ person  │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │☐ [img5] │ │☑ [img6] │ │☐ [img7] │ │☑ [img8] │      │
│  │ person  │ │ person  │ │ person  │ │ face    │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  ... (more rows)                                        │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │ [Cancel]              [Continue with 5 images] │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Функционал:**
- Галерея всех approved/original картинок
- Checkbox на каждой картинке для multi-select
- Фильтр по классу
- Поиск
- "Select All" / "Deselect All"
- Счётчик выбранных
- Кнопка "Continue with N images" открывает Batch Setup Modal

**Компоненты:**
```tsx
// frontend/src/pages/modify/BatchSourceSelectionPage.tsx
export function BatchSourceSelectionPage() {
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [filterClass, setFilterClass] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [batchModalOpen, setBatchModalOpen] = useState(false)

  // Load approved assets
  const { data: assets } = useApprovedAssets(sessionId)

  const handleToggleSelect = (assetId: string) => {
    const newSelected = new Set(selectedAssetIds)
    if (newSelected.has(assetId)) {
      newSelected.delete(assetId)
    } else {
      newSelected.add(assetId)
    }
    setSelectedAssetIds(newSelected)
  }

  const handleContinue = () => {
    if (selectedAssetIds.size > 0) {
      setBatchModalOpen(true)
    }
  }

  return (
    <>
      <PageFrame title="Batch Modification">
        <div className="batch-source-selector">
          {/* Filters */}
          <div className="batch-source-filters">
            <select onChange={e => setFilterClass(e.target.value)}>
              <option value="">All classes</option>
              {classes.map(cls => <option key={cls}>{cls}</option>)}
            </select>
            <input
              type="search"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Select all bar */}
          <div className="batch-source-toolbar">
            <label>
              <input
                type="checkbox"
                checked={selectedAssetIds.size === assets.length}
                onChange={handleSelectAll}
              />
              Select All
            </label>
            <span>Selected: {selectedAssetIds.size}</span>
          </div>

          {/* Gallery grid */}
          <div className="batch-source-grid">
            {filteredAssets.map(asset => (
              <BatchSourceCard
                key={asset.id}
                asset={asset}
                selected={selectedAssetIds.has(asset.id)}
                onToggle={() => handleToggleSelect(asset.id)}
              />
            ))}
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

      {/* Batch Setup Modal */}
      {batchModalOpen && (
        <BatchModificationModal
          selectedAssetIds={Array.from(selectedAssetIds)}
          onClose={() => setBatchModalOpen(false)}
          onSubmit={handleBatchSubmit}
        />
      )}
    </>
  )
}

// frontend/src/pages/modify/BatchSourceCard.tsx
function BatchSourceCard({ asset, selected, onToggle }) {
  return (
    <div className={`batch-source-card ${selected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        className="batch-source-checkbox"
        checked={selected}
        onChange={onToggle}
      />
      <img
        src={asset.previewUrl}
        alt={asset.className}
        className="batch-source-image"
      />
      <div className="batch-source-info">
        <span className="batch-source-class">{asset.className}</span>
      </div>
    </div>
  )
}
```

---

## Шаг 2: Batch Setup Modal (Настройка промпта + масок)

### Открывается после выбора источников

```
┌───────────────────────────────────────────────────────────────────────┐
│ Batch Modification Setup                                           × │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────┬─────────────────────────────────────┐  │
│  │ Left Column             │ Right Column                        │  │
│  │                         │                                     │  │
│  │ ┌─────────────────────┐ │ ┌─────────────────────────────────┐ │  │
│  │ │ Canvas: Image 1/5   │ │ │ Common Settings                 │ │  │
│  │ │                     │ │ │                                 │ │  │
│  │ │    [   image   ]    │ │ │ Common Prompt:                  │ │  │
│  │ │                     │ │ │ ┌─────────────────────────────┐ │ │  │
│  │ │ with mask overlay   │ │ │ │ "add a medical mask to the  │ │ │  │
│  │ │                     │ │ │ │  person's face"             │ │ │  │
│  │ └─────────────────────┘ │ │ └─────────────────────────────┘ │ │  │
│  │                         │ │                                 │ │  │
│  │ [< Prev]  [Next >]      │ │ Negative Prompt:                │ │  │
│  │                         │ │ ┌─────────────────────────────┐ │ │  │
│  │ Thumbnails:             │ │ │ "blurry, distorted"         │ │ │  │
│  │ [1][2][3][4][5]         │ │ └─────────────────────────────┘ │ │  │
│  │ ▲active                 │ │                                 │ │  │
│  │                         │ │ ┌─────────────────────────────┐ │ │  │
│  │ Mask Mode:              │ │ │ ☑ Apply same mask to all    │ │ │  │
│  │ ○ Apply same to all     │ │ │ ☐ Customize per image       │ │ │  │
│  │ ● Custom per image      │ │ └─────────────────────────────┘ │ │  │
│  │                         │ │                                 │ │  │
│  │ [Draw Polygon]          │ │ Generation Params:              │ │  │
│  │ [Clear]                 │ │ Strength: [▓▓▓▓▓░░░░░] 0.7    │ │  │
│  │                         │ │ Steps: [30]                     │ │  │
│  │                         │ │ Guidance: [7.5]                 │ │  │
│  │                         │ │                                 │ │  │
│  │                         │ │ Samples per image: [5]          │ │  │
│  │                         │ │                                 │ │  │
│  └─────────────────────────┴─────────────────────────────────────┘  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ [Cancel]                            [Start Batch Generation] │   │
│  └──────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

### Ключевые элементы

**Left Column: Canvas + Source Navigation**
- Canvas с текущим изображением
- Overlay для рисования маски
- Навигация между источниками (prev/next)
- Thumbnails carousel - показывает все выбранные источники
- Индикатор на какой сейчас картинке (1/5)

**Right Column: Settings**
- **Common Prompt** - применяется ко всем
- **Negative Prompt** - общий
- **Mask Mode**:
  - ☑ "Apply same mask to all" - нарисовал на первой, применяется ко всем
  - ☐ "Customize per image" - можно переключаться и рисовать разные маски
- **Generation Params** - strength, steps, guidance
- **Samples per image** - сколько вариаций на каждую картинку

### Modes

#### Mode 1: Apply same mask to all

```
1. Выбираю "Apply same mask to all"
2. Рисую маску на первой картинке
3. Маска автоматически применяется ко всем остальным
   (нормализованные координаты)
4. Thumbnails показывают что у всех одинаковая маска (overlay preview)
5. Start batch generation
```

#### Mode 2: Customize per image

```
1. Выбираю "Customize per image"
2. Рисую маску на картинке 1
3. Next -> картинка 2, рисую другую маску
4. Next -> картинка 3, рисую маску
5. Thumbnails показывают что у каждой своя маска
6. Start batch generation
```

#### Mode 3: Hybrid (some custom, some default)

```
1. Выбираю "Apply same mask to all"
2. Рисую маску на первой
3. Переключаюсь в "Customize per image"
4. Картинки 2-5 унаследовали маску с первой
5. Иду на картинку 3, корректирую маску
6. Остальные остались с default маской
7. Start batch generation
```

### Компоненты

```tsx
// frontend/src/features/batch-modification/BatchModificationModal.tsx
export function BatchModificationModal({
  selectedAssetIds,
  onClose,
  onSubmit
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [maskMode, setMaskMode] = useState<'common' | 'custom'>('common')
  const [commonPrompt, setCommonPrompt] = useState("")
  const [negativePrompt, setNegativePrompt] = useState("")
  const [config, setConfig] = useState({
    strength: 0.7,
    steps: 30,
    guidance_scale: 7.5,
  })
  const [samplesPerImage, setSamplesPerImage] = useState(5)

  // Masks per source
  const [masks, setMasks] = useState<Map<string, AreaPoint[]>>(new Map())

  const currentAssetId = selectedAssetIds[currentIndex]
  const currentMask = masks.get(currentAssetId) || []

  const handleMaskChange = (newMask: AreaPoint[]) => {
    if (maskMode === 'common') {
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

  const handleSubmit = () => {
    const sources = selectedAssetIds.map(assetId => ({
      assetId,
      areaPoints: masks.get(assetId) || null,
    }))

    onSubmit({
      commonPrompt,
      negativePrompt,
      config,
      sources,
      batchMode: maskMode === 'common' ? 'common_mask' : 'custom_masks',
      samplesPerImage,
    })
  }

  return (
    <div className="batch-modal-backdrop" onClick={onClose}>
      <div className="batch-modal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="batch-modal-header">
          <h2>Batch Modification Setup</h2>
          <button className="batch-modal-close" onClick={onClose}>×</button>
        </div>

        {/* Content */}
        <div className="batch-modal-content">
          {/* Left: Canvas */}
          <div className="batch-modal-left">
            <BatchModificationCanvas
              assetId={currentAssetId}
              mask={currentMask}
              onMaskChange={handleMaskChange}
            />

            {/* Navigation */}
            <div className="batch-modal-nav">
              <button
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex(i => i - 1)}
              >
                &lt; Prev
              </button>
              <span>{currentIndex + 1} / {selectedAssetIds.length}</span>
              <button
                disabled={currentIndex === selectedAssetIds.length - 1}
                onClick={() => setCurrentIndex(i => i + 1)}
              >
                Next &gt;
              </button>
            </div>

            {/* Thumbnails */}
            <div className="batch-modal-thumbnails">
              {selectedAssetIds.map((assetId, index) => (
                <BatchThumbnail
                  key={assetId}
                  assetId={assetId}
                  active={index === currentIndex}
                  hasMask={masks.has(assetId)}
                  onClick={() => setCurrentIndex(index)}
                />
              ))}
            </div>

            {/* Mask mode */}
            <div className="batch-modal-mask-mode">
              <label>
                <input
                  type="radio"
                  checked={maskMode === 'common'}
                  onChange={() => setMaskMode('common')}
                />
                Apply same mask to all
              </label>
              <label>
                <input
                  type="radio"
                  checked={maskMode === 'custom'}
                  onChange={() => setMaskMode('custom')}
                />
                Customize per image
              </label>
            </div>
          </div>

          {/* Right: Settings */}
          <div className="batch-modal-right">
            <h3>Common Settings</h3>

            <label>
              Common Prompt
              <textarea
                value={commonPrompt}
                onChange={e => setCommonPrompt(e.target.value)}
                placeholder="Describe modification..."
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

            <BatchGenerationParams
              config={config}
              onChange={setConfig}
            />

            <label>
              Samples per image
              <input
                type="number"
                value={samplesPerImage}
                onChange={e => setSamplesPerImage(Number(e.target.value))}
                min={1}
                max={10}
              />
            </label>

            <div className="batch-modal-summary">
              <p>Total generations: <strong>{selectedAssetIds.length * samplesPerImage}</strong></p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="batch-modal-footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!commonPrompt}>
            Start Batch Generation
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

## Шаг 3: Batch Processing (Прогресс)

### Интеграция с существующим Task Log

После нажатия "Start Batch Generation":
1. Modal закрывается
2. Появляется Task в Jobs Drawer
3. Можно открыть лог и видеть прогресс

```
┌─────────────────────────────────────────────┐
│ Batch Modification Progress                │
├─────────────────────────────────────────────┤
│                                             │
│ Processing: 3 / 10 sources                  │
│                                             │
│ [▓▓▓▓▓▓░░░░░░░░░░░░░] 30%                  │
│                                             │
│ ✓ Image 1: 5 generated                     │
│ ✓ Image 2: 5 generated                     │
│ ⏳ Image 3: generating...                   │
│ ⏳ Image 4: pending                         │
│ ⏳ Image 5: pending                         │
│ ...                                         │
│                                             │
│ Total generated: 10 / 50                    │
│                                             │
└─────────────────────────────────────────────┘
```

**Детальный прогресс:**
- Показывает какие источники обработаны (✓)
- Какой сейчас в процессе (⏳)
- Какие ещё pending
- Если какой-то failed - показывает ошибку (❌)

### WebSocket events

```typescript
// New event type
type BatchProgressEvent = {
  type: 'batch_modification.progress'
  payload: {
    currentSource: number
    totalSources: number
    completedSources: string[] // asset IDs
    failedSources: Array<{
      assetId: string
      error: string
    }>
    generatedCount: number
    targetCount: number
  }
}
```

### Компонент

```tsx
// frontend/src/features/batch-modification/BatchProgressPanel.tsx
export function BatchProgressPanel({ taskId, runId }) {
  const { data: progress } = useBatchProgress(runId)

  return (
    <div className="batch-progress-panel">
      <h3>Batch Modification Progress</h3>

      <div className="batch-progress-summary">
        <p>Processing: {progress.currentSource} / {progress.totalSources} sources</p>
        <ProgressBar
          value={progress.currentSource}
          max={progress.totalSources}
        />
      </div>

      <div className="batch-progress-sources">
        {progress.sources.map((source, index) => (
          <BatchSourceProgress
            key={source.id}
            source={source}
            index={index}
          />
        ))}
      </div>

      <div className="batch-progress-total">
        <p>Total generated: {progress.generatedCount} / {progress.targetCount}</p>
      </div>
    </div>
  )
}

function BatchSourceProgress({ source, index }) {
  const icon = source.status === 'completed' ? '✓' :
               source.status === 'failed' ? '❌' :
               source.status === 'processing' ? '⏳' : '⏱'

  return (
    <div className={`batch-source-progress batch-source-progress--${source.status}`}>
      <span className="batch-source-icon">{icon}</span>
      <span>Image {index + 1}</span>
      {source.status === 'completed' && (
        <span className="batch-source-count">{source.generatedCount} generated</span>
      )}
      {source.status === 'failed' && (
        <span className="batch-source-error">{source.errorMessage}</span>
      )}
    </div>
  )
}
```

---

## Шаг 4: Review Gallery (уже спланирован)

После завершения batch обработки:
- Все результаты попадают в Review Gallery (из предыдущего плана)
- Галерея показывает все ~50 сгенерированных картинок
- Можно quickly approve/reject
- Видно от какого источника каждая картинка (parent asset)

---

## Navigation flow

### Как попасть в Batch Modification?

**Вариант 1: Кнопка на странице статистики**
```tsx
// pages/dataset-stats/DatasetStatsPage.tsx
<div className="dataset-stats-actions">
  <Button onClick={() => navigate('/modify')}>
    Single Modification
  </Button>
  <Button onClick={() => navigate('/modify/batch')} variant="secondary">
    Batch Modification
  </Button>
</div>
```

**Вариант 2: Toggle на странице Modify**
```tsx
// pages/modify/ModifyPage.tsx
<div className="modify-mode-selector">
  <button
    className={mode === 'single' ? 'active' : ''}
    onClick={() => setMode('single')}
  >
    Single
  </button>
  <button
    className={mode === 'batch' ? 'active' : ''}
    onClick={() => setMode('batch')}
  >
    Batch
  </button>
</div>
```

**Рекомендую Вариант 1** - отдельный route чище.

### Routing

```tsx
// app/router/AppRouter.tsx
<Routes>
  {/* Existing */}
  <Route path="/modify" element={<ModifyPage />} />

  {/* New */}
  <Route path="/modify/batch" element={<BatchModifyPage />}>
    <Route index element={<BatchSourceSelectionPage />} />
  </Route>

  <Route path="/review" element={<ReviewPage />} />
  {/* ... */}
</Routes>
```

---

## File structure

```
frontend/src/
├── pages/
│   └── modify/
│       ├── ModifyPage.tsx (existing single mode)
│       ├── ModifyWorkbench.tsx (existing)
│       ├── BatchModifyPage.tsx (new wrapper)
│       └── BatchSourceSelectionPage.tsx (new - step 1)
│
├── features/
│   ├── batch-modification/
│   │   ├── BatchModificationModal.tsx (new - step 2)
│   │   ├── BatchModificationCanvas.tsx (new)
│   │   ├── BatchGenerationParams.tsx (new)
│   │   ├── BatchThumbnail.tsx (new)
│   │   ├── BatchProgressPanel.tsx (new - step 3)
│   │   ├── BatchSourceProgress.tsx (new)
│   │   ├── useBatchModification.ts (new hook)
│   │   ├── useBatchProgress.ts (new hook)
│   │   └── batch-modification.css (new)
│   │
│   └── modification/ (existing)
│       ├── ModificationCanvas.tsx (reuse/adapt)
│       └── ...
│
└── shared/
    ├── api/
    │   └── workflow.api.ts (add batch endpoints)
    └── types/
        └── workflow.ts (add batch types)
```

---

## Взаимодействие компонентов

```
User Journey:

1. Navigate to /modify/batch
   ↓
2. BatchSourceSelectionPage
   - Shows gallery with checkboxes
   - User selects 10 images
   - Clicks "Continue with 10 images"
   ↓
3. BatchModificationModal opens
   - Shows first image with canvas
   - User draws mask
   - Enters prompt "add medical mask"
   - Chooses "Apply same mask to all"
   - Adjusts params (strength, steps)
   - Clicks "Start Batch Generation"
   ↓
4. Modal closes, task created
   ↓
5. Jobs Drawer shows progress
   - BatchProgressPanel displays sources progress
   - Updates via WebSocket
   ↓
6. Task completes
   ↓
7. Navigate to /review
   - ReviewGalleryModal shows all 50 results
   - User approves/rejects
```

---

## Альтернативный подход: Inline mode

Вместо отдельной страницы selection можно сделать прямо в ModificationModal:

```
ModificationModal (расширенный)
├── Mode toggle: [Single] [Batch]
│
├── If Batch mode:
│   ├── Source picker (embedded gallery)
│   ├── Selected sources carousel
│   └── Canvas + settings (as before)
```

**Плюсы:**
- Всё в одном месте
- Меньше navigation steps

**Минусы:**
- Modal становится сложным
- Хуже для большого количества источников

---

## Рекомендация

✅ **Two-page approach:**
1. `/modify/batch` - Source selection с галереей
2. `BatchModificationModal` - Setup с canvas

✅ **Ключевые UX элементы:**
- Checkboxes на картинках для выбора
- Thumbnails carousel для навигации между источниками
- Toggle "Apply same mask to all" vs "Customize per image"
- Batch progress с детализацией по источникам

✅ **Reuse:**
- ModificationCanvas (адаптировать для batch)
- GenerationConfigFields
- ReviewGallery (уже спланирован)

---

## Вопросы для уточнения

1. **Max sources limit:** ограничить выбор (например, макс 50 картинок)?
2. **Auto-save drafts:** сохранять незавершённый batch setup?
3. **Preset templates:** добавить кнопку "Save as template" в batch modal?
4. **Mask visualization:** показывать preview маски на thumbnails?
