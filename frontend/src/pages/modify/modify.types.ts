import { ModificationSourceAsset } from '@/shared/types/workflow'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'

export type ModifyFormValues = {
  prompt: string
}

export type AreaPoint = [number, number]

export type ModificationLaunchMode = 'single' | 'batch'

export type PromptTemplateScope = 'text' | 'selection'

export type TextPromptTemplate = {
  id: string
  name: string
  prompt: string
  negativePrompt?: string
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
  | (TextPromptTemplate & { scope: 'text'; text: string; negativeText?: string })
  | (SelectionPromptTemplate & { scope: 'selection' })

export type DatasetModificationTemplates = {
  textTemplates: TextPromptTemplate[]
  selectionTemplates: SelectionPromptTemplate[]
  polygonTemplates: PolygonTemplate[]
}

export type SourceSelectionState = {
  assetId: string
  selected: boolean
  prompt: string | null
  areaPoints: AreaPoint[]
  areaConfirmed: boolean
}

export type ModifyPageViewModel = {
  applyPromptToAll: boolean
  applyMaskToAll: boolean
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  errorMessage: string | null
  fieldValues: Record<string, string>
  isModificationActive: boolean
  isModificationModalOpen: boolean
  isReviewOpen: boolean
  logs: string[]
  modificationMode: ModificationMode
  negativePromptValue: string
  priorityFields: Array<{ key: string; label: string; type: string; value: string; options?: string[] }>
  reviewPendingCount: number
  samPromptValue: string
  selectedSourceCount: number
  secondaryFields: Array<{ key: string; label: string; type: string; value: string; options?: string[] }>
  source: ModificationSourceAsset | null
  sourceIndex: number
  sourceItems: ModificationSourceAsset[]
  totalTargetCount: number
}
