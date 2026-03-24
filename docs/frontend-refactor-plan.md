# План переработки экранов модификации и отбора

## Обзор проблемы

Текущие экраны модификации и отбора неудобны:
- Нужно листать вниз для поиска кнопок
- Промпты требуют прокрутки
- Содержимое сайта на заднем фоне не нужно и отвлекает
- Параметры генерации разбросаны и неочевидно, какие из них приоритетные

## Референс для UI паттернов

За основу взят паттерн модальных окон из проекта `/workspace_0/code/muzoteka`:
- `TrackToolDialog` - модальное окно с backdrop и крестиком
- Чистое разделение контента и управления
- Удобное закрытие (крестик + клик по backdrop + Escape)

---

## 1. Экран модификации - новый дизайн

### 1.1 Общая структура

**Модальное окно поверх всего фона** (вместо встраивания в layout страницы):
```
ModificationModal (новый компонент)
├── Backdrop (полупрозрачный фон)
└── Dialog Panel
    ├── Header (крестик для закрытия)
    ├── Content (split layout)
    │   ├── Left Column (canvas + промпты)
    │   └── Right Column (параметры генерации)
    └── Footer (кнопки действий)
```

### 1.2 Левая колонка - Canvas и промпты

**Canvas:**
- Убрать тройную подкладку (modify-canvas-shell > modify-canvas > img)
- Компактное отображение в левом верхнем углу
- Показывать только изображение и SVG overlay для полигона
- Навигация между источниками (prev/next) под canvas

**Промпты под canvas:**
- Главный промпт модификации (textarea)
- Negative prompt (textarea, меньше высоты)
- SAM prompt (textarea, меньше высоты)

**Новая функциональность - распространение промпта:**
- Checkbox "Применить этот промпт ко всем изображениям в пачке"
- При активации промпт будет использоваться для всех источников

### 1.3 Правая колонка - Параметры генерации

**Приоритетные параметры (всегда видны):**
- Сила inpaint (strength) - слайдер или input
- Количество шагов inference (steps) - input
- Guidance scale - слайдер или input
- Seed (опционально) - input

**Режимы модификации (два тумблера/radio buttons):**
```
[ ] Inpaint modification (модификация только в области полигона)
[ ] Full remodification (полная перемодификация изображения)
```
Только один режим может быть активен одновременно.

**Вторичные параметры (в коллапсируемой секции):**
- Раскрывающаяся панель "Дополнительные параметры"
- Все остальные поля из `secondaryFields`

### 1.4 Footer - Действия

- Кнопка "Запустить модификацию" (primary)
- Кнопка "Открыть отбор (N)" (secondary, если есть результаты)
- Кнопка "Закрыть" (ghost)

### 1.5 Компоненты для создания

**Новые компоненты:**
1. `ModificationModal.tsx` - главное модальное окно
2. `ModificationModalCanvas.tsx` - canvas с промптами (левая колонка)
3. `ModificationModalParams.tsx` - параметры генерации (правая колонка)
4. `ModificationModeToggle.tsx` - тумблеры режимов (inpaint/full)
5. `PromptFields.tsx` - поля промптов с опцией "применить ко всем"

**Рефакторинг существующих:**
- `ModificationCanvas.tsx` - упростить, убрать лишние обёртки
- `GenerationConfigFields.tsx` - разделить на приоритетные и вторичные

**Стили:**
- `modification-modal.css` - стили модального окна
- Использовать паттерн из muzoteka `track-tool-modal`

### 1.6 Изменения в логике

**Открытие модального окна:**
- ModifyWorkbench не должен быть формой на всю страницу
- Новая кнопка "Открыть редактор модификации" на странице статистики
- Модальное окно управляется через state `modificationModalOpen`

**Управление источниками:**
- Навигация prev/next остается, но в компактном виде
- Индикатор "N / M" под canvas

**Новый state для режима:**
```typescript
type ModificationMode = 'inpaint' | 'full'
const [modificationMode, setModificationMode] = useState<ModificationMode>('inpaint')
```

---

## 2. Экран отбора (Review) - переработка на галерею

### 2.1 Текущие проблемы

- Показывается по одной картинке за раз
- Нет обзора всех результатов
- Нельзя быстро пролистать и выбрать конкретные
- Сложно оценить качество пачки целиком

### 2.2 Новый дизайн - Gallery-first

**Структура:**
```
ReviewGalleryModal
├── Backdrop
└── Dialog Panel
    ├── Header
    │   ├── Title "Отбор синтетических результатов"
    │   ├── Stats (Подтверждено N / Всего M)
    │   └── Close button
    ├── Gallery Grid (основное содержимое)
    │   └── Image Cards (grid layout)
    │       ├── Thumbnail
    │       ├── Class label overlay
    │       ├── Status badge (approved/pending/rejected)
    │       └── Quick actions (hover)
    └── Footer
        ├── "Отклонить всё" button
        ├── "Залить в датасет" button (primary)
        └── "Закрыть" button
```

### 2.3 Gallery Grid

**Layout:**
- CSS Grid с 4-5 колонками (адаптивно)
- Gap между карточками 16px
- Каждая карточка квадратная или с фиксированным aspect ratio

**Image Card:**
```
Card
├── Image preview (cover fit)
├── Overlay (on hover)
│   ├── Class name badge
│   ├── Quick approve button (✓)
│   └── Quick reject button (✗)
└── Status indicator
    ├── Green border = approved
    ├── Red border = rejected
    └── Default = pending
```

**Взаимодействие:**
- Клик по карточке - открывает детальный просмотр (LightboxModal)
- Hover - показывает overlay с кнопками
- Quick actions на hover - мгновенное approve/reject без открытия

### 2.4 Детальный просмотр (Lightbox)

**Открывается при клике на карточку:**
```
ImageLightboxModal
├── Backdrop (затемнённый)
└── Content
    ├── Navigation arrows (prev/next)
    ├── Large preview (центр)
    ├── Sidebar (справа)
    │   ├── Class name
    │   ├── Reference samples (4 шт)
    │   ├── Metadata
    │   └── Actions
    │       ├── Approve
    │       ├── Reject
    │       └── Close
    └── Close button (крестик)
```

**Навигация:**
- Стрелки влево/вправо - переключение между изображениями
- Escape - закрытие lightbox
- Approve/Reject - применение и автопереход к следующему

### 2.5 Новая функция - пачечная загрузка

**Footer действия:**
1. **"Залить в датасет" button:**
   - Берёт все approved изображения из текущей сессии
   - Отправляет их в датасет одним batch запросом
   - Показывает прогресс или spinner
   - После успеха - обновляет статистику датасета
   - Очищает список approved items

2. **"Отклонить всё" button:**
   - Bulk reject всех pending изображений
   - Confirmation dialog перед выполнением

### 2.6 Компоненты для создания

**Новые компоненты:**
1. `ReviewGalleryModal.tsx` - главное модальное окно галереи
2. `ReviewImageCard.tsx` - карточка изображения в сетке
3. `ReviewImageLightbox.tsx` - детальный просмотр изображения
4. `ReviewGalleryGrid.tsx` - сетка с карточками
5. `ReviewBatchActions.tsx` - кнопки пачечных действий

**Рефакторинг существующих:**
- `ReviewWorkspace.tsx` - переключение между старым queue и новой gallery
- `ReviewQueue.tsx` - deprecated, но оставить для обратной совместимости

**Стили:**
- `review-gallery-modal.css`
- `review-image-card.css`
- `review-lightbox.css`

### 2.7 API изменения

**Новые endpoints (если нужны):**
- `POST /api/sessions/{id}/batch-approve` - пачечное подтверждение
- `POST /api/sessions/{id}/batch-reject` - пачечное отклонение
- `POST /api/sessions/{id}/upload-to-dataset` - загрузка approved в датасет

**Существующие endpoints:**
- `GET /api/sessions/{id}/generation-results` - уже есть
- `POST /api/sessions/{id}/approve/{assetId}` - уже есть
- `POST /api/sessions/{id}/reject/{assetId}` - уже есть

---

## 3. Общие улучшения UX

### 3.1 Keyboard shortcuts

**Модификация:**
- `Esc` - закрыть модальное окно
- `Enter` - запустить модификацию (если форма валидна)
- `Ctrl/Cmd + S` - применить область (если полигон готов)
- `Ctrl/Cmd + Z` - отменить последнюю вершину
- `Left/Right arrows` - навигация между источниками

**Review:**
- `Esc` - закрыть lightbox (или всю галерею если lightbox закрыт)
- `A` - approve текущего изображения
- `R` - reject текущего изображения
- `Space` - открыть/закрыть lightbox
- `Left/Right arrows` - навигация в lightbox

### 3.2 Состояния загрузки

- Skeleton loaders для изображений в галерее
- Spinner для batch операций
- Progress bar для загрузки в датасет
- Disabled states для кнопок во время мутаций

### 3.3 Error handling

- Toast notifications для ошибок
- Retry механизм для failed requests
- Fallback UI если изображение не загрузилось

---

## 4. Технические детали реализации

### 4.1 Структура файлов

```
frontend/src/
├── features/
│   ├── modification/
│   │   ├── ModificationModal.tsx (new)
│   │   ├── ModificationModalCanvas.tsx (new)
│   │   ├── ModificationModalParams.tsx (new)
│   │   ├── ModificationModeToggle.tsx (new)
│   │   ├── PromptFields.tsx (new)
│   │   ├── ModificationCanvas.tsx (refactor)
│   │   ├── modification-modal.css (new)
│   │   └── modification-canvas.css (exists)
│   │
│   ├── generation-review/
│   │   ├── ReviewGalleryModal.tsx (new)
│   │   ├── ReviewImageCard.tsx (new)
│   │   ├── ReviewImageLightbox.tsx (new)
│   │   ├── ReviewGalleryGrid.tsx (new)
│   │   ├── ReviewBatchActions.tsx (new)
│   │   ├── ReviewWorkspace.tsx (refactor)
│   │   ├── ReviewQueue.tsx (deprecated)
│   │   ├── review-gallery-modal.css (new)
│   │   ├── review-image-card.css (new)
│   │   └── review-lightbox.css (new)
│   │
│   └── generation-config/
│       ├── GenerationConfigFields.tsx (refactor - split priority/secondary)
│       └── generation-config.css (update)
│
└── pages/
    └── modify/
        ├── ModifyPage.tsx (refactor - add modal trigger)
        └── ModifyWorkbench.tsx (deprecated or simplified)
```

### 4.2 State management

**Modification modal state:**
```typescript
type ModificationModalState = {
  open: boolean
  mode: 'inpaint' | 'full'
  currentSourceIndex: number
  areaPoints: AreaPoint[]
  areaConfirmed: boolean
  promptValues: {
    main: string
    negative: string
    sam: string
  }
  applyPromptToAll: boolean
  configValues: Record<string, string>
}
```

**Review gallery state:**
```typescript
type ReviewGalleryState = {
  open: boolean
  lightboxOpen: boolean
  currentImageIndex: number
  approvedIds: string[]
  rejectedIds: string[]
  filterMode: 'all' | 'approved' | 'rejected' | 'pending'
}
```

### 4.3 Hooks для создания

1. `useModificationModal.ts` - управление состоянием модального окна модификации
2. `useReviewGallery.ts` - управление галереей
3. `useImageLightbox.ts` - управление lightbox навигацией
4. `useKeyboardShortcuts.ts` - глобальные keyboard shortcuts
5. `useBatchApproval.ts` - пачечное подтверждение/отклонение

### 4.4 CSS patterns

**Modal backdrop:**
```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  backdrop-filter: blur(4px);
}
```

**Modal panel (split layout):**
```css
.modal-panel {
  position: fixed;
  inset: 0;
  margin: auto;
  width: 90vw;
  max-width: 1400px;
  height: 90vh;
  background: var(--surface-primary);
  border-radius: 12px;
  display: grid;
  grid-template-columns: 1fr 400px; /* left: canvas, right: params */
  grid-template-rows: auto 1fr auto; /* header, content, footer */
  overflow: hidden;
}
```

**Gallery grid:**
```css
.review-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 24px;
  overflow-y: auto;
}
```

---

## 5. Поэтапный план миграции

### Phase 1: Модификационное модальное окно (приоритет 1)
1. Создать базовую структуру `ModificationModal`
2. Реализовать левую колонку с canvas (без тройной подкладки)
3. Добавить поля промптов с опцией "применить ко всем"
4. Реализовать правую колонку с приоритетными параметрами
5. Добавить тумблеры режимов (inpaint/full)
6. Добавить коллапсируемую секцию для вторичных параметров
7. Интегрировать с существующей логикой запуска модификации
8. Добавить keyboard shortcuts

### Phase 2: Gallery для Review (приоритет 1)
1. Создать `ReviewGalleryModal` с базовой сеткой
2. Реализовать `ReviewImageCard` с quick actions
3. Добавить status indicators (approved/rejected/pending)
4. Реализовать `ReviewImageLightbox` для детального просмотра
5. Добавить навигацию в lightbox
6. Реализовать batch actions (approve all, reject all)
7. Добавить функцию "Залить в датасет"
8. Добавить keyboard shortcuts

### Phase 3: Полировка и UX (приоритет 2)
1. Добавить skeleton loaders
2. Реализовать error handling и retry логику
3. Добавить toast notifications
4. Оптимизировать производительность (virtualization для больших галерей)
5. Добавить animations и transitions
6. Тестирование на разных разрешениях
7. Accessibility improvements (ARIA labels, focus management)

### Phase 4: Cleanup (приоритет 3)
1. Удалить устаревшие компоненты (`ReviewQueue`, старый `ModifyWorkbench`)
2. Убрать неиспользуемые стили
3. Обновить документацию
4. Добавить storybook stories для новых компонентов

---

## 6. Риски и альтернативы

### Риски:
1. **Breaking changes** - старая логика может сломаться
   - Решение: feature flag для переключения между старым и новым UI
2. **Performance** - большие галереи могут тормозить
   - Решение: virtualization (react-window или react-virtual)
3. **Backend API** - может не поддерживать batch операции
   - Решение: fallback на sequential requests

### Альтернативы:
1. **Вместо модального окна** - drawer/slide-in panel
   - Плюсы: меньше перекрывает контент
   - Минусы: меньше места для canvas
2. **Вместо галереи** - бесконечный скролл с карточками
   - Плюсы: более знакомый паттерн
   - Минусы: сложнее оценить весь объём
3. **Вместо lightbox** - inline expand карточки
   - Плюсы: проще реализация
   - Минусы: хуже для навигации

---

## 7. Метрики успеха

После внедрения измерить:
1. **Time to modify** - время от открытия до запуска модификации
2. **Time to review** - время отбора одной пачки результатов
3. **Error rate** - количество ошибок при batch операциях
4. **User satisfaction** - через опрос или наблюдение

Ожидаемые улучшения:
- Время модификации: -40% (нет скроллинга)
- Время review: -60% (галерея + batch actions)
- Удобство: значительное улучшение (субъективно)

---

## 8. Вопросы для уточнения

1. **Backend support:** Поддерживает ли API batch approval/rejection?
2. **Датасет upload:** Есть ли endpoint для загрузки в датасет? Или это автоматически?
3. **Feature flag:** Нужен ли переключатель между старым и новым UI?
4. **Mobile support:** Нужна ли поддержка мобильных устройств?
5. **Permissions:** Есть ли ограничения по ролям пользователей?

---

## Итоговый чек-лист

### Модификация:
- [ ] ModificationModal с backdrop и крестиком
- [ ] Canvas в левой колонке (упрощённый, без лишних обёрток)
- [ ] Поля промптов под canvas
- [ ] Опция "применить промпт ко всем"
- [ ] Приоритетные параметры в правой колонке
- [ ] Тумблеры режимов (inpaint/full)
- [ ] Коллапсируемая секция вторичных параметров
- [ ] Keyboard shortcuts
- [ ] Интеграция с существующей логикой

### Review:
- [ ] ReviewGalleryModal с сеткой карточек
- [ ] ReviewImageCard с quick actions
- [ ] Status indicators (approved/rejected/pending)
- [ ] ReviewImageLightbox для детального просмотра
- [ ] Навигация в lightbox
- [ ] Batch actions (approve/reject all)
- [ ] Функция "Залить в датасет"
- [ ] Keyboard shortcuts
- [ ] Skeleton loaders и error states

### Общее:
- [ ] Стили (модальные окна, галерея, карточки)
- [ ] Hooks для управления состоянием
- [ ] Toast notifications для feedback
- [ ] Тестирование на разных разрешениях
- [ ] Accessibility (ARIA, focus management)
- [ ] Cleanup старых компонентов
