import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  ClassTargets,
  DatasetClassStat,
  GenerationAsset,
  WorkflowMetrics,
  WorkflowMode,
  WorkflowStage,
} from '@/shared/types/workflow'
import { DatasetModificationTemplates, PromptTemplate } from '@/pages/modify/modify.types'

type SessionState = {
  hydrated: boolean
  sessionId: string | null
  datasetId: string | null
  datasetName: string | null
  datasetStats: DatasetClassStat[]
  selectedClasses: string[]
  selectedClassTargets: ClassTargets
  currentMode: WorkflowMode
  generationConfig: Record<string, string>
  promptTemplates: PromptTemplate[]
  modificationTemplatesByDataset: Record<string, DatasetModificationTemplates>
  generationJobId: string | null
  generationResults: GenerationAsset[]
  approvedItems: GenerationAsset[]
  rejectedItemIds: string[]
  classifierJobId: string | null
  classifierLogs: string[]
  metrics: WorkflowMetrics | null
  downloadUrl: string | null
  workflowStage: WorkflowStage
  markHydrated: () => void
  setSession: (payload: Partial<SessionSnapshot>) => void
  replaceSession: (payload: Partial<SessionSnapshot>) => void
  setStage: (stage: WorkflowStage) => void
  reset: () => void
}

type SessionSnapshot = Omit<SessionState, 'hydrated' | 'markHydrated' | 'setSession' | 'replaceSession' | 'setStage' | 'reset'>

const initialState: SessionSnapshot = {
  sessionId: null,
  datasetId: null,
  datasetName: null,
  datasetStats: [],
  selectedClasses: [],
  selectedClassTargets: {},
  currentMode: null,
  generationConfig: {},
  promptTemplates: [],
  modificationTemplatesByDataset: {},
  generationJobId: null,
  generationResults: [],
  approvedItems: [],
  rejectedItemIds: [],
  classifierJobId: null,
  classifierLogs: [],
  metrics: null,
  downloadUrl: null,
  workflowStage: 'upload',
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      hydrated: false,
      ...initialState,
      markHydrated: () => set({ hydrated: true }),
      setSession: (payload) => set((state) => ({ ...state, ...payload })),
      replaceSession: (payload) => set({ hydrated: true, ...initialState, ...payload }),
      setStage: (workflowStage) => set({ workflowStage }),
      reset: () => set({ hydrated: true, ...initialState }),
    }),
    {
      name: 'tiny-augment-anything-session',
      partialize: (state) => ({
        sessionId: state.sessionId,
        datasetId: state.datasetId,
        datasetName: state.datasetName,
        datasetStats: state.datasetStats,
        selectedClasses: state.selectedClasses,
        selectedClassTargets: state.selectedClassTargets,
        currentMode: state.currentMode,
        generationConfig: state.generationConfig,
        promptTemplates: state.promptTemplates,
        modificationTemplatesByDataset: state.modificationTemplatesByDataset,
        generationJobId: state.generationJobId,
        generationResults: state.generationResults,
        approvedItems: state.approvedItems,
        rejectedItemIds: state.rejectedItemIds,
        classifierJobId: state.classifierJobId,
        classifierLogs: state.classifierLogs,
        metrics: state.metrics,
        downloadUrl: state.downloadUrl,
        workflowStage: state.workflowStage,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated()
      },
    },
  ),
)
