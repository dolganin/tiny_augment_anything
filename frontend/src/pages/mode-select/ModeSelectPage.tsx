import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSyncWorkflowStateMutation } from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import '@/features/generation-config/generation-config.css'

export function ModeSelectPage() {
  const navigate = useNavigate()
  const fineTuneEnabled = useSessionStore((state) => state.fineTuneEnabled)
  const setSession = useSessionStore((state) => state.setSession)
  const sessionId = useSessionStore((state) => state.sessionId)
  const syncWorkflowStateMutation = useSyncWorkflowStateMutation(sessionId ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setSession({ workflowStage: 'mode-select' })
  }, [setSession])

  const selectMode = async (mode: 'generate' | 'modify') => {
    try {
      if (sessionId) {
        await syncWorkflowStateMutation.mutateAsync({
          workflowStage: mode,
          currentMode: mode,
        })
      }
      setSession({
        currentMode: mode,
        workflowStage: mode,
      })
      navigate(mode === 'generate' ? '/generate' : '/modify')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <PageFrame title="Выбор режима">
      <div className="mode-grid">
        <article className={clsx('mode-card', !fineTuneEnabled && 'mode-card--disabled')}>
          <h3 className="mode-card__title">Генерировать</h3>
          <p className="mode-card__text">
            Создание новых изображений по текстовому промпту и редактируемому набору параметров.
          </p>
          <Button disabled={!fineTuneEnabled || syncWorkflowStateMutation.isPending} onClick={() => selectMode('generate')}>
            Открыть генерацию
          </Button>
        </article>

        <article className="mode-card">
          <h3 className="mode-card__title">Модифицировать</h3>
          <p className="mode-card__text">
            Работа с существующими изображениями выбранных классов без обязательного fine-tune.
          </p>
          <Button onClick={() => selectMode('modify')} variant="secondary" disabled={syncWorkflowStateMutation.isPending}>
            Открыть модификацию
          </Button>
        </article>
      </div>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка выбора режима"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </PageFrame>
  )
}
