import { useMemo, useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { type AreaPoint, type PolygonTemplate, type TextPromptTemplate } from '@/pages/modify/modify.types'
import { type ModificationSourceAsset } from '@/shared/types/workflow'

type BatchTemplatePlannerProps = {
  onApprovePlan: (params: { polygonTemplateId: string | null; sourceAssetIds: string[]; textTemplateId: string | null }) => void
  polygonTemplates: PolygonTemplate[]
  selectedSourceIds: Record<string, boolean>
  sourceItems: ModificationSourceAsset[]
  textTemplates: TextPromptTemplate[]
}

export function BatchTemplatePlanner({
  onApprovePlan,
  polygonTemplates,
  selectedSourceIds,
  sourceItems,
  textTemplates,
}: BatchTemplatePlannerProps) {
  const [textTemplateId, setTextTemplateId] = useState<string | null>(textTemplates[0]?.id ?? null)
  const [polygonTemplateId, setPolygonTemplateId] = useState<string | null>(polygonTemplates[0]?.id ?? null)
  const selectedSources = useMemo(
    () => sourceItems.filter((item) => selectedSourceIds[item.assetId] !== false),
    [selectedSourceIds, sourceItems],
  )
  const activePolygon = polygonTemplates.find((template) => template.id === polygonTemplateId) ?? null
  const activeTextTemplate = textTemplates.find((template) => template.id === textTemplateId) ?? null

  return (
    <section className="info-card">
      <div className="batch-planner__head">
        <div>
          <strong>Batch planner</strong>
          <p className="info-card__text">
            Выбери текстовый шаблон, шаблон полигона и проверь превью перед тем, как отправить всю пачку в jobs.
          </p>
        </div>
        <div className="batch-planner__summary">
          <span>Источников: {selectedSources.length}</span>
          <span>Text template: {activeTextTemplate?.name ?? 'не выбран'}</span>
          <span>Polygon: {activePolygon?.name ?? 'не выбран'}</span>
        </div>
      </div>

      <div className="batch-planner__controls">
        <label className="batch-planner__field">
          <span>Текстовый шаблон</span>
          <select onChange={(event) => setTextTemplateId(event.target.value || null)} value={textTemplateId ?? ''}>
            <option value="">Не выбран</option>
            {textTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="batch-planner__field">
          <span>Polygon template</span>
          <select onChange={(event) => setPolygonTemplateId(event.target.value || null)} value={polygonTemplateId ?? ''}>
            <option value="">Не выбран</option>
            {polygonTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeTextTemplate ? (
        <div className="batch-planner__copy">
          <strong>Как будет генерироваться</strong>
          <p className="info-card__text">Positive: {activeTextTemplate.prompt}</p>
          <p className="info-card__text">Negative: {activeTextTemplate.negativePrompt ?? 'не задан'}</p>
        </div>
      ) : null}

      <div className="batch-planner__preview-grid">
        {selectedSources.map((source) => (
          <article className="batch-planner__preview-card" key={source.assetId}>
            <div className="batch-planner__preview-media">
              <img alt={source.className} src={source.assetUrl} />
              {activePolygon ? <PolygonOverlay points={activePolygon.points} /> : null}
            </div>
            <div className="batch-planner__preview-meta">
              <strong>{source.className}</strong>
              <span>{activePolygon ? 'Полигон наложен' : 'Без полигона'}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="batch-planner__actions">
        <Button
          disabled={!activeTextTemplate || !activePolygon || selectedSources.length === 0}
          onClick={() =>
            onApprovePlan({
              polygonTemplateId,
              sourceAssetIds: selectedSources.map((item) => item.assetId),
              textTemplateId,
            })
          }
          type="button"
        >
          Подтвердить пачку и отправить в jobs
        </Button>
      </div>
    </section>
  )
}

function PolygonOverlay({ points }: { points: AreaPoint[] }) {
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x * 100}% ${y * 100}%`).join(' ')

  return (
    <svg className="batch-planner__overlay" preserveAspectRatio="none" viewBox="0 0 100 100">
      <path className="batch-planner__overlay-path" d={`${path} Z`} />
    </svg>
  )
}
