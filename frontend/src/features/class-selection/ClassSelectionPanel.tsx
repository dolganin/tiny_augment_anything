import clsx from 'clsx'
import { DatasetClassStat } from '@/shared/types/workflow'

type ClassSelectionPanelProps = {
  items: DatasetClassStat[]
  selectedClasses: string[]
  onToggle: (className: string) => void
}

export function ClassSelectionPanel({
  items,
  selectedClasses,
  onToggle,
}: ClassSelectionPanelProps) {
  return (
    <div className="class-selection">
      <p className="class-selection__header">
        Выбери классы для аугментации. Интерфейс показывает не больше 10 самых редких классов.
      </p>

      <div className="class-selection__list">
        {items.map((item) => {
          const active = selectedClasses.includes(item.name)

          return (
            <button
              className={clsx('class-selection__tag', active && 'class-selection__tag--active')}
              key={item.name}
              onClick={() => onToggle(item.name)}
              type="button"
            >
              {item.name}
            </button>
          )
        })}
      </div>

      <div className="class-selection__footer">
        <span className="class-selection__meta">Выбрано классов: {selectedClasses.length}</span>
        <span className="class-selection__meta">Видимых классов: {items.length}</span>
      </div>
    </div>
  )
}
