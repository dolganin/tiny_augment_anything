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
import { ReviewGalleryModal } from '@/features/generation-review/ReviewGalleryModal'
import { ReviewGalleryItem } from '@/features/generation-review/ReviewImageCard'
import { useSessionStore } from '@/store/session/session.store'
import { useReviewGallery } from '@/features/generation-review/useReviewGallery'

type ReviewWorkspaceProps = {
  open: boolean
  onClose: () => void
  onSaveToDataset: () => void
  onStartClassifier: () => void
}

export function ReviewWorkspace({ open, onClose, onSaveToDataset, onStartClassifier }: ReviewWorkspaceProps) {
  const sessionId = useSessionStore((state) => state.sessionId)
  const approvedItems = useSessionStore((state) => state.approvedItems)
  const setSession = useSessionStore((state) => state.setSession)
  const resultsQuery = useGenerationResultsQuery(open ? sessionId : null)
  const approveMutation = useApproveAssetMutation(sessionId ?? '')
  const rejectMutation = useRejectAssetMutation(sessionId ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rejectedItems, setRejectedItems] = useState<ReviewGalleryItem[]>([])

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

  const {
    closeLightbox,
    currentLightboxIndex,
    items,
    lightboxItem,
    moveLightbox,
    openLightbox,
  } = useReviewGallery({
    approvedItems,
    pendingItems: queue?.items ?? [],
    rejectedItems,
  })

  const handleApprove = async (asset: ReviewGalleryItem) => {
    if (!sessionId || asset.status === 'approved') {
      return
    }

    try {
      await approveMutation.mutateAsync(asset.id)
      setSession({
        approvedItems: [...approvedItems.filter((item) => item.id !== asset.id), asset],
        generationResults: queue?.items.filter((item) => item.id !== asset.id) ?? [],
      })
      setRejectedItems((current) => current.filter((item) => item.id !== asset.id))
      await resultsQuery.refetch()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const handleReject = async (asset: ReviewGalleryItem) => {
    if (!sessionId || asset.status === 'rejected') {
      return
    }

    try {
      await rejectMutation.mutateAsync(asset.id)
      setSession({
        rejectedItemIds: [...useSessionStore.getState().rejectedItemIds, asset.id],
        generationResults: queue?.items.filter((item) => item.id !== asset.id) ?? [],
      })
      setRejectedItems((current) => [...current.filter((item) => item.id !== asset.id), { ...asset, status: 'rejected' }])
      await resultsQuery.refetch()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  const handleRejectAll = async () => {
    if (!sessionId || !queue?.items.length) {
      return
    }
    try {
      for (const item of queue.items) {
        await rejectMutation.mutateAsync(item.id)
      }
      setSession({
        rejectedItemIds: [
          ...useSessionStore.getState().rejectedItemIds,
          ...queue.items.map((item) => item.id),
        ],
        generationResults: [],
      })
      setRejectedItems((current) => [
        ...current.filter((item) => !queue.items.some((pendingItem) => pendingItem.id === item.id)),
        ...queue.items.map((item) => ({ ...item, status: 'rejected' as const })),
      ])
      await resultsQuery.refetch()
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (lightboxItem) {
          closeLightbox()
          return
        }
        onClose()
        return
      }

      if (event.key === ' ' && items.length > 0) {
        event.preventDefault()
        if (lightboxItem) {
          closeLightbox()
        } else {
          openLightbox(items[0].id)
        }
        return
      }

      if (!lightboxItem) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveLightbox(-1)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        moveLightbox(1)
        return
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault()
        void handleApprove(lightboxItem)
        return
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        void handleReject(lightboxItem)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeLightbox, handleApprove, handleReject, items, lightboxItem, moveLightbox, onClose, open, openLightbox])

  if (!open) {
    return null
  }

  if (resultsQuery.isLoading) {
    return (
      <div className="review-gallery-modal-layer" role="presentation">
        <div className="review-gallery-modal-backdrop" />
        <section aria-modal="true" className="review-gallery-modal" role="dialog">
          <Spinner label="Подтягиваю результаты генерации или модификации для проверки." />
        </section>
      </div>
    )
  }

  return (
    <>
      <ReviewGalleryModal
        approvedCount={approvedItems.length}
        currentLightboxIndex={currentLightboxIndex}
        disableRejectAll={!queue?.items.length || approveMutation.isPending || rejectMutation.isPending}
        disableSave={approvedItems.length === 0 || approveMutation.isPending || rejectMutation.isPending}
        disableStartClassifier={approvedItems.length === 0 || approveMutation.isPending || rejectMutation.isPending}
        isMutating={approveMutation.isPending || rejectMutation.isPending}
        items={items}
        lightboxItem={lightboxItem}
        onApprove={(item) => void handleApprove(item)}
        onClose={onClose}
        onCloseLightbox={closeLightbox}
        onMoveLightbox={moveLightbox}
        onOpenLightbox={openLightbox}
        onReject={(item) => void handleReject(item)}
        onRejectAll={() => void handleRejectAll()}
        onSaveToDataset={onSaveToDataset}
        onStartClassifier={onStartClassifier}
        open={open}
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
