import { PointerEvent, useMemo, useRef, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'

type AreaBox = [number, number, number, number]

type DraftBox = {
  startX: number
  startY: number
  endX: number
  endY: number
}

type ModificationCanvasProps = {
  imageUrl: string
  className: string
  areaBox: AreaBox | null
  onAreaBoxChange: (value: AreaBox | null) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const normalizeDraft = (draft: DraftBox): AreaBox => [
  Math.min(draft.startX, draft.endX),
  Math.min(draft.startY, draft.endY),
  Math.max(draft.startX, draft.endX),
  Math.max(draft.startY, draft.endY),
]

export function ModificationCanvas({ imageUrl, className, areaBox, onAreaBoxChange }: ModificationCanvasProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)

  const normalizedDraft = useMemo(() => (draftBox ? normalizeDraft(draftBox) : null), [draftBox])
  const selectionLabel = useMemo(() => {
    if (!areaBox) {
      return 'Область не выделена'
    }
    return `${Math.round(areaBox[2] - areaBox[0])} × ${Math.round(areaBox[3] - areaBox[1])} px`
  }, [areaBox])

  const readLocalPoint = (event: PointerEvent<HTMLDivElement>) => {
    const frame = frameRef.current
    if (!frame) {
      return null
    }
    const bounds = frame.getBoundingClientRect()
    return {
      x: clamp(event.clientX - bounds.left, 0, bounds.width),
      y: clamp(event.clientY - bounds.top, 0, bounds.height),
      width: bounds.width,
      height: bounds.height,
    }
  }

  const toNaturalBox = (box: AreaBox, width: number, height: number): AreaBox | null => {
    if (!naturalSize || width <= 0 || height <= 0) {
      return null
    }
    const scaleX = naturalSize.width / width
    const scaleY = naturalSize.height / height
    const normalized: AreaBox = [
      box[0] * scaleX,
      box[1] * scaleY,
      box[2] * scaleX,
      box[3] * scaleY,
    ]
    if (normalized[2] - normalized[0] < 8 || normalized[3] - normalized[1] < 8) {
      return null
    }
    return normalized
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const point = readLocalPoint(event)
    if (!point) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraftBox({
      startX: point.x,
      startY: point.y,
      endX: point.x,
      endY: point.y,
    })
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draftBox) {
      return
    }
    const point = readLocalPoint(event)
    if (!point) {
      return
    }
    setDraftBox({
      startX: draftBox.startX,
      startY: draftBox.startY,
      endX: point.x,
      endY: point.y,
    })
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const point = readLocalPoint(event)
    const frame = frameRef.current
    if (!draftBox || !point || !frame) {
      setDraftBox(null)
      return
    }
    const nextDraft: DraftBox = {
      startX: draftBox.startX,
      startY: draftBox.startY,
      endX: point.x,
      endY: point.y,
    }
    const normalized = normalizeDraft(nextDraft)
    onAreaBoxChange(toNaturalBox(normalized, frame.clientWidth, frame.clientHeight))
    setDraftBox(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const renderBoxStyle = (box: AreaBox | null) => {
    if (!box || !naturalSize) {
      return undefined
    }
    return {
      left: `${(box[0] / naturalSize.width) * 100}%`,
      top: `${(box[1] / naturalSize.height) * 100}%`,
      width: `${((box[2] - box[0]) / naturalSize.width) * 100}%`,
      height: `${((box[3] - box[1]) / naturalSize.height) * 100}%`,
    }
  }

  const draftStyle = normalizedDraft
    ? {
        left: `${normalizedDraft[0]}px`,
        top: `${normalizedDraft[1]}px`,
        width: `${normalizedDraft[2] - normalizedDraft[0]}px`,
        height: `${normalizedDraft[3] - normalizedDraft[1]}px`,
      }
    : undefined

  return (
    <section className="modify-stage">
      <div className="modify-stage__head">
        <span className="modify-stage__class">{className}</span>
        <span className="modify-stage__selection">{selectionLabel}</span>
      </div>
      <div
        className="modify-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={frameRef}
      >
        <img
          alt="Источник для модификации"
          className="modify-preview modify-preview--hero"
          onLoad={(event) =>
            setNaturalSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          src={imageUrl}
        />
        <div className="modify-canvas__overlay" />
        {areaBox ? <div className="modify-canvas__box modify-canvas__box--saved" style={renderBoxStyle(areaBox)} /> : null}
        {draftStyle ? <div className="modify-canvas__box modify-canvas__box--draft" style={draftStyle} /> : null}
      </div>
      <div className="modify-stage__actions">
        <p className="modify-stage__hint">Потяни мышью по изображению, если хочешь изменить только часть кадра.</p>
        <Button disabled={!areaBox} onClick={() => onAreaBoxChange(null)} type="button" variant="ghost">
          Сбросить область
        </Button>
      </div>
    </section>
  )
}
