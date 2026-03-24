import { useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { type ModificationSourceAsset } from '@/shared/types/workflow'

type BatchSourceSelectorProps = {
  currentSourceId: string | null
  onClearSelection: () => void
  onFocusSource: (assetId: string) => void
  onOpenEditor: () => void
  onSelectAll: () => void
  onToggleSourceSelection: (assetId: string) => void
  selectedSourceCount: number
  selectedSourceIds: Record<string, boolean>
  sourceItems: ModificationSourceAsset[]
}

export function BatchSourceSelector({
  currentSourceId,
  onClearSelection,
  onFocusSource,
  onOpenEditor,
  onSelectAll,
  onToggleSourceSelection,
  selectedSourceCount,
  selectedSourceIds,
  sourceItems,
}: BatchSourceSelectorProps) {
  const [classFilter, setClassFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const classOptions = useMemo(
    () => Array.from(new Set(sourceItems.map((item) => item.className))).sort((left, right) => left.localeCompare(right)),
    [sourceItems],
  )

  const filteredItems = useMemo(
    () =>
      sourceItems.filter((item) => {
        const matchesClass = classFilter === 'all' || item.className === classFilter
        const normalizedQuery = query.trim().toLowerCase()
        const matchesQuery = normalizedQuery.length === 0 || item.className.toLowerCase().includes(normalizedQuery)
        return matchesClass && matchesQuery
      }),
    [classFilter, query, sourceItems],
  )

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedSourceIds[item.assetId] !== false)

  const handleToggleAllFiltered = () => {
    if (allFilteredSelected) {
      filteredItems.forEach((item) => {
        if (selectedSourceIds[item.assetId] !== false && selectedSourceCount > 1) {
          onToggleSourceSelection(item.assetId)
        }
      })
      return
    }
    filteredItems.forEach((item) => {
      if (selectedSourceIds[item.assetId] === false) {
        onToggleSourceSelection(item.assetId)
      }
    })
  }

  return (
    <section className="info-card">
      <div className="batch-source-selector__head">
        <div>
          <strong>Выбор batch-источников</strong>
          <p className="info-card__text">
            Отметь approved-изображения, которые войдут в пакетную модификацию, затем открой редактор настройки batch.
          </p>
        </div>
        <div className="batch-source-selector__summary">
          <span>Выбрано: {selectedSourceCount}</span>
          <span>Всего доступно: {sourceItems.length}</span>
        </div>
      </div>

      <div className="batch-source-selector__toolbar">
        <label className="batch-source-selector__filter">
          <span>Класс</span>
          <select onChange={(event) => setClassFilter(event.target.value)} value={classFilter}>
            <option value="all">Все</option>
            {classOptions.map((className) => (
              <option key={className} value={className}>
                {className}
              </option>
            ))}
          </select>
        </label>
        <label className="batch-source-selector__filter batch-source-selector__filter--search">
          <span>Поиск</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Фильтр по названию класса"
            type="search"
            value={query}
          />
        </label>
        <div className="batch-source-selector__actions">
          <Button onClick={onSelectAll} type="button" variant="ghost">
            Выбрать всё
          </Button>
          <Button onClick={onClearSelection} type="button" variant="ghost">
            Сбросить
          </Button>
          <Button disabled={filteredItems.length === 0} onClick={handleToggleAllFiltered} type="button" variant="secondary">
            {allFilteredSelected ? 'Снять фильтр' : 'Выбрать фильтр'}
          </Button>
          <Button disabled={selectedSourceCount === 0} onClick={onOpenEditor} type="button">
            Настроить batch
          </Button>
        </div>
      </div>

      <div className="batch-source-selector__grid">
        {filteredItems.map((item) => {
          const selected = selectedSourceIds[item.assetId] !== false
          const current = currentSourceId === item.assetId
          return (
            <article
              className={`batch-source-card${selected ? ' batch-source-card--selected' : ''}${current ? ' batch-source-card--current' : ''}`}
              key={item.assetId}
            >
              <button className="batch-source-card__preview" onClick={() => onFocusSource(item.assetId)} type="button">
                <img alt={item.className} src={item.assetUrl} />
              </button>
              <div className="batch-source-card__meta">
                <div>
                  <strong>{item.className}</strong>
                  <span>{current ? 'текущий холст' : 'источник batch'}</span>
                </div>
                <label className="batch-source-card__checkbox">
                  <input checked={selected} onChange={() => onToggleSourceSelection(item.assetId)} type="checkbox" />
                  <span>{selected ? 'в batch' : 'исключён'}</span>
                </label>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
