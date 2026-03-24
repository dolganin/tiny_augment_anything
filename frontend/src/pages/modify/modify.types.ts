import { ModificationSourceAsset } from '@/shared/types/workflow'
import { ModificationMode } from '@/features/modification/ModificationModeToggle'

export type ModifyFormValues = {
  prompt: string
}

export type AreaPoint = [number, number]

export type ModifyPageViewModel = {
  applyPromptToAll: boolean
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
  secondaryFields: Array<{ key: string; label: string; type: string; value: string; options?: string[] }>
  source: ModificationSourceAsset | null
  sourceIndex: number
  sourceItems: ModificationSourceAsset[]
  totalTargetCount: number
}
