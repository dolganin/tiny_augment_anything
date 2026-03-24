import { useEffect, useMemo, useState } from 'react'
import { ReviewGalleryItem } from '@/features/generation-review/ReviewImageCard'
import { GenerationAsset } from '@/shared/types/workflow'

type UseReviewGalleryParams = {
  approvedItems: GenerationAsset[]
  pendingItems: GenerationAsset[]
  rejectedItems: GenerationAsset[]
}

export function useReviewGallery({
  approvedItems,
  pendingItems,
  rejectedItems,
}: UseReviewGalleryParams) {
  const [lightboxAssetId, setLightboxAssetId] = useState<string | null>(null)

  const items = useMemo<ReviewGalleryItem[]>(() => {
    const approved = approvedItems.map<ReviewGalleryItem>((item) => ({ ...item, status: 'approved' }))
    const rejected = rejectedItems.map<ReviewGalleryItem>((item) => ({ ...item, status: 'rejected' }))
    const pending = pendingItems
      .filter(
        (item) =>
          !approvedItems.some((approvedItem) => approvedItem.id === item.id) &&
          !rejectedItems.some((rejectedItem) => rejectedItem.id === item.id),
      )
      .map<ReviewGalleryItem>((item) => ({ ...item, status: 'pending' }))

    return [...pending, ...approved, ...rejected]
  }, [approvedItems, pendingItems, rejectedItems])

  const currentLightboxIndex = useMemo(
    () => items.findIndex((item) => item.id === lightboxAssetId),
    [items, lightboxAssetId],
  )

  const lightboxItem = currentLightboxIndex >= 0 ? items[currentLightboxIndex] : null

  useEffect(() => {
    if (!lightboxAssetId || items.some((item) => item.id === lightboxAssetId)) {
      return
    }
    setLightboxAssetId(null)
  }, [items, lightboxAssetId])

  return {
    currentLightboxIndex,
    items,
    lightboxItem,
    moveLightbox: (direction: -1 | 1) => {
      if (items.length === 0) {
        return
      }
      const nextIndex =
        currentLightboxIndex < 0
          ? 0
          : (currentLightboxIndex + direction + items.length) % items.length
      setLightboxAssetId(items[nextIndex].id)
    },
    openLightbox: (itemId: string) => setLightboxAssetId(itemId),
    closeLightbox: () => setLightboxAssetId(null),
  }
}
