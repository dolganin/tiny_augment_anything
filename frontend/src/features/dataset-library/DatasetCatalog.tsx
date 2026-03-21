import { FormEvent, useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { DatasetCatalogItem, workflowStageLabels } from '@/shared/types/workflow'
import '@/features/dataset-library/dataset-library.css'

type DatasetCatalogProps = {
  activeDatasetId: string | null
  isLoading: boolean
  items: DatasetCatalogItem[]
  openingDatasetId: string | null
  renamingDatasetId: string | null
  deletingDatasetId: string | null
  onOpenDataset: (item: DatasetCatalogItem) => void
  onDownloadDataset: (item: DatasetCatalogItem) => void
  onRenameDataset: (item: DatasetCatalogItem, name: string) => Promise<void>
  onDeleteDataset: (item: DatasetCatalogItem) => Promise<void>
}

const statusLabels = {
  uploading: 'Загрузка',
  importing: 'Импорт',
  ready: 'Готов',
  error: 'Ошибка',
} satisfies Record<DatasetCatalogItem['status'], string>

export function DatasetCatalog(props: DatasetCatalogProps) {
  const { activeDatasetId, isLoading, items, openingDatasetId, renamingDatasetId, deletingDatasetId, onOpenDataset, onDownloadDataset, onRenameDataset, onDeleteDataset } = props
  const [menuDatasetId, setMenuDatasetId] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<DatasetCatalogItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DatasetCatalogItem | null>(null)
  const [draftName, setDraftName] = useState('')

  const sortedItems = useMemo(() => items, [items])

  if (isLoading) {
    return (
      <div className="dataset-library dataset-library--empty">
        <p className="dataset-library__empty-title">Загружаю каталог датасетов</p>
      </div>
    )
  }

  if (sortedItems.length === 0) {
    return (
      <div className="dataset-library dataset-library--empty">
        <p className="dataset-library__empty-title">Пока нет ни одного датасета</p>
        <p className="dataset-library__empty-copy">Загрузи архив, и здесь появится первый проект.</p>
      </div>
    )
  }

  const handleRenameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameTarget) {
      return
    }
    try {
      await onRenameDataset(renameTarget, draftName)
      setRenameTarget(null)
      setDraftName('')
    } catch {
      return
    }
  }

  return (
    <>
      <div className="dataset-library">
        {sortedItems.map((item) => {
          const isActive = item.datasetId === activeDatasetId
          const isOpening = openingDatasetId === item.datasetId
          const isPendingTransfer = item.datasetId.startsWith('pending-')
          const canOpen = !isPendingTransfer
          const canManage = !isPendingTransfer
          const canDownload = item.status === 'ready' && !isPendingTransfer
          return (
            <article
              className={isActive ? 'dataset-card dataset-card--active' : 'dataset-card'}
              key={item.datasetId}
              onClick={() => {
                if (canOpen && !isOpening) {
                  onOpenDataset(item)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canOpen && !isOpening) {
                  onOpenDataset(item)
                }
              }}
              role={canOpen ? 'button' : undefined}
              tabIndex={canOpen ? 0 : -1}
            >
              <div className="dataset-card__cover">
                {item.previewUrls.length > 0 ? (
                  item.previewUrls.map((previewUrl, index) => (
                    <img
                      alt={`Превью датасета ${item.datasetName} ${index + 1}`}
                      className="dataset-card__cover-image"
                      key={`${item.datasetId}-${previewUrl}-${index}`}
                      src={previewUrl}
                    />
                  ))
                ) : (
                  <div className="dataset-card__cover-empty">
                    <span>{statusLabels[item.status]}</span>
                  </div>
                )}
              </div>

              <div className="dataset-card__header">
                <div>
                  <p className="dataset-card__eyebrow">Проект</p>
                  <h3 className="dataset-card__title">{item.datasetName}</h3>
                </div>
                <div className="dataset-card__header-actions">
                  <span className={`dataset-card__status dataset-card__status--${item.status}`}>{statusLabels[item.status]}</span>
                  {canManage ? (
                    <button
                      aria-label="Действия с датасетом"
                      className="dataset-card__menu-trigger"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuDatasetId((current) => (current === item.datasetId ? null : item.datasetId))
                      }}
                      type="button"
                    >
                      ...
                    </button>
                  ) : null}
                </div>
              </div>

              {menuDatasetId === item.datasetId ? (
                <div className="dataset-card__menu" onClick={(event) => event.stopPropagation()}>
                  {canDownload ? (
                    <button
                      className="dataset-card__menu-item"
                      onClick={() => {
                        onDownloadDataset(item)
                        setMenuDatasetId(null)
                      }}
                      type="button"
                    >
                      Скачать архив
                    </button>
                  ) : null}
                  <button
                    className="dataset-card__menu-item"
                    onClick={() => {
                      setRenameTarget(item)
                      setDraftName(item.datasetName)
                      setMenuDatasetId(null)
                    }}
                    type="button"
                  >
                    Переименовать
                  </button>
                  <button
                    className="dataset-card__menu-item dataset-card__menu-item--danger"
                    onClick={() => {
                      setDeleteTarget(item)
                      setMenuDatasetId(null)
                    }}
                    type="button"
                  >
                    Удалить
                  </button>
                </div>
              ) : null}

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
                  <span>Задач</span>
                </div>
              </div>

              <div className="dataset-card__meta">
                <span>Этап: {workflowStageLabels[item.workflowStage]}</span>
                <span>Обновлён: {new Date(item.updatedAt).toLocaleString('ru-RU')}</span>
              </div>

              <div className="dataset-card__footer">
                <span className="dataset-card__link-state">
                  {canOpen ? (isOpening ? 'Открываю проект' : 'Открыть пайплайн') : 'Подготовка проекта'}
                </span>
              </div>
            </article>
          )
        })}
      </div>

      <Modal onClose={() => setRenameTarget(null)} open={Boolean(renameTarget)} title="Переименовать датасет">
        <form className="dataset-library__modal-form" onSubmit={(event) => void handleRenameSubmit(event)}>
          <input
            autoFocus
            className="dataset-library__input"
            onChange={(event) => setDraftName(event.target.value)}
            type="text"
            value={draftName}
          />
          <div className="dataset-library__modal-actions">
            <Button disabled={renamingDatasetId === renameTarget?.datasetId} type="submit">
              {renamingDatasetId === renameTarget?.datasetId ? 'Сохраняю' : 'Сохранить'}
            </Button>
            <Button onClick={() => setRenameTarget(null)} type="button" variant="ghost">
              Отмена
            </Button>
          </div>
        </form>
      </Modal>

      <Modal onClose={() => setDeleteTarget(null)} open={Boolean(deleteTarget)} title="Удалить датасет" tone="error">
        <div className="dataset-library__modal-copy">
          <p>История, версии и файлы будут удалены безвозвратно.</p>
          <div className="dataset-library__modal-actions">
            <Button
              disabled={deletingDatasetId === deleteTarget?.datasetId}
              onClick={() => {
                if (!deleteTarget) {
                  return
                }
                void onDeleteDataset(deleteTarget)
                  .then(() => setDeleteTarget(null))
                  .catch(() => undefined)
              }}
              type="button"
              variant="danger"
            >
              {deletingDatasetId === deleteTarget?.datasetId ? 'Удаляю' : 'Удалить'}
            </Button>
            <Button onClick={() => setDeleteTarget(null)} type="button" variant="ghost">
              Отмена
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
