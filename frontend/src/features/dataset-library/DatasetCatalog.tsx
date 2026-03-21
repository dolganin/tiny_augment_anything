import { DatasetCatalogItem, workflowStageLabels, workflowStagePaths } from '@/shared/types/workflow'
import '@/features/dataset-library/dataset-library.css'

type DatasetCatalogProps = {
  activeSessionId: string | null
  isLoading: boolean
  items: DatasetCatalogItem[]
  openingDatasetId: string | null
  onOpenDataset: (item: DatasetCatalogItem) => void
}

export function DatasetCatalog(props: DatasetCatalogProps) {
  const { activeSessionId, isLoading, items, openingDatasetId, onOpenDataset } = props

  if (isLoading) {
    return (
      <div className="dataset-library dataset-library--empty">
        <p className="dataset-library__empty-title">Загружаю каталог датасетов</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="dataset-library dataset-library--empty">
        <p className="dataset-library__empty-title">Пока нет ни одного датасета</p>
        <p className="dataset-library__empty-copy">Загрузи первый архив, и он появится здесь.</p>
      </div>
    )
  }

  return (
    <div className="dataset-library">
      {items.map((item) => {
        const isActive = item.sessionId === activeSessionId
        const isOpening = openingDatasetId === item.datasetId
        return (
          <article
            className={isActive ? 'dataset-card dataset-card--active' : 'dataset-card'}
            key={item.datasetId}
          >
            <div className="dataset-card__header">
              <div>
                <p className="dataset-card__eyebrow">Датасет</p>
                <h3 className="dataset-card__title">{item.datasetName}</h3>
              </div>
              <span className="dataset-card__stage">{workflowStageLabels[item.workflowStage]}</span>
            </div>

            <div className="dataset-card__stats">
              <div>
                <strong>v{item.versionIndex}</strong>
                <span>Версия</span>
              </div>
              <div>
                <strong>{item.assetCount}</strong>
                <span>Изображений</span>
              </div>
              <div>
                <strong>{item.recentTasks.length}</strong>
                <span>Последних действий</span>
              </div>
            </div>

            <div className="dataset-card__meta">
              <span>Маршрут: {workflowStagePaths[item.workflowStage]}</span>
              <span>Обновлён: {new Date(item.updatedAt).toLocaleString('ru-RU')}</span>
            </div>

            <div className="dataset-card__history">
              {item.recentTasks.length > 0 ? (
                item.recentTasks.map((task) => (
                  <div className="dataset-task" key={task.jobId}>
                    <div>
                      <strong>{task.taskType}</strong>
                      <span>{task.message ?? 'Без дополнительного сообщения'}</span>
                    </div>
                    <span className={`dataset-task__status dataset-task__status--${task.status}`}>
                      {task.status}
                    </span>
                  </div>
                ))
              ) : (
                <p className="dataset-card__empty-history">История пока пуста.</p>
              )}
            </div>

            <button
              className="dataset-card__open"
              disabled={isOpening}
              onClick={() => onOpenDataset(item)}
              type="button"
            >
              {isActive ? 'Открыт в работе' : isOpening ? 'Открываю' : 'Открыть пайплайн'}
            </button>
          </article>
        )
      })}
    </div>
  )
}
