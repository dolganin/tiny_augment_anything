import { useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { MaskOverlay } from '@/pages/modify/MaskOverlay'
import { type AreaPoint } from '@/pages/modify/modify.types'
import { type ModificationSourceAsset } from '@/shared/types/workflow'

type BatchSourceSelectorProps = {
  currentSourceId: string | null
  onClearSelection: () => void
  onSelectAll: () => void
  onToggleSourceSelection: (assetId: string) => void
  onValidate: () => void
  selectedSourceCount: number
  selectedSourceIds: Record<string, boolean>
  sourceItems: ModificationSourceAsset[]
  templateMask: AreaPoint[]
}

export function BatchSourceSelector({
  currentSourceId,
  onClearSelection,
  onSelectAll,
  onToggleSourceSelection,
  onValidate,
  selectedSourceCount,
  selectedSourceIds,
  sourceItems,
  templateMask,
}: BatchSourceSelectorProps) {
  const [classFilter, setClassFilter] = useState<string>('all')

  const classOptions = useMemo(
    () => Array.from(new Set(sourceItems.map((item) => item.className))).sort((left, right) => left.localeCompare(right)),
    [sourceItems],
  )

  const filteredItems = useMemo(
    () =>
      sourceItems.filter((item) => {
        return classFilter === 'all' || item.className === classFilter
      }),
    [classFilter, sourceItems],
  )

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedSourceIds[item.assetId] !== false)
  const allSourcesSelected =
    sourceItems.length > 0 && sourceItems.every((item) => selectedSourceIds[item.assetId] !== false)

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
          <strong>Шаг 2: Выбор источников</strong>
          <p className="info-card__text">
            Выбери approved-изображения, к которым будет применён текущий шаблон модификации.
          </p>
        </div>
        <div className="batch-source-selector__summary">
          <span>Выбрано: {selectedSourceCount}</span>
          <span>Всего доступно: {sourceItems.length}</span>
        </div>
      </div>

      <div className="batch-source-selector__toolbar">
        {classOptions.length > 1 ? (
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
        ) : null}
        <div className="batch-source-selector__actions">
          <Button onClick={onSelectAll} type="button" variant="ghost">
            {allSourcesSelected ? 'Снять всё' : 'Выбрать всё'}
          </Button>
          <Button onClick={onClearSelection} type="button" variant="ghost">
            Сбросить
          </Button>
          <Button disabled={filteredItems.length === 0} onClick={handleToggleAllFiltered} type="button" variant="secondary">
            {allFilteredSelected ? 'Снять фильтр' : 'Выбрать фильтр'}
          </Button>
          <Button disabled={selectedSourceCount === 0} onClick={onValidate} type="button">
            Провалидировать модификацию ({selectedSourceCount})
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
              <button
                aria-pressed={selected}
                className="batch-source-card__preview"
                onClick={() => onToggleSourceSelection(item.assetId)}
                type="button"
              >
                <img alt={item.className} src={item.assetUrl} />
                {templateMask.length >= 3 ? <MaskOverlay points={templateMask} /> : null}
              </button>
              <div className="batch-source-card__meta">
                <div>
                  <strong>{item.className}</strong>
                  <span>{current ? 'текущий холст' : 'источник batch'}</span>
                </div>
                <span className={`batch-source-card__status${selected ? ' batch-source-card__status--selected' : ''}`}>
                  {selected ? 'в batch' : 'исключён'}
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
