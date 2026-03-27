import { NavLink, useLocation } from 'react-router-dom'
import { datasetWorkflowStages, workflowStageLabels, workflowStagePaths, type WorkflowStage } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'

const hiddenPaths = new Set(['/', '/datasets'])

export function WorkflowStageNav() {
  const location = useLocation()
  const workflowStage = useSessionStore((state) => state.workflowStage)
  const datasetId = useSessionStore((state) => state.datasetId)

  if (!datasetId || hiddenPaths.has(location.pathname)) {
    return null
  }

  const currentStageIndex = datasetWorkflowStages.indexOf(workflowStage)

  return (
    <nav aria-label="Этапы пайплайна" className="page-frame__workflow-nav">
      {datasetWorkflowStages.map((stage) => {
        const stageIndex = datasetWorkflowStages.indexOf(stage)
        const isCompleted = currentStageIndex > stageIndex
        return (
          <NavLink
            className={({ isActive }) =>
              [
                'page-frame__workflow-link',
                isActive ? 'page-frame__workflow-link--active' : '',
                isCompleted ? 'page-frame__workflow-link--completed' : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
            key={stage}
            to={workflowStagePaths[stage]}
          >
            <span className="page-frame__workflow-label">{workflowStageLabels[stage]}</span>
            <span className="page-frame__workflow-state">{resolveStageState(stage, workflowStage, isCompleted)}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

function resolveStageState(stage: WorkflowStage, currentStage: WorkflowStage, isCompleted: boolean) {
  if (isCompleted) {
    return 'Закрыт'
  }
  if (stage === currentStage) {
    return 'Текущий'
  }
  return 'Открыть'
}
