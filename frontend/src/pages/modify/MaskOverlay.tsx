import { type AreaPoint } from '@/pages/modify/modify.types'

type MaskOverlayProps = {
  points: AreaPoint[]
}

export function MaskOverlay({ points }: MaskOverlayProps) {
  if (points.length < 3) {
    return null
  }

  const path = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x * 100} ${y * 100}`)
    .join(' ')

  return (
    <svg aria-hidden="true" className="batch-mask-overlay" preserveAspectRatio="none" viewBox="0 0 100 100">
      <path className="batch-mask-overlay__path" d={`${path} Z`} />
    </svg>
  )
}
