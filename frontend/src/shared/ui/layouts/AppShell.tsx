import { PropsWithChildren, useMemo } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { adaptJobs } from '@/shared/api/adapters'
import { useCancelJobMutation, useJobsQuery } from '@/shared/api/workflow.hooks'
import { workflowStages, workflowStageLabels, workflowStagePaths } from '@/shared/types/workflow'
import { JobsDrawer } from '@/features/job-queue/JobsDrawer'
import { useSessionStore } from '@/store/session/session.store'
import { useWorkspaceStore } from '@/store/workspace/workspace.store'
import '@/shared/ui/layouts/layouts.css'

export function AppShell({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const workflowStage = useSessionStore((state) => state.workflowStage)
  const sessionId = useSessionStore((state) => state.sessionId)
  const datasetId = useSessionStore((state) => state.datasetId)
  const datasetName = useSessionStore((state) => state.datasetName)
  const jobsDrawerOpen = useWorkspaceStore((state) => state.jobsDrawerOpen)
  const toggleJobsDrawer = useWorkspaceStore((state) => state.toggleJobsDrawer)
  const setJobsDrawerOpen = useWorkspaceStore((state) => state.setJobsDrawerOpen)
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
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <p className="shell__eyebrow">Tiny Augment Anything</p>
          <h1 className="shell__title">Датасеты и пайплайны</h1>
          <p className="shell__subtitle">
            Рабочий стол хранит датасеты, позволяет вернуться к нужному pipeline и показывает фоновые задачи.
          </p>
        </div>

        <div className="shell__actions">
          <Link className="shell__home-link" to="/datasets">
            Главный экран
          </Link>
          <button className="shell__jobs-toggle" onClick={toggleJobsDrawer} type="button">
            Задачи
            <span>{activeJobsCount}</span>
          </button>
        </div>

        {datasetId ? (
          <>
            <div className="shell__dataset">
              <span className="shell__session-label">Активный датасет</span>
              <strong className="shell__dataset-name">{datasetName ?? datasetId}</strong>
              <span className="shell__session-value">{sessionId}</span>
            </div>

            <nav className="shell__nav">
              {workflowStages.map((stage) => (
                <NavLink
                  className={({ isActive }) =>
                    isActive ? 'shell__nav-item shell__nav-item--active' : 'shell__nav-item'
                  }
                  key={stage}
                  to={workflowStagePaths[stage]}
                >
                  <span className="shell__nav-label">{workflowStageLabels[stage]}</span>
                  <span className="shell__nav-state">
                    {stage === workflowStage ? 'Текущий этап' : 'Открыть шаг'}
                  </span>
                </NavLink>
              ))}
            </nav>
          </>
        ) : (
          <div className="shell__empty">
            <strong>Пайплайн появится после выбора датасета</strong>
            <span>Открой существующий датасет на главном экране или загрузи новый архив.</span>
          </div>
        )}
      </aside>

      <div className="shell__content">{children}</div>

      <JobsDrawer
        items={jobs}
        onCancelJob={(jobId) => void handleCancelJob(jobId)}
        onClose={() => setJobsDrawerOpen(false)}
        open={jobsDrawerOpen}
      />
    </div>
  )
}
