import { Route, Routes } from 'react-router-dom'
import { ClassifierTrainPage } from '@/pages/classifier-train/ClassifierTrainPage'
import { DatasetStatsPage } from '@/pages/dataset-stats/DatasetStatsPage'
import { FineTunePage } from '@/pages/fine-tune/FineTunePage'
import { GeneratePage } from '@/pages/generate/GeneratePage'
import { HomePage } from '@/pages/home/HomePage'
import { MetricsPage } from '@/pages/metrics/MetricsPage'
import { ModeSelectPage } from '@/pages/mode-select/ModeSelectPage'
import { ModifyPage } from '@/pages/modify/ModifyPage'
import { ReviewPage } from '@/pages/review/ReviewPage'
import { UploadPage } from '@/pages/upload/UploadPage'
import { ProtectedRoute } from '@/app/router/ProtectedRoute'
import { NotFoundPage } from '@/shared/ui/layouts/NotFoundPage'
import { useSessionStore } from '@/store/session/session.store'

export function AppRouter() {
  const datasetId = useSessionStore((state) => state.datasetId)
  const selectedClasses = useSessionStore((state) => state.selectedClasses)
  const mode = useSessionStore((state) => state.currentMode)
  const fineTuneResolved = useSessionStore((state) => state.fineTuneResolved)
  const classifierJobId = useSessionStore((state) => state.classifierJobId)
  const metrics = useSessionStore((state) => state.metrics)
  const workflowStage = useSessionStore((state) => state.workflowStage)

  const hasDataset = Boolean(datasetId)
  const hasSelectedClasses = selectedClasses.length > 0
  const canOpenMode = hasSelectedClasses && fineTuneResolved
  const canGenerate = canOpenMode && mode === 'generate'
  const canModify = canOpenMode && mode === 'modify'
  const canReview = canGenerate || canModify
  const canTrainClassifier =
    Boolean(classifierJobId) ||
    Boolean(metrics) ||
    workflowStage === 'classifier-train' ||
    workflowStage === 'metrics'
  const canShowMetrics = Boolean(metrics) || workflowStage === 'metrics'

  return (
    <Routes>
      <Route element={<ProtectedRoute canAccess={true} redirectTo="/datasets" />}>
        <Route index element={<HomePage />} />
        <Route path="/datasets" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
      </Route>

      <Route element={<ProtectedRoute canAccess={hasDataset} redirectTo="/datasets" />}>
        <Route path="/dataset/stats" element={<DatasetStatsPage />} />
      </Route>

      <Route
        element={<ProtectedRoute canAccess={hasSelectedClasses} redirectTo="/dataset/stats" />}
      >
        <Route path="/diffusion/fine-tune" element={<FineTunePage />} />
      </Route>

      <Route element={<ProtectedRoute canAccess={canOpenMode} redirectTo="/diffusion/fine-tune" />}>
        <Route path="/mode" element={<ModeSelectPage />} />
      </Route>

      <Route element={<ProtectedRoute canAccess={canGenerate} redirectTo="/mode" />}>
        <Route path="/generate" element={<GeneratePage />} />
      </Route>

      <Route element={<ProtectedRoute canAccess={canModify} redirectTo="/mode" />}>
        <Route path="/modify" element={<ModifyPage />} />
      </Route>

      <Route element={<ProtectedRoute canAccess={canReview} redirectTo="/mode" />}>
        <Route path="/review" element={<ReviewPage />} />
      </Route>

      <Route element={<ProtectedRoute canAccess={canTrainClassifier} redirectTo="/dataset/stats" />}>
        <Route path="/classifier/train" element={<ClassifierTrainPage />} />
      </Route>

      <Route
        element={<ProtectedRoute canAccess={canShowMetrics} redirectTo="/classifier/train" />}
      >
        <Route path="/metrics" element={<MetricsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
