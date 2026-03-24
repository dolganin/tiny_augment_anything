import { useState } from 'react'
import { Button } from '@/shared/ui/buttons/Button'
import { PolygonTemplate, SelectionPromptTemplate, TextPromptTemplate } from '@/pages/modify/modify.types'

type DatasetTemplatePanelProps = {
  canMigrateLocalTemplates?: boolean
  isMigratingTemplates?: boolean
  onApplyPolygonTemplate: (template: PolygonTemplate) => void
  onApplySelectionTemplate: (template: SelectionPromptTemplate) => void
  onApplyTextTemplate: (template: TextPromptTemplate) => void
  onCreatePolygonTemplate: (name: string) => void
  onCreateSelectionTemplate: (name: string) => void
  onCreateTextTemplate: (name: string) => void
  onDeletePolygonTemplate: (templateId: string) => void
  onDeleteSelectionTemplate: (templateId: string) => void
  onDeleteTextTemplate: (templateId: string) => void
  onMigrateLocalTemplates?: () => void
  polygonTemplates: PolygonTemplate[]
  selectionTemplates: SelectionPromptTemplate[]
  textTemplates: TextPromptTemplate[]
}

export function DatasetTemplatePanel({
  canMigrateLocalTemplates = false,
  isMigratingTemplates = false,
  onApplyPolygonTemplate,
  onApplySelectionTemplate,
  onApplyTextTemplate,
  onCreatePolygonTemplate,
  onCreateSelectionTemplate,
  onCreateTextTemplate,
  onDeletePolygonTemplate,
  onDeleteSelectionTemplate,
  onDeleteTextTemplate,
  onMigrateLocalTemplates,
  polygonTemplates,
  selectionTemplates,
  textTemplates,
}: DatasetTemplatePanelProps) {
  const [textName, setTextName] = useState('')
  const [selectionName, setSelectionName] = useState('')
  const [polygonName, setPolygonName] = useState('')

  return (
    <section className="info-card">
      <div className="template-panel__head">
        <div>
          <strong>Шаблоны датасета</strong>
          <p className="info-card__text">
            Сохраняй шаблоны текста, текстового выделения и полигона отдельно для текущего датасета.
          </p>
        </div>
        {canMigrateLocalTemplates && onMigrateLocalTemplates ? (
          <Button disabled={isMigratingTemplates} onClick={onMigrateLocalTemplates} type="button" variant="secondary">
            {isMigratingTemplates ? 'Переношу...' : 'Перенести локальные шаблоны'}
          </Button>
        ) : null}
      </div>

      <div className="template-panel__composer-grid">
        <div className="template-panel__composer">
          <span>Текстовый шаблон</span>
          <input onChange={(event) => setTextName(event.target.value)} placeholder="Например, Маска для лица" value={textName} />
          <Button
            disabled={!textName.trim()}
            onClick={() => {
              onCreateTextTemplate(textName)
              setTextName('')
            }}
            type="button"
          >
            Сохранить prompt + negative
          </Button>
        </div>

        <div className="template-panel__composer">
          <span>Selection template</span>
          <input onChange={(event) => setSelectionName(event.target.value)} placeholder="Например, Лицо" value={selectionName} />
          <Button
            disabled={!selectionName.trim()}
            onClick={() => {
              onCreateSelectionTemplate(selectionName)
              setSelectionName('')
            }}
            type="button"
          >
            Сохранить SAM prompt
          </Button>
        </div>

        <div className="template-panel__composer">
          <span>Polygon template</span>
          <input onChange={(event) => setPolygonName(event.target.value)} placeholder="Например, Верхняя часть лица" value={polygonName} />
          <Button
            disabled={!polygonName.trim()}
            onClick={() => {
              onCreatePolygonTemplate(polygonName)
              setPolygonName('')
            }}
            type="button"
          >
            Сохранить полигон
          </Button>
        </div>
      </div>

      <div className="template-panel__libraries">
        <TemplateList
          items={textTemplates}
          onApply={(template) => onApplyTextTemplate(template)}
          onDelete={onDeleteTextTemplate}
          title="Текстовые шаблоны"
        />
        <TemplateList
          items={selectionTemplates}
          onApply={(template) => onApplySelectionTemplate(template)}
          onDelete={onDeleteSelectionTemplate}
          title="Selection templates"
        />
        <TemplateList
          items={polygonTemplates}
          onApply={(template) => onApplyPolygonTemplate(template)}
          onDelete={onDeletePolygonTemplate}
          title="Polygon templates"
        />
      </div>
    </section>
  )
}

function TemplateList<T extends { id: string; name: string }>({
  items,
  onApply,
  onDelete,
  title,
}: {
  items: T[]
  onApply: (template: T) => void
  onDelete: (templateId: string) => void
  title: string
}) {
  return (
    <div className="template-panel__library">
      <strong>{title}</strong>
      <div className="template-panel__chips">
        {items.length === 0 ? <span className="template-panel__empty">Пока пусто</span> : null}
        {items.map((template) => (
          <div className="template-panel__chip" key={template.id}>
            <button onClick={() => onApply(template)} type="button">
              {template.name}
            </button>
            <button
              aria-label={`Удалить ${template.name}`}
              className="template-panel__delete"
              onClick={() => onDelete(template.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
