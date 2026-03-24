import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react'

type AreaPoint = [number, number]

type ModificationCanvasProps = {
  imageUrl: string
  className: string
  areaPoints: AreaPoint[]
  areaConfirmed: boolean
  onAreaPointsChange: (value: AreaPoint[]) => void
}

type Size = {
  width: number
  height: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const getPointInImage = (event: MouseEvent<SVGSVGElement>, width: number, height: number): AreaPoint => {
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = clamp(event.clientX - bounds.left, 0, bounds.width)
  const y = clamp(event.clientY - bounds.top, 0, bounds.height)
  return [
    bounds.width > 0 ? (x / bounds.width) * width : 0,
    bounds.height > 0 ? (y / bounds.height) * height : 0,
  ]
}

const toSvgPath = (points: AreaPoint[]) => {
  if (points.length === 0) {
    return ''
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ')
}

export function ModificationCanvas({
  imageUrl,
  className,
  areaPoints,
  areaConfirmed,
  onAreaPointsChange,
}: ModificationCanvasProps) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [naturalSize, setNaturalSize] = useState<Size | null>(null)
  const [renderSize, setRenderSize] = useState<Size | null>(null)
  const [hoverPoint, setHoverPoint] = useState<AreaPoint | null>(null)

  useEffect(() => {
    const element = imageRef.current
    if (!element) {
      return
    }
    const updateSize = () => {
      setRenderSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [imageUrl])

  const activePoints = useMemo(() => {
    if (!naturalSize || !renderSize) {
      return []
    }
    const scaleX = renderSize.width / naturalSize.width
    const scaleY = renderSize.height / naturalSize.height
    return areaPoints.map<AreaPoint>((point) => [point[0] * scaleX, point[1] * scaleY])
  }, [areaPoints, naturalSize, renderSize])

  const previewPath = useMemo(() => {
    if (activePoints.length === 0) {
      return ''
    }
    const previewPoints = !areaConfirmed && hoverPoint ? [...activePoints, hoverPoint] : activePoints
    return toSvgPath(previewPoints)
  }, [activePoints, areaConfirmed, hoverPoint])

  const polygonPath = useMemo(() => {
    if (activePoints.length < 3) {
      return ''
    }
    return `${toSvgPath(activePoints)} Z`
  }, [activePoints])

  const selectionLabel =
    areaPoints.length < 3
      ? 'Полигон не замкнут'
      : areaConfirmed
        ? 'Область применена'
        : 'Полигон готов к применению'

  const handleAddPoint = (event: MouseEvent<SVGSVGElement>) => {
    if (!naturalSize || areaConfirmed) {
      return
    }
    const point = getPointInImage(event, naturalSize.width, naturalSize.height)
    onAreaPointsChange([...areaPoints, point])
  }

  const handleMove = (event: MouseEvent<SVGSVGElement>) => {
    if (!naturalSize || !renderSize || areaPoints.length === 0 || areaConfirmed) {
      setHoverPoint(null)
      return
    }
    const [x, y] = getPointInImage(event, renderSize.width, renderSize.height)
    setHoverPoint([x, y])
  }

  const handleLeave = () => {
    setHoverPoint(null)
  }

  return (
    <section className="modify-stage">
      <div className="modify-stage__head">
        <span className="modify-stage__class">{className}</span>
        <span className="modify-stage__selection">{selectionLabel}</span>
      </div>
      <div className="modify-canvas">
        <img
          alt="Источник для модификации"
          className="modify-preview"
          onLoad={(event) => {
            setNaturalSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
            setRenderSize({
              width: event.currentTarget.clientWidth,
              height: event.currentTarget.clientHeight,
            })
          }}
          ref={imageRef}
          src={imageUrl}
        />
        {renderSize ? (
          <svg
            className="modify-canvas__svg"
            height={renderSize.height}
            onClick={handleAddPoint}
            onMouseLeave={handleLeave}
            onMouseMove={handleMove}
            viewBox={`0 0 ${renderSize.width} ${renderSize.height}`}
            width={renderSize.width}
          >
            <rect className="modify-canvas__veil" height={renderSize.height} width={renderSize.width} x={0} y={0} />
            {previewPath ? <path className="modify-canvas__line" d={previewPath} /> : null}
            {polygonPath ? (
              <path
                className={areaConfirmed ? 'modify-canvas__polygon modify-canvas__polygon--confirmed' : 'modify-canvas__polygon'}
                d={polygonPath}
              />
            ) : null}
            {activePoints.map((point, index) => (
              <g className="modify-canvas__vertex" key={`${point[0]}-${point[1]}-${index}`}>
                <circle cx={point[0]} cy={point[1]} r={11} />
                <circle className="modify-canvas__vertex-core" cx={point[0]} cy={point[1]} r={4} />
              </g>
            ))}
            {hoverPoint && areaPoints.length > 0 ? (
              <circle className="modify-canvas__hover" cx={hoverPoint[0]} cy={hoverPoint[1]} r={6} />
            ) : null}
          </svg>
        ) : null}
      </div>
      <div className="modify-stage__actions">
        <p className="modify-stage__hint">Щёлкай по изображению, чтобы поставить вершины полигона для inpaint.</p>
      </div>
    </section>
  )
}
