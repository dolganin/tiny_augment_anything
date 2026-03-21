import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adaptGenerationResults } from '@/shared/api/adapters'
import {
  useApproveAssetMutation,
  useGenerationResultsQuery,
  useRejectAssetMutation,
  useStartClassifierTrainingMutation,
} from '@/shared/api/workflow.hooks'
import { Button } from '@/shared/ui/buttons/Button'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { PageFrame } from '@/shared/ui/layouts/PageFrame'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { ReviewQueue } from '@/features/generation-review/ReviewQueue'

export function ReviewPage() {
  const navigate = useNavigate()
  const sessionId = useSessionStore((state) => state.sessionId)
  const approvedItems = useSessionStore((state) => state.approvedItems)
  const setSession = useSessionStore((state) => state.setSession)
  const resultsQuery = useGenerationResultsQuery(sessionId)
  const approveMutation = useApproveAssetMutation(sessionId ?? '')
  const rejectMutation = useRejectAssetMutation(sessionId ?? '')
  const classifierMutation = useStartClassifierTrainingMutation(sessionId ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setSession({ workflowStage: 'review' })
  }, [setSession])

  const queue = useMemo(() => {
    if (!resultsQuery.data) {
      return null
    }

    return adaptGenerationResults(resultsQuery.data)
  }, [resultsQuery.data])

  useEffect(() => {
    if (resultsQuery.error) {
      setErrorMessage(getErrorMessage(resultsQuery.error))
    }
  }, [resultsQuery.error])

  const currentAsset = queue?.items[0] ?? null

  const handleApprove = async () => {
    if (!sessionId || !currentAsset) {
      return
    }

    try {
      await approveMutation.mutateAsync(currentAsset.id)
      setSession({
        approvedItems: [...approvedItems, currentAsset],
        generationResults: queue?.items.slice(1) ?? [],
      })
      await resultsQuery.refetch()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const handleReject = async () => {
    if (!sessionId || !currentAsset) {
      return
    }

    try {
      await rejectMutation.mutateAsync(currentAsset.id)
      setSession({
        rejectedItemIds: [...useSessionStore.getState().rejectedItemIds, currentAsset.id],
        generationResults: queue?.items.slice(1) ?? [],
      })
      await resultsQuery.refetch()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const handleClassifierStart = async () => {
    if (!sessionId) {
      return
    }

    try {
      const response = await classifierMutation.mutateAsync()
      setSession({
        classifierJobId: response.jobId,
        workflowStage: 'classifier-train',
      })
      navigate('/classifier/train')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  return (
    <>
      <PageFrame
        title="Отбор результатов"
        description="Изображения проверяются по одному. Принятые экземпляры сохраняются в датасет, отклонённые удаляются на стороне бэкенда."
        aside={<ReviewAside approvedCount={approvedItems.length} queue={queue?.items.length ?? 0} />}
      >
        {resultsQuery.isLoading ? (
          <div className="upload-stage__loading">
            <Spinner label="Подтягиваю результаты генерации или модификации для проверки." />
          </div>
        ) : null}

        {!resultsQuery.isLoading ? (
          <>
            <ReviewQueue
              approvedCount={approvedItems.length}
              asset={currentAsset}
              pendingCount={queue?.items.length ?? 0}
            />

            <div className="class-selection__footer">
              <Button
                disabled={!currentAsset || approveMutation.isPending || rejectMutation.isPending}
                onClick={handleReject}
                variant="ghost"
              >
                Отклонить и удалить
              </Button>
              <Button
                disabled={!currentAsset || approveMutation.isPending || rejectMutation.isPending}
                onClick={handleApprove}
              >
                Подтвердить изображение
              </Button>
            </div>

            <div className="info-card">
              <p className="info-card__text">
                Ещё нужно добрать изображений: <strong>{queue?.remainingCount ?? 0}</strong>
              </p>
              <Button
                disabled={classifierMutation.isPending}
                onClick={handleClassifierStart}
              >
                Запустить обучение классификатора
              </Button>
            </div>
          </>
        ) : null}
      </PageFrame>

      <Modal
        onClose={() => setErrorMessage(null)}
        open={Boolean(errorMessage)}
        title="Ошибка экрана review"
        tone="error"
      >
        <p className="upload-stage__error">{errorMessage}</p>
      </Modal>
    </>
  )
}

function ReviewAside({
  approvedCount,
  queue,
}: {
  approvedCount: number
  queue: number
}) {
  return (
    <div className="info-card">
      <p className="info-card__text">
        Уже принято: <strong>{approvedCount}</strong>
      </p>
      <p className="info-card__text">
        В текущей очереди: <strong>{queue}</strong>
      </p>
      <p className="info-card__text">
        Отказ по изображению отправляет на бэкенд сигнал немедленного удаления файла.
      </p>
    </div>
  )
}
