import { ChangeEvent, RefObject, useEffect, useRef, useState } from 'react'
import { workflowApi } from '@/shared/api/workflow.api'
import {
  clearClassifierWeightsUploadSession,
  createClassifierWeightsUploadSession,
  loadClassifierWeightsUploadSession,
  saveClassifierWeightsUploadSession,
  type PersistedClassifierWeightsUploadSession,
} from '@/shared/lib/classifier-weights-upload-storage'
import {
  isClassifierWeightsAbortError,
  runClassifierWeightsUpload,
} from '@/shared/lib/classifier-weights-upload-runtime'
import { getErrorMessage } from '@/shared/lib/get-error-message'

type UseClassifierWeightsUploadParams = {
  fileInputRef: RefObject<HTMLInputElement | null>
  isBusy: boolean
  onError: (message: string) => void
  sessionId: string | null
}

export function useClassifierWeightsUpload({
  fileInputRef,
  isBusy,
  onError,
  sessionId,
}: UseClassifierWeightsUploadParams) {
  const [weightsUploadSession, setWeightsUploadSession] = useState<PersistedClassifierWeightsUploadSession | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploadingWeights, setIsUploadingWeights] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const uploadAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setWeightsUploadSession(null)
      setUploadProgress(0)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const storedSession = await loadClassifierWeightsUploadSession(sessionId)
        if (cancelled || !storedSession) {
          return
        }
        setWeightsUploadSession(storedSession)
        setUploadProgress(storedSession.phase === 'uploaded' ? 100 : 0)
        if (storedSession.phase === 'uploading' && storedSession.file) {
          await resumeWeightsUpload(storedSession)
        }
      } catch (error) {
        if (!cancelled) {
          onError(getErrorMessage(error))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  useEffect(() => {
    const handleWakeup = () => {
      if (document.hidden) {
        return
      }
      if (!sessionId || isUploadingWeights || weightsUploadSession?.phase !== 'uploading' || !weightsUploadSession.file) {
        return
      }
      void resumeWeightsUpload(weightsUploadSession)
    }
    document.addEventListener('visibilitychange', handleWakeup)
    window.addEventListener('focus', handleWakeup)
    window.addEventListener('online', handleWakeup)
    return () => {
      document.removeEventListener('visibilitychange', handleWakeup)
      window.removeEventListener('focus', handleWakeup)
      window.removeEventListener('online', handleWakeup)
    }
  }, [isUploadingWeights, sessionId, weightsUploadSession])

  const resumeWeightsUpload = async (session: PersistedClassifierWeightsUploadSession) => {
    if (!sessionId) {
      onError('Сессия потеряна. Сначала восстанови проект, потом выбери веса заново.')
      return
    }
    try {
      const controller = new AbortController()
      uploadAbortRef.current = controller
      setIsUploadingWeights(true)
      setIsCancelling(false)
      const result = await runClassifierWeightsUpload({
        sessionId,
        session,
        signal: controller.signal,
        onProgress: setUploadProgress,
      })
      setWeightsUploadSession(result.session)
      setUploadProgress(100)
    } catch (error) {
      if (isClassifierWeightsAbortError(error)) {
        return
      }
      onError(getErrorMessage(error))
    } finally {
      uploadAbortRef.current = null
      setIsUploadingWeights(false)
      setIsCancelling(false)
    }
  }

  const clearWeightsSelection = async () => {
    if (!sessionId) {
      setWeightsUploadSession(null)
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }
    const currentUploadId = weightsUploadSession?.uploadId ?? null
    if (currentUploadId) {
      try {
        await workflowApi.cancelClassifierWeightsUpload(sessionId, currentUploadId)
      } catch {}
    }
    await clearClassifierWeightsUploadSession(sessionId)
    setWeightsUploadSession(null)
    setUploadProgress(0)
    setIsCancelling(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const startWeightsUpload = async (file: File) => {
    if (!sessionId) {
      onError('Сессия потеряна. Сначала выбери датасет заново.')
      return
    }
    await clearWeightsSelection()
    const nextSession = createClassifierWeightsUploadSession(sessionId, file)
    setWeightsUploadSession(nextSession)
    setUploadProgress(0)
    await resumeWeightsUpload(nextSession)
  }

  const handleWeightsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    if (!file) {
      return
    }
    void startWeightsUpload(file)
  }

  const openWeightsDialog = () => {
    if (isBusy || isUploadingWeights || isCancelling) {
      return
    }
    fileInputRef.current?.click()
  }

  const abortUpload = async () => {
    if (!sessionId) {
      return
    }
    setIsCancelling(true)
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    await clearWeightsSelection()
  }

  return {
    abortUpload,
    clearWeightsSelection,
    handleWeightsChange,
    isCancelling,
    isUploadingWeights,
    openWeightsDialog,
    saveUploadedWeightsSession: async (session: PersistedClassifierWeightsUploadSession) => {
      await saveClassifierWeightsUploadSession(session)
      setWeightsUploadSession(session)
      setUploadProgress(100)
    },
    uploadProgress,
    weightsUploadSession,
  }
}
