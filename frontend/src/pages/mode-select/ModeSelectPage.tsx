import clsx from 'clsx'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/ui/buttons/Button'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { useSessionStore } from '@/store/session/session.store'
import '@/features/generation-config/generation-config.css'

export function ModeSelectPage() {
  const navigate = useNavigate()
  const fineTuneEnabled = useSessionStore((state) => state.fineTuneEnabled)
  const setSession = useSessionStore((state) => state.setSession)

  useEffect(() => {
    setSession({ workflowStage: 'mode-select' })
  }, [setSession])

  const selectMode = (mode: 'generate' | 'modify') => {
    setSession({
      currentMode: mode,
      workflowStage: mode,
    })
    navigate(mode === 'generate' ? '/generate' : '/modify')
  }

  return (
    <PageFrame
      title="Выбор режима"
      description="После этапа fine-tune пользователь выбирает генерацию по промпту или модификацию существующих изображений."
    >
      <div className="mode-grid">
        <article className={clsx('mode-card', !fineTuneEnabled && 'mode-card--disabled')}>
          <h3 className="mode-card__title">Генерировать</h3>
          <p className="mode-card__text">
            Создание новых изображений по текстовому промпту и редактируемому набору параметров.
          </p>
          <Button disabled={!fineTuneEnabled} onClick={() => selectMode('generate')}>
            Открыть генерацию
          </Button>
        </article>

        <article className="mode-card">
          <h3 className="mode-card__title">Модифицировать</h3>
          <p className="mode-card__text">
            Работа с существующими изображениями выбранных классов без обязательного fine-tune.
          </p>
          <Button onClick={() => selectMode('modify')} variant="secondary">
            Открыть модификацию
          </Button>
        </article>
      </div>
    </PageFrame>
  )
}
