import { PropsWithChildren, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { adaptJobs } from '@/shared/api/adapters'
import { useCancelJobMutation, useJobsQuery } from '@/shared/api/workflow.hooks'
import { workflowStages, workflowStageLabels, workflowStagePaths, type WorkflowStage } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import { useWorkspaceStore } from '@/store/workspace/workspace.store'
import '@/shared/ui/layouts/layouts.css'

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const workflowStage = useSessionStore((state) => state.workflowStage)
  const sessionId = useSessionStore((state) => state.sessionId)
  const datasetId = useSessionStore((state) => state.datasetId)
  const datasetName = useSessionStore((state) => state.datasetName)
  const currentMode = useSessionStore((state) => state.currentMode)
  const fineTuneEnabled = useSessionStore((state) => state.fineTuneEnabled)
  const fineTuneResolved = useSessionStore((state) => state.fineTuneResolved)
  const jobsPanelOpen = useWorkspaceStore((state) => state.jobsDrawerOpen)
  const toggleJobsPanel = useWorkspaceStore((state) => state.toggleJobsDrawer)
  const jobsQuery = useJobsQuery()
  const cancelJobMutation = useCancelJobMutation()

  const jobs = useMemo(() => (jobsQuery.data ? adaptJobs(jobsQuery.data) : []), [jobsQuery.data])
  const activeJobsCount = jobs.filter((item) => item.status === 'pending' || item.status === 'running').length
  const currentStageIndex = workflowStages.indexOf(workflowStage)
  const showWorkflowSidebar = Boolean(datasetId) && !['/', '/datasets', '/upload'].includes(location.pathname)

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
          <NavLink aria-label="Перейти на главную" className="shell__logo-link" to="/datasets">
            <img alt="Логотип Tiny Augment Anything" className="shell__logo" height="72" src="/favicon/favicon-512.png" width="72" />
          </NavLink>
          <p className="shell__eyebrow">Tiny Augment Anything</p>
          <h1 className="shell__title">Датасеты и пайплайны</h1>
          <p className="shell__subtitle">Каталог проектов и очередь фоновых задач.</p>
        </div>

        <section className="shell__queue-card">
          <button className="shell__queue-header" onClick={toggleJobsPanel} type="button">
            <span>Очередь задач</span>
            <strong>{jobsPanelOpen ? '−' : '+'}</strong>
          </button>
          <div className={jobsPanelOpen ? 'shell__queue-body' : 'shell__queue-body shell__queue-body--hidden'}>
            <div className="shell__queue-summary">
              <span>Активных</span>
              <strong>{activeJobsCount}</strong>
            </div>
            {jobs.length > 0 ? (
              <div className="shell__queue-list">
                {jobs.slice(0, 5).map((item) => {
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
          </div>
        </section>

        {showWorkflowSidebar ? (
          <>
            <div className="shell__dataset">
              <span className="shell__session-label">Активный датасет</span>
              <strong className="shell__dataset-name">{datasetName ?? datasetId}</strong>
              <span className="shell__session-value">{sessionId}</span>
            </div>

            <nav className="shell__nav">
              {workflowStages.map((stage) => {
                const isSkipped = isStageSkipped(stage, workflowStage, currentMode, fineTuneEnabled, fineTuneResolved)
                const isCompleted = !isSkipped && currentStageIndex > workflowStages.indexOf(stage)
                return (
                  <NavLink
                    className={({ isActive }) =>
                      [
                        'shell__nav-item',
                        isActive ? 'shell__nav-item--active' : '',
                        isCompleted ? 'shell__nav-item--completed' : '',
                        isSkipped ? 'shell__nav-item--skipped' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                    }
                    key={stage}
                    to={workflowStagePaths[stage]}
                  >
                    <div className="shell__nav-head">
                      <span className="shell__nav-label">{workflowStageLabels[stage]}</span>
                      {isCompleted ? <StepDoneIcon /> : null}
                    </div>
                    <span className="shell__nav-state">
                      {resolveStageState(stage, workflowStage, isCompleted, isSkipped)}
                    </span>
                  </NavLink>
                )
              })}
            </nav>
          </>
        ) : null}
      </aside>

      <div className="shell__content">{children}</div>
    </div>
  )
}

function isStageSkipped(
  stage: WorkflowStage,
  currentStage: WorkflowStage,
  currentMode: ReturnType<typeof useSessionStore.getState>['currentMode'],
  fineTuneEnabled: boolean,
  fineTuneResolved: boolean,
) {
  const modeStageIndex = workflowStages.indexOf('mode-select')
  const currentStageIndex = workflowStages.indexOf(currentStage)
  if (stage === 'fine-tune' && fineTuneResolved && !fineTuneEnabled && currentStageIndex >= workflowStages.indexOf('fine-tune')) {
    return true
  }
  if (stage === 'generate' && currentMode === 'modify' && currentStageIndex >= modeStageIndex) {
    return true
  }
  if (stage === 'modify' && currentMode === 'generate' && currentStageIndex >= modeStageIndex) {
    return true
  }
  return false
}

function resolveStageState(stage: WorkflowStage, currentStage: WorkflowStage, isCompleted: boolean, isSkipped: boolean) {
  if (isSkipped) {
    return 'Пропущено'
  }
  if (isCompleted) {
    return 'Этап закрыт'
  }
  if (stage === currentStage) {
    return 'Текущий этап'
  }
  return 'Открыть шаг'
}

function StepDoneIcon() {
  return (
    <svg aria-hidden="true" className="shell__nav-check" viewBox="0 0 20 20">
      <path
        d="m4.5 10.5 3.2 3.2L15.5 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  )
}
