import { PropsWithChildren, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { adaptJobs } from '@/shared/api/adapters'
import { useCancelJobMutation, useJobsQuery } from '@/shared/api/workflow.hooks'
import { useWorkspaceStore } from '@/store/workspace/workspace.store'
import '@/shared/ui/layouts/layouts.css'

export function AppShell({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const jobsPanelOpen = useWorkspaceStore((state) => state.jobsDrawerOpen)
  const setJobsPanelOpen = useWorkspaceStore((state) => state.setJobsDrawerOpen)
  const toggleJobsPanel = useWorkspaceStore((state) => state.toggleJobsDrawer)
  const jobsQuery = useJobsQuery()
  const cancelJobMutation = useCancelJobMutation()

  const jobs = useMemo(() => (jobsQuery.data ? adaptJobs(jobsQuery.data) : []), [jobsQuery.data])
  const activeJobsCount = jobs.filter((item) => item.status === 'pending' || item.status === 'running').length

  const handleCancelJob = async (jobId: string) => {
    await cancelJobMutation.mutateAsync(jobId)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workflow', 'jobs'] }),
      queryClient.invalidateQueries({ queryKey: ['workflow', 'datasets-catalog'] }),
    ])
  }

  return (
    <div className="shell">
      <aside className="shell__rail">
        <NavLink aria-label="Перейти на главную" className="shell__logo-link" to="/datasets">
          <img alt="Логотип Tiny Augment Anything" className="shell__logo" height="56" src="/favicon/favicon-512.png" width="56" />
        </NavLink>
        <button
          aria-controls="jobs-drawer"
          aria-expanded={jobsPanelOpen}
          className="shell__rail-button"
          onClick={toggleJobsPanel}
          type="button"
        >
          <span className="shell__rail-button-count">{activeJobsCount}</span>
          <span className="shell__rail-button-label">Jobs</span>
        </button>
      </aside>

      <div className="shell__content">{children}</div>

      {jobsPanelOpen ? <button aria-label="Закрыть очередь задач" className="shell__backdrop" onClick={() => setJobsPanelOpen(false)} type="button" /> : null}

      <aside className={jobsPanelOpen ? 'shell__drawer shell__drawer--open' : 'shell__drawer'} id="jobs-drawer">
        <div className="shell__drawer-head">
          <div className="shell__brand">
            <p className="shell__eyebrow">Tiny Augment Anything</p>
            <h1 className="shell__title">Очередь задач</h1>
            <p className="shell__subtitle">Текущие фоновые процессы и их состояние.</p>
          </div>
          <button className="shell__drawer-close" onClick={() => setJobsPanelOpen(false)} type="button">
            Закрыть
          </button>
        </div>

        <section className="shell__queue-card">
          <div className="shell__queue-summary">
            <span>Активных</span>
            <strong>{activeJobsCount}</strong>
          </div>
          {jobs.length > 0 ? (
            <div className="shell__queue-list">
              {jobs.slice(0, 8).map((item) => {
                const isActive = item.status === 'pending' || item.status === 'running'
                return (
                  <article className="shell__queue-item" key={item.jobId}>
                    <div className="shell__queue-item-head">
                      <strong>{item.taskType}</strong>
                      <span>{Math.round(item.progress * 100)}%</span>
                    </div>
                    <span className={`shell__queue-item-status shell__queue-item-status--${item.status}`}>{item.status}</span>
                    <p className="shell__queue-item-copy">{item.datasetName ?? item.message ?? 'Фоновая задача'}</p>
                    <div className="shell__queue-progress">
                      <div className="shell__queue-progress-fill" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    </div>
                    {isActive ? (
                      <button className="shell__queue-action" onClick={() => void handleCancelJob(item.jobId)} type="button">
                        Отменить
                      </button>
                    ) : null}
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="shell__queue-empty">
              <strong>Очередь пуста</strong>
              <span>Новые задачи появятся здесь.</span>
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
