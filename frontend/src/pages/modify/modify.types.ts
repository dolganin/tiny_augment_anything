export type ModifyFormValues = {
  prompt: string
}

export type AreaPoint = [number, number]

export type ModificationLaunchMode = 'single' | 'batch'
export type BatchStep = 'setup' | 'select-sources'

export type PromptTemplateScope = 'text' | 'selection'

export type TextPromptTemplate = {
  id: string
  name: string
  prompt: string
}

export type NegativePromptTemplate = {
  id: string
  name: string
  text: string
}

export type SelectionPromptTemplate = {
  id: string
  name: string
  text: string
}

export type PolygonTemplate = {
  id: string
  name: string
  points: AreaPoint[]
}

export type PromptTemplate =
  | (TextPromptTemplate & { scope: 'text'; text: string })
  | (SelectionPromptTemplate & { scope: 'selection' })

export type DatasetModificationTemplates = {
  textTemplates: TextPromptTemplate[]
  negativeTemplates: NegativePromptTemplate[]
  selectionTemplates: SelectionPromptTemplate[]
  polygonTemplates: PolygonTemplate[]
}

export type BatchPreviewSource = {
  assetId: string
  assetUrl: string
  className: string
}
