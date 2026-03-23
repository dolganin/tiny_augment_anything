import axios from 'axios'
import { workflowApi } from '@/shared/api/workflow.api'
import { logger } from '@/shared/lib/logger'
import {
  PersistedClassifierWeightsUploadSession,
  saveClassifierWeightsUploadSession,
} from '@/shared/lib/classifier-weights-upload-storage'

type RunClassifierWeightsUploadArgs = {
  sessionId: string
  session: PersistedClassifierWeightsUploadSession
  signal: AbortSignal
  onProgress: (progress: number) => void
}

type RunClassifierWeightsUploadResult = {
  session: PersistedClassifierWeightsUploadSession
  weightsPath: string
}

export async function runClassifierWeightsUpload(
  args: RunClassifierWeightsUploadArgs,
): Promise<RunClassifierWeightsUploadResult> {
  const { sessionId, signal, onProgress } = args
  const file = args.session.file
  if (!file) {
    throw new Error('Файл весов для возобновления загрузки не найден.')
  }
  let session = args.session
  logger.info('classifier-weights.upload.begin', {
    sessionId,
    fileName: session.fileName,
    uploadId: session.uploadId,
    nextPart: session.nextPart,
  })
  if (!session.uploadId) {
    const initialized = await workflowApi.initClassifierWeightsUpload(sessionId, file.name, file.size, signal)
    session = {
      ...session,
      uploadId: initialized.uploadId,
      chunkSize: initialized.chunkSize,
      totalParts: initialized.totalParts,
      nextPart: 0,
    }
    await saveClassifierWeightsUploadSession(session)
  }
  const uploadStatus = await resolveUploadStatus(sessionId, session)
  session = {
    ...session,
    uploadId: uploadStatus.uploadId,
    chunkSize: uploadStatus.chunkSize,
    totalParts: uploadStatus.totalParts,
    nextPart: uploadStatus.nextPart,
  }
  await saveClassifierWeightsUploadSession(session)
  onProgress(Math.round(uploadStatus.progress * 100))
  for (let partNumber = uploadStatus.nextPart; partNumber < uploadStatus.totalParts; partNumber += 1) {
    throwIfAborted(signal)
    const chunkSize = uploadStatus.chunkSize
    const start = partNumber * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const chunk = file.slice(start, end)
    await workflowApi.uploadClassifierWeightsChunk(
      sessionId,
      uploadStatus.uploadId,
      partNumber,
      uploadStatus.totalParts,
      chunk,
      signal,
      (chunkProgress) => {
        const uploadedBytes = start + Math.round(chunk.size * chunkProgress)
        const progress = file.size === 0 ? 100 : Math.min(100, Math.round((uploadedBytes / file.size) * 100))
        onProgress(progress)
      },
    )
    session = {
      ...session,
      nextPart: partNumber + 1,
    }
    await saveClassifierWeightsUploadSession(session)
    onProgress(Math.min(100, Math.round((end / file.size) * 100)))
  }
  throwIfAborted(signal)
  const response = await workflowApi.completeClassifierWeightsUpload(sessionId, uploadStatus.uploadId, signal)
  const uploadedSession: PersistedClassifierWeightsUploadSession = {
    ...session,
    phase: 'uploaded',
    file: null,
    nextPart: uploadStatus.totalParts,
    weightsPath: response.weightsPath,
  }
  await saveClassifierWeightsUploadSession(uploadedSession)
  logger.info('classifier-weights.upload.completed', {
    sessionId,
    uploadId: uploadStatus.uploadId,
    weightsPath: response.weightsPath,
  })
  return { session: uploadedSession, weightsPath: response.weightsPath }
}

export function isClassifierWeightsAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  return axios.isAxiosError(error) && error.code === 'ERR_CANCELED'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Upload aborted', 'AbortError')
  }
}

async function resolveUploadStatus(sessionId: string, session: PersistedClassifierWeightsUploadSession) {
  if (!session.uploadId) {
    throw new Error('Отсутствует uploadId для возобновления загрузки весов.')
  }
  try {
    return await workflowApi.getClassifierWeightsUploadStatus(sessionId, session.uploadId)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      const file = session.file
      if (!file) {
        throw error
      }
      const initialized = await workflowApi.initClassifierWeightsUpload(sessionId, file.name, file.size)
      return {
        uploadId: initialized.uploadId,
        fileName: file.name,
        fileSize: file.size,
        chunkSize: initialized.chunkSize,
        totalParts: initialized.totalParts,
        nextPart: 0,
        uploadedBytes: 0,
        progress: 0,
      }
    }
    throw error
  }
}
