import { GlobalJob } from '@/shared/types/workflow'
import '@/features/job-queue/job-queue.css'

type JobsDrawerProps = {
  items: GlobalJob[]
  open: boolean
  onCancelJob: (jobId: string) => void
  onClose: () => void
}

export function JobsDrawer({ items, open, onCancelJob, onClose }: JobsDrawerProps) {
  return (
    <div className={open ? 'jobs-drawer jobs-drawer--open' : 'jobs-drawer'}>
      <button
        aria-label="Закрыть очередь задач"
        className="jobs-drawer__backdrop"
        onClick={onClose}
        type="button"
      />
      <aside className="jobs-drawer__panel">
        <div className="jobs-drawer__header">
          <div>
            <p className="jobs-drawer__eyebrow">Runtime</p>
            <h2 className="jobs-drawer__title">Очередь задач</h2>
          </div>
          <button className="jobs-drawer__close" onClick={onClose} type="button">
            Закрыть
          </button>
        </div>

        <div className="jobs-drawer__list">
          {items.length > 0 ? (
            items.map((item) => {
              const isActive = item.status === 'pending' || item.status === 'running'
              return (
                <article className="job-card" key={item.jobId}>
                  <div className="job-card__head">
                    <div>
                      <strong>{item.taskType}</strong>
                      <span>{item.datasetName ?? 'Без датасета'}</span>
                    </div>
                    <span className={`job-card__status job-card__status--${item.status}`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="job-card__progress">
                    <div className="job-card__progress-fill" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>

                  <div className="job-card__meta">
                    <span>{Math.round(item.progress * 100)}%</span>
                    <span>{item.message ?? 'Ожидание сообщения от backend'}</span>
                  </div>

                  {item.errorMessage ? (
                    <p className="job-card__error">{item.errorMessage}</p>
                  ) : null}

                  <div className="job-card__footer">
                    <span>{new Date(item.createdAt).toLocaleString('ru-RU')}</span>
                    {isActive ? (
                      <button className="job-card__action" onClick={() => onCancelJob(item.jobId)} type="button">
                        Отменить
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })
          ) : (
            <div className="jobs-drawer__empty">
              <strong>Активных задач нет</strong>
              <span>Когда обучение, генерация или экспорт будут запущены, они появятся здесь.</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
