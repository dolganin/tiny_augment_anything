# План рефакторинга Batch Flow

## Текущее состояние (проблемы)

### Что есть сейчас (НЕПРАВИЛЬНО):

```
ModifyPage (batch mode)
├── BatchSourceSelector ← выбор источников с чекбоксами
├── DatasetTemplatePanel ← управление шаблонами (зачем???)
├── BatchTemplatePlanner ← выбор text + polygon шаблонов + превью
│   └── "Подтвердить пачку и отправить в jobs" button
└── "Открыть batch-редактор" button
    └── ModificationModal
        ├── Canvas (с навигацией между источниками)
        ├── Промпты под canvas
        ├── Params
        │   └── ☑ "Общая маска для всего batch" ← ГЛУПАЯ КНОПКА
        └── "Запустить batch-модификацию"
```

### Проблемы:

1. ❌ **Шаблоны (DatasetTemplatePanel)** - зачем они нужны на главной странице?
   - Создание text/selection/polygon templates
   - Занимает место, отвлекает

2. ❌ **BatchTemplatePlanner** - неправильный порядок
   - Сначала выбираешь шаблоны
   - Потом смотришь превью
   - Потом "отправить в jobs"
   - Нет этапа настройки гиперпараметров!

3. ❌ **"Общая маска для всего batch"** чекбокс в ModificationModal
   - В batch режиме и так работает с общей маской
   - Дублирует функциональность
   - Путает пользователя

4. ❌ **Неправильный порядок действий:**
   - Текущий: выбрать картинки → выбрать шаблоны → отправить
   - Нужно: промпт → маска → выбрать картинки → валидация → гиперпараметры → запуск

### Backend состояние (✅ ГОТОВ):

```python
# backend/app/workers/generation.py

async def _run_batch_modification(...):
    common_area_points = parse_area_points(payload.get("areaPoints"))  # общая маска

    for source in batch_sources:
        # Для каждого источника:
        area_points = source.get("areaPoints") or common_area_points  # своя или общая
        custom_prompt = source.get("customPrompt") or common_prompt  # свой или общий
```

Backend УЖЕ поддерживает:
- ✅ Общая маска для всех источников
- ✅ Индивидуальная маска для каждого источника
- ✅ Общий промпт для всех
- ✅ Индивидуальный промпт для каждого

---

## Желаемый Flow (ПРАВИЛЬНО)

### Пайплайн должен быть такой:

```
ModifyPage (batch mode)
│
Step 1: Настройка шаблона модификации
├── Поле промпта (разблокировано первым)
├── Поле негативного промпта
├── Canvas с текущей картинкой
│   └── Рисование полигона
└── "Готово, выбрать источники" button
    ↓
Step 2: Выбор источников
├── BatchSourceSelector (галерея с чекбоксами)
│   └── Показывает текущую маску поверх каждой картинки (превью)
└── "Провалидировать модификацию" button
    ↓
Step 3: Validation Modal (новое!)
├── Показывает ВСЕ выбранные источники с наложенной маской
├── Params column (справа):
│   ├── Гиперпараметры (strength, steps, guidance)
│   ├── Режим (inpaint/full)
│   └── Samples per image
├── Счётчик: "Будет сгенерировано: N изображений"
└── "Запустить batch-модификацию" button
```

### Детали:

**Step 1: Настройка шаблона**
- Пользователь вводит промпт
- Рисует полигон на ОДНОЙ текущей картинке (reference)
- Этот промпт + полигон будут применены ко ВСЕМ выбранным источникам
- Кнопка "Готово, выбрать источники"

**Step 2: Выбор источников**
- Галерея всех approved картинок
- Чекбоксы для выбора
- **ВАЖНО:** Показывать превью маски на каждой картинке (normalized coordinates)
- Пользователь видит КАК маска ляжет на разные композиции
- Кнопка "Провалидировать модификацию"

**Step 3: Validation Modal**
- Модалка ЗНАЕТ что это batch
- Показывает grid всех выбранных источников
- Каждый источник с наложенной маской (превью)
- Справа - параметры генерации (можно изменить)
- Submit

---

## План миграции

### Phase 1: Убрать лишнее

#### 1.1 Удалить DatasetTemplatePanel с ModifyPage (batch mode)

**Где:** `frontend/src/pages/modify/ModifyPage.tsx`

```tsx
// УДАЛИТЬ этот блок:
<DatasetTemplatePanel
  onApplyPolygonTemplate={applyPolygonTemplate}
  onApplySelectionTemplate={applyDatasetSelectionTemplate}
  onApplyTextTemplate={applyDatasetTextTemplate}
  onCreatePolygonTemplate={createDatasetPolygonTemplate}
  onCreateSelectionTemplate={createDatasetSelectionTemplate}
  onCreateTextTemplate={createDatasetTextTemplate}
  onDeletePolygonTemplate={deleteDatasetPolygonTemplate}
  onDeleteSelectionTemplate={deleteDatasetSelectionTemplate}
  onDeleteTextTemplate={deleteDatasetTextTemplate}
  polygonTemplates={datasetPolygonTemplates}
  selectionTemplates={datasetSelectionTemplates}
  textTemplates={datasetTextTemplates}
/>
```

**Обоснование:** Шаблоны не нужны в batch flow. Пользователь просто вводит промпт и рисует маску.

#### 1.2 Удалить BatchTemplatePlanner с ModifyPage

**Где:** `frontend/src/pages/modify/ModifyPage.tsx`

```tsx
// УДАЛИТЬ:
<BatchTemplatePlanner
  onApprovePlan={(params) => void startBatchFromPlanner(params)}
  polygonTemplates={datasetPolygonTemplates}
  selectedSourceIds={selectedSourceIds}
  sourceItems={sourceItems}
  textTemplates={datasetTextTemplates}
/>
```

**Обоснование:** Неправильный flow. Вместо него будет validation modal.

#### 1.3 Удалить чекбокс "Общая маска для всего batch"

**Где:** `frontend/src/features/modification/ModificationModalParams.tsx` строки 56-65

```tsx
// УДАЛИТЬ:
{launchMode === 'batch' ? (
  <label className="modification-prompts__checkbox">
    <input
      checked={applyMaskToAll}
      onChange={(event) => onMaskModeChange(event.target.checked)}
      type="checkbox"
    />
    <span>Общая маска для всего batch</span>
  </label>
) : null}
```

**Обоснование:** В batch режиме ВСЕГДА общая маска (это суть batch). Если нужна индивидуальная - это не batch.

#### 1.4 Очистить useModifyPage от template логики

**Где:** `frontend/src/pages/modify/useModifyPage.ts`

```typescript
// УДАЛИТЬ функции:
- createDatasetTextTemplate
- createDatasetSelectionTemplate
- createDatasetPolygonTemplate
- deleteDatasetTextTemplate
- deleteDatasetSelectionTemplate
- deleteDatasetPolygonTemplate
- applyPolygonTemplate
- applyDatasetSelectionTemplate
- applyDatasetTextTemplate

// УДАЛИТЬ state:
- datasetTemplates
- datasetTextTemplates
- datasetSelectionTemplates
- datasetPolygonTemplates

// ОСТАВИТЬ только batch-специфичное:
- selectedSourceIds
- toggleSourceSelection
- selectAllSources
- clearSourceSelection
```

---

### Phase 2: Новый Batch Flow

#### 2.1 Изменить ModifyPage для batch режима

**Где:** `frontend/src/pages/modify/ModifyPage.tsx`

**Новая структура batch секции:**

```tsx
{launchMode === 'batch' ? (
  <>
    {/* Step 1: Настройка шаблона модификации */}
    <BatchTemplateSetup
      currentSource={source}
      areaPoints={areaPoints}
      onAreaPointsChange={updateAreaPoints}
      onAreaConfirm={() => setAreaConfirmed(true)}
      onPolygonClear={() => updateAreaPoints([])}
      onPolygonUndo={() => updateAreaPoints(areaPoints.slice(0, -1))}
      promptValue={form.getValues('prompt')}
      negativePromptValue={negativePromptValue}
      onPromptChange={updatePromptValue}
      onNegativePromptChange={(val) => updateFieldValue('negative_prompt', val)}
      onContinue={() => setBatchStep('select-sources')}
      canContinue={areaPoints.length >= 3 && areaConfirmed && form.getValues('prompt').trim().length > 0}
    />

    {/* Step 2: Выбор источников (только если шаблон готов) */}
    {batchStep === 'select-sources' ? (
      <BatchSourceSelector
        currentSourceId={source?.assetId ?? null}
        templateMask={areaPoints} // показывать превью маски на каждой картинке
        onClearSelection={clearSourceSelection}
        onFocusSource={focusSource}
        onValidate={() => setIsValidationModalOpen(true)}
        onToggleSourceSelection={toggleSourceSelection}
        selectedSourceCount={selectedSourceCount}
        selectedSourceIds={selectedSourceIds}
        sourceItems={sourceItems}
      />
    ) : null}
  </>
) : null}
```

**Новые компоненты:**
1. `BatchTemplateSetup.tsx` - настройка промпта + маски
2. Модифицированный `BatchSourceSelector.tsx` - с превью маски

#### 2.2 Создать BatchTemplateSetup компонент

**Новый файл:** `frontend/src/pages/modify/BatchTemplateSetup.tsx`

```tsx
type BatchTemplateSetupProps = {
  currentSource: ModificationSourceAsset | null
  areaPoints: AreaPoint[]
  onAreaPointsChange: (points: AreaPoint[]) => void
  onAreaConfirm: () => void
  onPolygonClear: () => void
  onPolygonUndo: () => void
  promptValue: string
  negativePromptValue: string
  onPromptChange: (value: string) => void
  onNegativePromptChange: (value: string) => void
  onContinue: () => void
  canContinue: boolean
}

export function BatchTemplateSetup({
  currentSource,
  areaPoints,
  onAreaPointsChange,
  onAreaConfirm,
  onPolygonClear,
  onPolygonUndo,
  promptValue,
  negativePromptValue,
  onPromptChange,
  onNegativePromptChange,
  onContinue,
  canContinue,
}: BatchTemplateSetupProps) {
  return (
    <section className="info-card">
      <div className="batch-setup__head">
        <strong>Шаг 1: Настройка шаблона модификации</strong>
        <p className="info-card__text">
          Введи промпт и нарисуй маску на референсной картинке. Они будут применены ко всем выбранным источникам.
        </p>
      </div>

      <div className="batch-setup__content">
        {/* Left: Prompts */}
        <div className="batch-setup__prompts">
          <label>
            <span>Промпт модификации</span>
            <textarea
              value={promptValue}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Опиши что нужно изменить..."
              rows={3}
            />
          </label>

          <label>
            <span>Негативный промпт</span>
            <textarea
              value={negativePromptValue}
              onChange={(e) => onNegativePromptChange(e.target.value)}
              placeholder="Чего избежать..."
              rows={2}
            />
          </label>
        </div>

        {/* Right: Canvas */}
        <div className="batch-setup__canvas">
          {currentSource ? (
            <>
              <ModificationCanvas
                assetUrl={currentSource.assetUrl}
                areaPoints={areaPoints}
                onAreaPointsChange={onAreaPointsChange}
              />
              <div className="batch-setup__polygon-actions">
                <Button
                  disabled={areaPoints.length < 3}
                  onClick={onAreaConfirm}
                  type="button"
                >
                  Применить область
                </Button>
                <Button
                  disabled={areaPoints.length === 0}
                  onClick={onPolygonUndo}
                  variant="ghost"
                >
                  Удалить вершину
                </Button>
                <Button
                  disabled={areaPoints.length === 0}
                  onClick={onPolygonClear}
                  variant="ghost"
                >
                  Очистить
                </Button>
              </div>
            </>
          ) : (
            <div className="batch-setup__canvas-empty">
              Нет доступных источников
            </div>
          )}
        </div>
      </div>

      <div className="batch-setup__actions">
        <Button
          disabled={!canContinue}
          onClick={onContinue}
        >
          Готово, выбрать источники →
        </Button>
      </div>
    </section>
  )
}
```

#### 2.3 Модифицировать BatchSourceSelector

**Изменить:** `frontend/src/pages/modify/BatchSourceSelector.tsx`

**Добавить превью маски на каждую картинку:**

```tsx
type BatchSourceSelectorProps = {
  // ... existing props
  templateMask: AreaPoint[] | null // новое!
  onValidate: () => void // новое! вместо onOpenEditor
}

export function BatchSourceSelector({
  // ...
  templateMask,
  onValidate,
}: BatchSourceSelectorProps) {
  // ...

  return (
    <section className="info-card">
      <div className="batch-source-selector__head">
        <strong>Шаг 2: Выбор источников для batch</strong>
        <p className="info-card__text">
          Выбери картинки, к которым применить шаблон модификации. Маска будет наложена автоматически.
        </p>
      </div>

      {/* ... filters, toolbar ... */}

      <div className="batch-source-selector__actions">
        {/* ... existing buttons ... */}
        <Button
          disabled={selectedSourceCount === 0}
          onClick={onValidate}
        >
          Провалидировать модификацию ({selectedSourceCount})
        </Button>
      </div>

      <div className="batch-source-selector__grid">
        {filteredItems.map((item) => {
          const selected = selectedSourceIds[item.assetId] !== false
          return (
            <article
              className={`batch-source-card${selected ? ' batch-source-card--selected' : ''}`}
              key={item.assetId}
            >
              <div className="batch-source-card__preview">
                <img alt={item.className} src={item.assetUrl} />
                {/* Показывать превью маски если выбрано */}
                {selected && templateMask ? (
                  <MaskOverlay points={templateMask} />
                ) : null}
              </div>
              {/* ... meta, checkbox ... */}
            </article>
          )
        })}
      </div>
    </section>
  )
}

// Новый компонент для превью маски
function MaskOverlay({ points }: { points: AreaPoint[] }) {
  const path = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x * 100}% ${y * 100}%`)
    .join(' ')

  return (
    <svg className="batch-source-mask-overlay" viewBox="0 0 100 100">
      <path d={`${path} Z`} fill="rgba(59, 130, 246, 0.3)" stroke="rgb(59, 130, 246)" strokeWidth="0.5" />
    </svg>
  )
}
```

#### 2.4 Создать BatchValidationModal

**Новый файл:** `frontend/src/features/batch-modification/BatchValidationModal.tsx`

```tsx
type BatchValidationModalProps = {
  open: boolean
  onClose: () => void
  onSubmit: (params: BatchSubmitParams) => void
  selectedSources: ModificationSourceAsset[]
  templateMask: AreaPoint[]
  promptValue: string
  negativePromptValue: string
  priorityFields: ConfigField[]
  secondaryFields: ConfigField[]
  fieldValues: Record<string, string>
  onFieldValueChange: (key: string, value: string) => void
}

export function BatchValidationModal({
  open,
  onClose,
  onSubmit,
  selectedSources,
  templateMask,
  promptValue,
  negativePromptValue,
  priorityFields,
  secondaryFields,
  fieldValues,
  onFieldValueChange,
}: BatchValidationModalProps) {
  const [mode, setMode] = useState<ModificationMode>('inpaint')

  const totalGenerations = useMemo(() => {
    const samplesPerImage = parseInt(fieldValues.samples_per_image || '5')
    return selectedSources.length * samplesPerImage
  }, [selectedSources, fieldValues])

  const handleSubmit = () => {
    onSubmit({
      sources: selectedSources.map(source => ({
        assetId: source.assetId,
        areaPoints: templateMask, // общая маска для всех
      })),
      prompt: promptValue,
      negativePrompt: negativePromptValue,
      config: fieldValues,
      mode,
    })
  }

  if (!open) return null

  return (
    <div className="batch-validation-modal-layer">
      <div className="batch-validation-modal-backdrop" onClick={onClose} />
      <section className="batch-validation-modal" role="dialog">
        <header className="batch-validation-modal__header">
          <h2>Валидация batch-модификации</h2>
          <button onClick={onClose}>×</button>
        </header>

        <div className="batch-validation-modal__content">
          {/* Left: Preview Grid */}
          <div className="batch-validation-modal__preview">
            <h3>Превью модификации ({selectedSources.length} источников)</h3>
            <div className="batch-validation-preview-grid">
              {selectedSources.map((source) => (
                <article key={source.assetId} className="batch-validation-preview-card">
                  <div className="batch-validation-preview-media">
                    <img src={source.assetUrl} alt={source.className} />
                    <MaskOverlay points={templateMask} />
                  </div>
                  <div className="batch-validation-preview-meta">
                    <strong>{source.className}</strong>
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* Right: Parameters */}
          <aside className="batch-validation-modal__params">
            <section className="batch-validation-params-panel">
              <h3>Параметры генерации</h3>

              <div className="batch-validation-summary">
                <span>Источников: <strong>{selectedSources.length}</strong></span>
                <span>Будет сгенерировано: <strong>{totalGenerations}</strong></span>
              </div>

              <ModificationModeToggle mode={mode} onChange={setMode} />

              <GenerationConfigFields
                fields={priorityFields}
                values={fieldValues}
                onChange={onFieldValueChange}
              />

              <details>
                <summary>Дополнительные параметры</summary>
                <GenerationConfigFields
                  fields={secondaryFields}
                  values={fieldValues}
                  onChange={onFieldValueChange}
                />
              </details>
            </section>

            <section className="batch-validation-params-panel">
              <h4>Промпт</h4>
              <p className="batch-validation-prompt-preview">{promptValue}</p>
              {negativePromptValue ? (
                <>
                  <h4>Негативный промпт</h4>
                  <p className="batch-validation-prompt-preview">{negativePromptValue}</p>
                </>
              ) : null}
            </section>
          </aside>
        </div>

        <footer className="batch-validation-modal__footer">
          <Button onClick={onClose} variant="ghost">
            Отмена
          </Button>
          <Button onClick={handleSubmit}>
            Запустить batch-модификацию
          </Button>
        </footer>
      </section>
    </div>
  )
}
```

#### 2.5 Интеграция в useModifyPage

**Где:** `frontend/src/pages/modify/useModifyPage.ts`

**Добавить state:**

```typescript
const [batchStep, setBatchStep] = useState<'setup' | 'select-sources'>('setup')
const [isValidationModalOpen, setIsValidationModalOpen] = useState(false)
```

**Изменить submitForm для batch:**

```typescript
const submitForm = async (event?: FormEvent<HTMLFormElement>) => {
  event?.preventDefault()

  if (launchMode === 'batch') {
    // Показываем validation modal
    setIsValidationModalOpen(true)
    return
  }

  // Single mode - работает как раньше
  // ...
}
```

**Добавить функцию batch submit:**

```typescript
const submitBatchModification = async (params: BatchSubmitParams) => {
  try {
    await batchModificationMutation.mutateAsync({
      sessionId,
      sources: params.sources,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      config: params.config,
      batchMode: 'common_mask', // всегда общая маска
      classTargets: selectedClassTargets,
    })

    setIsValidationModalOpen(false)
    // Reset batch state
    setBatchStep('setup')
    clearSourceSelection()
    updateAreaPoints([])
    setAreaConfirmed(false)

  } catch (error) {
    setErrorMessage('Не удалось запустить batch-модификацию')
  }
}
```

---

### Phase 3: Cleanup

#### 3.1 Удалить неиспользуемые файлы

**Удалить:**
- `frontend/src/pages/modify/BatchTemplatePlanner.tsx`
- `frontend/src/pages/modify/DatasetTemplatePanel.tsx` (или оставить для single mode?)

#### 3.2 Удалить неиспользуемые типы

**Где:** `frontend/src/pages/modify/modify.types.ts`

```typescript
// МОЖНО УДАЛИТЬ (если шаблоны больше не нужны):
export type TextPromptTemplate = { ... }
export type SelectionPromptTemplate = { ... }
export type PolygonTemplate = { ... }
export type DatasetModificationTemplates = { ... }

// ОСТАВИТЬ:
export type AreaPoint = [number, number]
export type ModificationLaunchMode = 'single' | 'batch'
// etc.
```

#### 3.3 Обновить backend (если нужно)

Backend УЖЕ готов, но можно оптимизировать:

**Где:** `backend/app/workers/generation.py`

**Упростить:** Если больше не поддерживаем индивидуальные маски/промпты, можно убрать эту логику.

Но лучше ОСТАВИТЬ поддержку индивидуальных настроек - это может пригодиться в будущем для "advanced mode".

---

## Итоговый Flow

### Правильный пайплайн:

```
┌─────────────────────────────────────────────────────────┐
│ ModifyPage (batch mode)                                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│ [Single] [Batch] ← toggle                               │
│                                                          │
│ Step 1: BatchTemplateSetup                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Промпт: [_______________________________]           │ │
│ │ Negative: [_______________________________]         │ │
│ │                                                      │ │
│ │ Canvas: [image with polygon drawing]                │ │
│ │ [Применить область] [Удалить вершину] [Очистить]   │ │
│ │                                                      │ │
│ │              [Готово, выбрать источники →]          │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│ Step 2: BatchSourceSelector (если шаблон готов)         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Выбрано: 5 / Всего: 20                              │ │
│ │                                                      │ │
│ │ [img1 + mask] [img2 + mask] [img3 + mask] ...       │ │
│ │   ☑ selected     ☐ not sel     ☑ selected           │ │
│ │                                                      │ │
│ │        [Провалидировать модификацию (5)] →          │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ BatchValidationModal                                  × │
├───────────────────────┬─────────────────────────────────┤
│ Preview Grid          │ Parameters                      │
│                       │                                 │
│ [img1 + mask overlay] │ Источников: 5                  │
│ [img2 + mask overlay] │ Будет сгенерировано: 25        │
│ [img3 + mask overlay] │                                 │
│ [img4 + mask overlay] │ Режим: [Inpaint] [Full]        │
│ [img5 + mask overlay] │                                 │
│                       │ Strength: [▓▓▓░░] 0.7          │
│                       │ Steps: [30]                     │
│                       │ Guidance: [7.5]                 │
│                       │                                 │
│                       │ [Дополнительные параметры ▼]   │
│                       │                                 │
│                       │ Промпт: "add medical mask..."   │
│                       │ Negative: "blurry..."           │
├───────────────────────┴─────────────────────────────────┤
│              [Отмена] [Запустить batch-модификацию]     │
└─────────────────────────────────────────────────────────┘
```

---

## Преимущества нового flow

### ✅ Правильный порядок действий
1. Сначала настраиваешь ЧТО модифицировать (промпт + маска)
2. Потом выбираешь К КАКИМ картинкам применить
3. Потом валидируешь и настраиваешь гиперпараметры
4. Запускаешь

### ✅ Убраны лишние элементы
- Нет DatasetTemplatePanel (шаблоны не нужны для batch)
- Нет BatchTemplatePlanner (заменён на validation modal)
- Нет глупого чекбокса "Общая маска" (и так понятно что общая)

### ✅ Превью маски на каждой картинке
- Пользователь видит КАК маска ляжет на разные композиции
- Можно оценить корректность перед запуском

### ✅ Этап валидации с настройкой параметров
- Финальная проверка перед запуском
- Можно изменить гиперпараметры
- Видно сколько будет сгенерировано

### ✅ Интуитивный flow
- Шаг за шагом
- Нельзя пропустить важные настройки
- Всё логично и последовательно

---

## Чек-лист реализации

### Phase 1: Cleanup (2-3 часа)
- [ ] Удалить `<DatasetTemplatePanel />` из ModifyPage (batch mode)
- [ ] Удалить `<BatchTemplatePlanner />` из ModifyPage
- [ ] Удалить чекбокс "Общая маска" из ModificationModalParams
- [ ] Удалить template functions из useModifyPage
- [ ] Удалить template state из useModifyPage
- [ ] Удалить файлы BatchTemplatePlanner.tsx, DatasetTemplatePanel.tsx

### Phase 2: New Components (4-5 часов)
- [ ] Создать BatchTemplateSetup.tsx (промпт + canvas)
- [ ] Модифицировать BatchSourceSelector.tsx (добавить превью маски)
- [ ] Создать MaskOverlay компонент
- [ ] Создать BatchValidationModal.tsx (превью + параметры)
- [ ] Добавить CSS стили для новых компонентов

### Phase 3: Integration (2-3 часа)
- [ ] Добавить batchStep state в useModifyPage
- [ ] Добавить isValidationModalOpen state
- [ ] Изменить submitForm для batch mode
- [ ] Добавить submitBatchModification function
- [ ] Интегрировать новые компоненты в ModifyPage
- [ ] Обновить routing/navigation

### Phase 4: Testing (1-2 часа)
- [ ] Протестировать flow: setup → select → validate → submit
- [ ] Проверить превью маски на разных картинках
- [ ] Проверить что backend получает правильный payload
- [ ] Проверить прогресс обработки
- [ ] Проверить результаты в review

### Phase 5: Polish (1-2 часа)
- [ ] Добавить loading states
- [ ] Добавить error handling
- [ ] Добавить keyboard shortcuts (Esc, Enter)
- [ ] Добавить animations/transitions
- [ ] Code review и cleanup

**Total: 10-15 часов**

---

## Backwards Compatibility

### Что сохранить:
- ✅ Single mode работает как раньше (без изменений)
- ✅ Backend API остается тот же (уже поддерживает batch)
- ✅ Batch прогресс работает как раньше (BatchProgressPanel)

### Что изменится:
- ❌ Старый batch flow (template planner) удаляется
- ❌ Шаблоны датасета больше не используются в batch (можно оставить для single)
- ❌ Чекбокс "общая маска" удаляется

---

## Альтернативные решения (не рекомендуются)

### ❌ Альтернатива 1: Оставить шаблоны
**Минусы:**
- Усложняет flow
- Зачем создавать шаблон если можно просто ввести промпт?
- Отвлекает от основной задачи

### ❌ Альтернатива 2: Совместить setup и selection в один экран
**Минусы:**
- Перегруженный интерфейс
- Сложно уместить canvas + галерею + промпты
- Хуже UX

### ❌ Альтернатива 3: Без validation modal
**Минусы:**
- Нет финальной проверки перед запуском
- Нельзя изменить параметры
- Не видно сколько будет сгенерировано

---

## Итого

### Что удаляем:
1. ❌ DatasetTemplatePanel (в batch mode)
2. ❌ BatchTemplatePlanner
3. ❌ Чекбокс "Общая маска для всего batch"
4. ❌ Template management functions

### Что добавляем:
1. ✅ BatchTemplateSetup (промпт + canvas)
2. ✅ Улучшенный BatchSourceSelector (с превью маски)
3. ✅ BatchValidationModal (preview grid + params)
4. ✅ Step-by-step flow с валидацией

### Результат:
- 🎯 Правильный порядок действий
- 🎯 Интуитивный UX
- 🎯 Превью маски на каждой картинке
- 🎯 Валидация перед запуском
- 🎯 Настройка параметров на финальном этапе
- 🎯 Меньше кода, меньше сложности

### Оценка:
- Удаление: 2-3 часа
- Новые компоненты: 4-5 часов
- Интеграция: 2-3 часа
- Тестирование: 1-2 часа
- Полировка: 1-2 часа
- **Total: 10-15 часов**
