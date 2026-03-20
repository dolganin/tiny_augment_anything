import { PropsWithChildren } from 'react'
import { NavLink } from 'react-router-dom'
import { workflowStages } from '@/shared/types/workflow'
import { useSessionStore } from '@/store/session/session.store'
import '@/shared/ui/layouts/layouts.css'

const labels: Record<(typeof workflowStages)[number], string> = {
  upload: 'Загрузка',
  'dataset-stats': 'Статистика',
  'fine-tune': 'Дообучение',
  'mode-select': 'Режим',
  generate: 'Генерация',
  modify: 'Модификация',
  review: 'Отбор',
  'classifier-train': 'Классификатор',
  metrics: 'Метрики',
  download: 'Скачивание',
}

const paths: Record<(typeof workflowStages)[number], string> = {
  upload: '/upload',
  'dataset-stats': '/dataset/stats',
  'fine-tune': '/diffusion/fine-tune',
  'mode-select': '/mode',
  generate: '/generate',
  modify: '/modify',
  review: '/review',
  'classifier-train': '/classifier/train',
  metrics: '/metrics',
  download: '/download',
}

export function AppShell({ children }: PropsWithChildren) {
  const workflowStage = useSessionStore((state) => state.workflowStage)
  const sessionId = useSessionStore((state) => state.sessionId)

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <p className="shell__eyebrow">Tiny Augment Anything</p>
          <h1 className="shell__title">Диффузионная сборка датасета</h1>
          <p className="shell__subtitle">Сценарный интерфейс для обработки, генерации и проверки.</p>
        </div>

        <nav className="shell__nav">
          {workflowStages.map((stage) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? 'shell__nav-item shell__nav-item--active' : 'shell__nav-item'
              }
              key={stage}
              to={paths[stage]}
            >
              <span className="shell__nav-label">{labels[stage]}</span>
              <span className="shell__nav-state">
                {stage === workflowStage ? 'Текущий этап' : 'Маршрут'}
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="shell__session">
          <span className="shell__session-label">Сессия</span>
          <span className="shell__session-value">{sessionId ?? 'ещё не создана'}</span>
        </div>
      </aside>

      <div className="shell__content">{children}</div>
    </div>
  )
}
