import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFinalizeReviewMutation } from '@/shared/api/workflow.hooks'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { Modal } from '@/shared/ui/feedback/Modal'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { useSessionStore } from '@/store/session/session.store'
import { ReviewWorkspace } from '@/features/generation-review/ReviewWorkspace'

export function ReviewPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const fineTuneEnabled = useSessionStore((state) => state.fineTuneEnabled)
  const fineTuneResolved = useSessionStore((state) => state.fineTuneResolved)
  const setSession = useSessionStore((state) => state.setSession)
  const finalizeReviewMutation = useFinalizeReviewMutation(sessionId ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setSession({ workflowStage: 'review' })
  }, [setSession])

  const closeReview = async () => {
    try {
      if (sessionId) {
        await finalizeReviewMutation.mutateAsync({ nextStage: 'modify' })
      }
      setSession({
        workflowStage: 'modify',
        fineTuneEnabled,
        fineTuneResolved,
        approvedItems: [],
        rejectedItemIds: [],
        generationResults: [],
      })
      navigate('/modify')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const startClassifier = async () => {
    try {
      if (sessionId) {
        await finalizeReviewMutation.mutateAsync({ nextStage: 'classifier-train' })
      }
      setSession({
        workflowStage: 'classifier-train',
        classifierJobId: null,
        approvedItems: [],
        rejectedItemIds: [],
        generationResults: [],
      })
      navigate('/classifier/train')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <PageFrame title="Отбор результатов">
      <ReviewWorkspace onClose={() => void closeReview()} onStartClassifier={() => void startClassifier()} open />
      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка завершения review"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </PageFrame>
  )
}
