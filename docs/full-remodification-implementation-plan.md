# План реализации Full Remodification режима

## Текущее состояние

### ✅ Что уже есть:

#### Frontend:
1. **ModificationModeToggle** - UI для выбора режима
   ```typescript
   type ModificationMode = 'inpaint' | 'full'
   ```
   - 'inpaint' - модификация только в области маски
   - 'full' - полная перегенерация изображения

2. **State management** в `useModifyPage.ts`:
   ```typescript
   const [modificationMode, setModificationMode] = useState<ModificationMode>('inpaint')
   ```

3. **UI показывает выбор** в ModificationModal

#### Backend:
1. **Generation worker** обрабатывает запросы
2. **build_records()** создаёт input.json с параметрами
3. **build_command()** строит команду для generate_zimage_json.py

#### scripts_for_gen:
1. **ZImageGenerator** класс с двумя pipeline:
   - `ZImageInpaintPipeline` - для inpainting
   - `ZImageImg2ImgPipeline` - для img2img (full remodification)

2. **Текущая логика в main():**
   ```python
   if mask_candidates:
       # использует generate_inpaint
   else:
       # использует generate_img2img
   ```

---

## ❌ Проблема

**Режим выбирается автоматически на основе наличия маски:**
- Есть маска → inpaint (фиксировано)
- Нет маски → img2img (фиксировано)

**Но нужно:**
- Explicit control: пользователь выбирает режим
- Даже если есть маска, можно выбрать full remodification

**Frontend НЕ ПЕРЕДАЁТ mode в backend:**
- `modificationStartPayloadSchema` не включает поле mode
- Параметр `modificationMode` живёт только на клиенте

**Backend НЕ ОБРАБАТЫВАЕТ mode:**
- `build_records()` не принимает mode
- `build_command()` не передаёт флаг режима в скрипт

**scripts_for_gen НЕ ПРИНИМАЕТ mode флаг:**
- Нет аргумента `--mode` или `--force-img2img`
- Режим определяется только наличием маски

---

## Решение: End-to-end поддержка режима

### Архитектура:

```
Frontend                 Backend                  scripts_for_gen
┌──────────┐            ┌──────────┐             ┌──────────────┐
│ UI: mode │ ─(config)→ │ Worker   │ ─(--mode)→ │ Generator    │
│ selector │            │          │             │              │
└──────────┘            └──────────┘             └──────────────┘
   inpaint                 inpaint                  inpaint
     or          pass via      or         pass via      or
   full          config.mode   full       CLI arg      img2img
```

---

## Plan реализации

### Phase 1: Frontend - передача mode в config

#### 1.1 Включить mode в payload

**Где:** `frontend/src/pages/modify/useModifyPage.ts`

**Изменение в submitForm:**

```typescript
const submitForm = async (event?: FormEvent<HTMLFormElement>) => {
  event?.preventDefault()

  const configWithMode = {
    ...fieldValues,
    modification_mode: modificationMode, // добавить mode
  }

  if (launchMode === 'single') {
    await singleModificationMutation.mutateAsync({
      sessionId,
      sourceAssetId: source.assetId,
      prompt: form.getValues('prompt'),
      sampleCount: totalTargetCount,
      classTargets: selectedClassTargets,
      config: configWithMode, // ← включает mode
      areaPoints: areaConfirmed ? areaPoints : undefined,
    })
  } else {
    // batch mode...
  }
}
```

**Обоснование:**
- `config` это `Record<string, string>` - можем положить туда любые поля
- Не нужно менять API schema (backwards compatible)
- Backend получит `config.modification_mode`

#### 1.2 Добавить mode в batch payload

**Где:** `frontend/src/pages/modify/useModifyPage.ts`

**Для batch тоже передавать mode:**

```typescript
const submitBatchModification = async (params: BatchSubmitParams) => {
  await batchModificationMutation.mutateAsync({
    sessionId,
    sources: params.sources,
    commonPrompt: params.prompt,
    negativePrompt: params.negativePrompt,
    config: {
      ...params.config,
      modification_mode: modificationMode, // ← добавить
    },
    classTargets: selectedClassTargets,
    batchMode: 'common_mask',
    areaPoints: templateMask,
  })
}
```

---

### Phase 2: Backend - передача mode в скрипт

#### 2.1 Читать mode из config

**Где:** `backend/app/services/zimage.py`

**Функция build_command:**

```python
def build_command(
    settings: Settings,
    bundle: ZImageRunBundle,
    config: dict[str, Any],
    lora_path: Path | None,
    input_json_path: Path,
) -> list[str]:
    # Читаем mode из config
    modification_mode = str(config.get("modification_mode", "inpaint")).strip().lower()

    command = [
        settings.executor_python_bin,
        str(settings.executor_script_path),
        "--input-json",
        str(input_json_path),
        "--output-json",
        str(bundle.output_json_path),
        "--output-dir",
        str(bundle.output_dir),
        "--model-id",
        str(config.get("model_id", "Tongyi-MAI/Z-Image-Turbo")),
        # ... existing args ...
    ]

    # Добавить флаг режима
    if modification_mode == "full":
        command.append("--force-img2img")

    # ... existing lora handling ...

    return command
```

**Обоснование:**
- Читаем `config.modification_mode`
- Если `"full"` → добавляем флаг `--force-img2img`
- Если `"inpaint"` (default) → флаг не добавляем (как сейчас)

#### 2.2 Альтернативный подход: всегда передавать mode

**Более явно:**

```python
# Всегда передавать mode
command.extend([
    "--mode",
    "img2img" if modification_mode == "full" else "inpaint"
])
```

---

### Phase 3: scripts_for_gen - обработка mode флага

#### 3.1 Добавить аргумент --force-img2img

**Где:** `scripts_for_gen/generate_zimage_json.py`

**В parse_args():**

```python
def parse_args():
    p = argparse.ArgumentParser()
    # ... existing args ...
    p.add_argument(
        "--force-img2img",
        action="store_true",
        help="Force img2img mode even when mask is present (full remodification)",
    )
    return p.parse_args()
```

#### 3.2 Изменить логику выбора pipeline в main()

**Где:** `scripts_for_gen/generate_zimage_json.py` функция main()

**Текущий код (строки 288-320):**

```python
if mask_candidates:
    # inpaint
    for m_idx, mask_path in enumerate(mask_candidates):
        # ... inpaint logic ...
        out_img = generator.generate_inpaint(...)
else:
    # img2img
    out_img = generator.generate_img2img(...)
```

**Новый код:**

```python
# Определяем режим
use_inpaint = mask_candidates and not args.force_img2img

if use_inpaint:
    # inpaint mode
    for m_idx, mask_path in enumerate(mask_candidates):
        if not mask_path.exists():
            continue
        mask = feather_mask(load_mask(mask_path), args.mask_dilate, args.mask_blur)
        z_image, z_mask = resize_pair(image, mask, args.size)
        out_img = generator.generate_inpaint(
            prompt=str(prompt),
            image=z_image,
            mask_image=z_mask,
            negative_prompt=str(negative_prompt) if negative_prompt else None,
            strength=float(rec.get("inpaint_strength", rec.get("strength", args.default_inpaint_strength))),
            steps=steps,
            guidance_scale=guidance_scale,
            seed=seed + m_idx,
        )
        out_path = output_dir / f"{stem}__gen_mask_{m_idx:02d}.png"
        out_img.save(out_path)
        results.append(str(out_path.resolve()))
else:
    # img2img mode (full remodification)
    # Игнорируем маску даже если она есть
    z_image, _ = resize_pair(image, None, args.size)
    out_img = generator.generate_img2img(
        prompt=str(prompt),
        image=z_image,
        negative_prompt=str(negative_prompt) if negative_prompt else None,
        strength=float(rec.get("strength", args.default_strength)),
        steps=steps,
        guidance_scale=guidance_scale,
        seed=seed,
    )
    out_path = output_dir / f"{stem}__gen_full.png"
    out_img.save(out_path)
    results.append(str(out_path.resolve()))
```

**Ключевые изменения:**
1. `use_inpaint = mask_candidates and not args.force_img2img`
2. Если `args.force_img2img` → всегда img2img, даже если маска есть
3. Выходной файл: `__gen_full.png` для full mode (вместо `__gen_nomask.png`)

#### 3.3 Альтернатива: явный --mode аргумент

**Более универсально:**

```python
p.add_argument(
    "--mode",
    default="auto",
    choices=["auto", "inpaint", "img2img"],
    help="Generation mode: auto (based on mask), inpaint (force inpaint), img2img (force full remod)",
)
```

**Логика:**

```python
mode = args.mode

if mode == "auto":
    use_inpaint = bool(mask_candidates)
elif mode == "inpaint":
    use_inpaint = True
    if not mask_candidates:
        # Error or warning: inpaint requires mask
        print(f"Warning: inpaint mode selected but no mask for {rec['id']}, falling back to img2img")
        use_inpaint = False
else:  # img2img
    use_inpaint = False

if use_inpaint:
    # ... inpaint logic ...
else:
    # ... img2img logic ...
```

**Плюсы:**
- Более явный контроль
- Можно форсировать inpaint (если нужно)
- Можно добавить validation

**Минусы:**
- Чуть сложнее

**Рекомендация:** Начать с `--force-img2img` (проще), можно расширить до `--mode` позже.

---

### Phase 4: UI уточнения

#### 4.1 Показывать режим в BatchValidationModal

**Где:** `frontend/src/features/batch-modification/BatchValidationModal.tsx`

**Добавить информацию:**

```tsx
<div className="batch-validation-summary">
  <span>Источников: <strong>{selectedSources.length}</strong></span>
  <span>Режим: <strong>{mode === 'inpaint' ? 'Inpaint' : 'Full remodification'}</strong></span>
  <span>Будет сгенерировано: <strong>{totalGenerations}</strong></span>
</div>
```

#### 4.2 Disable polygon controls в full mode

**Где:** `frontend/src/features/modification/ModificationModal.tsx`

**Логика:**
Если выбран `mode === 'full'`:
- Polygon controls должны быть disabled (маска не используется)
- Или показывать notice "Маска игнорируется в full remodification режиме"

```tsx
<div className="modification-modal__polygon-actions">
  {mode === 'full' ? (
    <p className="modification-modal__notice">
      Маска игнорируется в режиме Full remodification
    </p>
  ) : (
    <>
      <Button
        disabled={areaPoints.length < 3 || areaConfirmed}
        onClick={onAreaConfirm}
      >
        Применить область
      </Button>
      {/* ... other polygon buttons ... */}
    </>
  )}
</div>
```

#### 4.3 Логика в BatchTemplateSetup

**Где:** `frontend/src/pages/modify/BatchTemplateSetup.tsx`

**Если создаём этот компонент:**

```tsx
<div className="batch-setup__mode-selector">
  <ModificationModeToggle mode={mode} onChange={setMode} />
  {mode === 'full' ? (
    <p className="batch-setup__hint">
      В режиме Full remodification маска не требуется.
      Изображения будут полностью перегенерированы на основе промпта.
    </p>
  ) : (
    <p className="batch-setup__hint">
      Нарисуй маску на области, которую нужно изменить.
    </p>
  )}
</div>
```

**Validation:**
- В full mode можно пропустить рисование маски
- В inpaint mode маска обязательна

---

## Детальный flow с учётом режимов

### Single Mode:

#### Inpaint режим:
```
1. User: выбирает Inpaint
2. User: рисует полигон на картинке
3. User: вводит промпт "change glasses to sunglasses"
4. Frontend: отправляет config.modification_mode = "inpaint"
5. Backend: не добавляет --force-img2img
6. scripts_for_gen: видит маску → use_inpaint = True
7. Result: generate_inpaint() → изменена только область в маске
```

#### Full remodification режим:
```
1. User: выбирает Full remodification
2. User: вводит промпт "person in sunglasses standing on beach"
3. (Полигон НЕ обязателен, но можно нарисовать для визуального контроля)
4. Frontend: отправляет config.modification_mode = "full"
5. Backend: добавляет --force-img2img
6. scripts_for_gen: use_inpaint = False (игнорирует маску)
7. Result: generate_img2img() → полностью перегенерированная картинка
```

### Batch Mode:

#### Batch Inpaint:
```
1. User: выбирает Inpaint
2. User: вводит промпт "add medical mask"
3. User: рисует маску на референсной картинке
4. User: выбирает 10 источников
5. Frontend: config.modification_mode = "inpaint"
6. Backend: применяет маску ко всем источникам
7. scripts_for_gen: inpaint для каждого источника
```

#### Batch Full:
```
1. User: выбирает Full remodification
2. User: вводит промпт "person wearing winter clothes in snow"
3. (Маска не требуется)
4. User: выбирает 10 источников
5. Frontend: config.modification_mode = "full"
6. Backend: --force-img2img
7. scripts_for_gen: img2img для каждого источника
8. Result: 10 полностью перегенерированных изображений
```

---

## Use Cases

### Use Case 1: Изменить деталь (inpaint)
```
Задача: Заменить очки на солнечные
Режим: Inpaint
Маска: Область глаз
Промпт: "sunglasses"
Результат: Очки заменены, остальное не изменилось
```

### Use Case 2: Полностью изменить сцену (full)
```
Задача: Перенести человека на пляж
Режим: Full remodification
Маска: Не нужна (игнорируется)
Промпт: "person standing on tropical beach, sunset, palm trees"
Результат: Полностью новое изображение с человеком на пляже
```

### Use Case 3: Изменить стиль (full)
```
Задача: Перевести фото в рисунок
Режим: Full remodification
Промпт: "watercolor painting of a person"
Результат: Стилизованное изображение, сохраняющее основную композицию
```

### Use Case 4: Batch добавление объекта (inpaint)
```
Задача: Добавить медицинскую маску на 20 лиц
Режим: Inpaint
Маска: Область рта/носа
Промпт: "medical face mask"
Результат: На всех 20 фото добавлена маска, остальное не тронуто
```

### Use Case 5: Batch изменение окружения (full)
```
Задача: Перенести 10 портретов в офисную обстановку
Режим: Full remodification
Промпт: "professional portrait in modern office setting"
Результат: 10 новых изображений с офисным фоном
```

---

## Технические детали

### Параметры strength для разных режимов

**Inpaint:**
- `inpaint_strength` (default: 1.0) - высокая strength для полного изменения области
- Используется `rec.get("inpaint_strength", rec.get("strength", args.default_inpaint_strength))`

**Full remodification (img2img):**
- `strength` (default: 0.6) - ниже для сохранения композиции
- Используется `rec.get("strength", args.default_strength)`

**Почему разные defaults:**
- Inpaint: высокая strength (1.0) → полностью заменить область
- Img2img: средняя strength (0.6) → сохранить композицию, изменить детали

**Frontend может давать override:**
```typescript
config: {
  strength: '0.8',           // для full mode
  inpaint_strength: '0.95',  // для inpaint mode
  modification_mode: 'full',
}
```

### Pipeline switching overhead

**ZImageGenerator кеширует pipeline:**
```python
def _load_pipe(self, kind):
    if self.pipe is not None and self.pipe_kind == kind:
        return self.pipe  # переиспользуем

    self._clear_pipe()  # очищаем старый
    # загружаем новый...
```

**Performance impact:**
- Switching между inpaint/img2img: ~2-5 секунд (загрузка модели)
- Если batch использует один режим для всех → switching только один раз
- Mixed mode batch (некоторые inpaint, некоторые full) → switching каждый раз

**Оптимизация для будущего:**
- Можно держать оба pipeline в памяти одновременно (если хватает VRAM)
- Или pre-load нужный pipeline при start task

---

## Backwards Compatibility

### Для существующих запросов без mode:

**Frontend не передаёт mode:**
- Backend получает `config` без `modification_mode`
- `config.get("modification_mode", "inpaint")` → default "inpaint"
- Не добавляет `--force-img2img` флаг
- scripts_for_gen работает как раньше (auto mode по маске)

**Результат:** Старые запросы работают как раньше.

### Migration strategy:

1. **Phase 1:** Добавить поддержку (этот план)
2. **Phase 2:** По умолчанию UI показывает "inpaint" (текущее поведение)
3. **Phase 3:** Пользователь может выбрать "full" если нужно

---

## Testing Plan

### Unit tests:

**Backend:**
```python
# test_zimage.py

def test_build_command_with_inpaint_mode():
    config = {"modification_mode": "inpaint"}
    cmd = build_command(settings, bundle, config, None, input_json)
    assert "--force-img2img" not in cmd

def test_build_command_with_full_mode():
    config = {"modification_mode": "full"}
    cmd = build_command(settings, bundle, config, None, input_json)
    assert "--force-img2img" in cmd

def test_build_command_without_mode():
    config = {}  # no mode specified
    cmd = build_command(settings, bundle, config, None, input_json)
    assert "--force-img2img" not in cmd  # default behavior
```

**scripts_for_gen:**
```python
# test_generate.py

def test_force_img2img_ignores_mask():
    args = parse_args(["--input-json", "in.json", "--output-json", "out.json", "--force-img2img"])
    # Simulate record with mask
    # Verify uses img2img pipeline, not inpaint

def test_auto_mode_uses_inpaint_with_mask():
    args = parse_args(["--input-json", "in.json", "--output-json", "out.json"])
    # Simulate record with mask
    # Verify uses inpaint pipeline
```

### Integration tests:

1. **Inpaint mode с маской:** маска применяется, изменена только область
2. **Full mode с маской:** маска игнорируется, полная перегенерация
3. **Full mode без маски:** полная перегенерация
4. **Batch inpaint:** все источники с одной маской
5. **Batch full:** все источники полностью перегенерированы

---

## Чек-лист реализации

### Phase 1: Frontend (1-2 часа)
- [ ] Передавать `modification_mode` в `config` в useModifyPage.submitForm
- [ ] Передавать `modification_mode` в batch payload
- [ ] (Опционально) Показывать notice если mode=full что маска не используется
- [ ] (Опционально) Disable polygon controls в full mode

### Phase 2: Backend (30 минут - 1 час)
- [ ] Изменить `build_command()` в `backend/app/services/zimage.py`
- [ ] Читать `config.get("modification_mode", "inpaint")`
- [ ] Добавлять `--force-img2img` если mode == "full"
- [ ] Протестировать что команда строится правильно

### Phase 3: scripts_for_gen (1-2 часа)
- [ ] Добавить аргумент `--force-img2img` в parse_args()
- [ ] Изменить логику в main(): `use_inpaint = mask_candidates and not args.force_img2img`
- [ ] Изменить filename для full mode: `__gen_full.png`
- [ ] Протестировать оба режима локально

### Phase 4: Testing (1-2 часа)
- [ ] Тест: single inpaint с маской
- [ ] Тест: single full с маской (маска игнорируется)
- [ ] Тест: single full без маски
- [ ] Тест: batch inpaint
- [ ] Тест: batch full
- [ ] Проверить что старые запросы без mode работают

### Phase 5: Documentation (30 минут)
- [ ] Обновить README или docs с описанием режимов
- [ ] Добавить примеры использования
- [ ] Описать когда использовать inpaint vs full

**Total: 4-7 часов**

---

## Альтернативные решения (не рекомендуются)

### ❌ Альтернатива 1: Отдельный endpoint для full mode

```
POST /modification/full
POST /modification/inpaint
```

**Минусы:**
- Дублирование кода
- Нужно два разных handler
- Два разных worker
- Сложнее поддерживать

### ❌ Альтернатива 2: Separate pipeline в ZImageGenerator

```python
def generate_full_remodification(...):
    # Always img2img, ignore mask
```

**Минусы:**
- Дублирует логику generate_img2img
- Не нужно, достаточно флага

### ❌ Альтернатива 3: Маска = null для full mode

Frontend отправляет `areaPoints: null` для full mode.

**Минусы:**
- Неявное управление режимом
- Что если пользователь просто не нарисовал маску?
- Путает semantics (null = forgot vs null = full mode)

---

## Улучшения в будущем

### 1. Автоматический выбор режима

UI может предлагать режим на основе промпта:
```typescript
const suggestedMode = inferModeFromPrompt(prompt)
// "change glasses" → inpaint
// "person on beach" → full
```

### 2. Hybrid режим

Inpaint + img2img последовательно:
1. Inpaint изменяет область
2. Img2img harmonizes результат

### 3. Masked img2img

Img2img но с повышенным вниманием к области маски:
- Используется для "soft inpainting"
- Изменения не ограничены маской, но сфокусированы на ней

### 4. Strength recommendations

UI может предлагать strength на основе режима:
- Inpaint: 0.9-1.0 (сильные изменения)
- Full: 0.5-0.7 (сохранение композиции)

---

## Итого

### Что нужно сделать:

1. ✅ **Frontend:** Передавать `config.modification_mode = "inpaint"|"full"`
2. ✅ **Backend:** Читать mode и добавлять `--force-img2img` для full
3. ✅ **scripts_for_gen:** Принимать `--force-img2img` и игнорировать маску

### Ключевые изменения:

**Frontend (useModifyPage.ts):**
```typescript
config: {
  ...fieldValues,
  modification_mode: modificationMode, // ← ДОБАВИТЬ
}
```

**Backend (zimage.py):**
```python
if config.get("modification_mode") == "full":
    command.append("--force-img2img")  # ← ДОБАВИТЬ
```

**scripts_for_gen (generate_zimage_json.py):**
```python
# Аргумент
p.add_argument("--force-img2img", action="store_true")  # ← ДОБАВИТЬ

# Логика
use_inpaint = mask_candidates and not args.force_img2img  # ← ИЗМЕНИТЬ
```

### Оценка:
- Frontend: 1-2 часа
- Backend: 30 мин - 1 час
- scripts_for_gen: 1-2 часа
- Testing: 1-2 часа
- **Total: 4-7 часов**

### Backwards compatibility:
✅ Полная - старые запросы без mode работают как раньше.

### Result:
🎯 Пользователь может явно выбирать между:
- **Inpaint:** изменить только область маски
- **Full remodification:** полностью перегенерировать изображение
