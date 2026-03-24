import { ModificationSourceAsset } from '@/shared/types/workflow'

export type ModifyFormValues = {
  prompt: string
}

export type AreaPoint = [number, number]

export type ModifyPageViewModel = {
  areaConfirmed: boolean
  areaPoints: AreaPoint[]
  errorMessage: string | null
  fieldValues: Record<string, string>
  isModificationActive: boolean
  isReviewOpen: boolean
  logs: string[]
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
