import { useEffect, useMemo, useState } from 'react'
import { adaptGenerationResults } from '@/shared/api/adapters'
import {
  useApproveAssetMutation,
  useGenerationResultsQuery,
  useRejectAssetMutation,
} from '@/shared/api/workflow.hooks'
import { Modal } from '@/shared/ui/feedback/Modal'
import { Spinner } from '@/shared/ui/feedback/Spinner'
import { getErrorMessage } from '@/shared/lib/get-error-message'
import { useSessionStore } from '@/store/session/session.store'
import { ReviewQueue } from '@/features/generation-review/ReviewQueue'

type ReviewWorkspaceProps = {
  open: boolean
  onClose: () => void
  onStartClassifier: () => void
}

export function ReviewWorkspace({ open, onClose, onStartClassifier }: ReviewWorkspaceProps) {
  const sessionId = useSessionStore((state) => state.sessionId)
  const approvedItems = useSessionStore((state) => state.approvedItems)
  const setSession = useSessionStore((state) => state.setSession)
  const resultsQuery = useGenerationResultsQuery(open ? sessionId : null)
  const approveMutation = useApproveAssetMutation(sessionId ?? '')
  const rejectMutation = useRejectAssetMutation(sessionId ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  if (!open) {
    return null
  }

  if (resultsQuery.isLoading) {
    return (
      <div className="review-overlay" role="presentation">
        <div className="review-overlay__backdrop" />
        <section aria-modal="true" className="review-overlay__dialog review-overlay__dialog--loading" role="dialog">
          <Spinner label="Подтягиваю результаты генерации или модификации для проверки." />
        </section>
      </div>
    )
  }

  return (
    <>
      <ReviewQueue
        approvedCount={approvedItems.length}
        asset={currentAsset}
        isMutating={approveMutation.isPending || rejectMutation.isPending}
        onApprove={() => void handleApprove()}
        onClose={onClose}
        onReject={() => void handleReject()}
        onStartClassifier={onStartClassifier}
        pendingCount={queue?.items.length ?? 0}
        remainingCount={queue?.remainingCount ?? 0}
        targetCount={queue?.targetCount ?? 0}
      />

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
