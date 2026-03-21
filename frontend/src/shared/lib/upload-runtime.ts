import axios from 'axios'
import { DatasetUploadResponse } from '@/shared/api/contracts'
import { workflowApi } from '@/shared/api/workflow.api'
import { logger } from '@/shared/lib/logger'
import { PersistedUploadSession, saveActiveUploadSession } from '@/shared/lib/upload-session-storage'

type RunResumableUploadArgs = {
  session: PersistedUploadSession
  signal: AbortSignal
  onProgress: (progress: number) => void
}

type RunResumableUploadResult = {
  response: DatasetUploadResponse
  session: PersistedUploadSession
}

export async function runResumableUpload(args: RunResumableUploadArgs): Promise<RunResumableUploadResult> {
  const { signal, onProgress } = args
  const file = args.session.file
  if (!file) {
    throw new Error('Файл для возобновления загрузки не найден.')
  }
  let session = args.session
  logger.info('upload.resume.begin', {
    fileName: session.fileName,
    uploadId: session.uploadId,
    nextPart: session.nextPart,
  })
  if (!session.uploadId) {
    const initialized = await workflowApi.initUpload(file.name, file.size, signal)
    session = {
      ...session,
      uploadId: initialized.uploadId,
      chunkSize: initialized.chunkSize,
      totalParts: initialized.totalParts,
      nextPart: 0,
    }
    await saveActiveUploadSession(session)
    logger.info('upload.resume.initialized', {
      fileName: file.name,
      uploadId: session.uploadId,
      totalParts: session.totalParts,
      chunkSize: session.chunkSize,
    })
  }
  const uploadStatus = await resolveUploadStatus(session)
  session = {
    ...session,
    uploadId: uploadStatus.uploadId,
    chunkSize: uploadStatus.chunkSize,
    totalParts: uploadStatus.totalParts,
    nextPart: uploadStatus.nextPart,
  }
  await saveActiveUploadSession(session)
  logger.info('upload.resume.status', {
    uploadId: uploadStatus.uploadId,
    nextPart: uploadStatus.nextPart,
    totalParts: uploadStatus.totalParts,
    progress: uploadStatus.progress,
  })
  onProgress(Math.round(uploadStatus.progress * 100))
  for (let partNumber = uploadStatus.nextPart; partNumber < uploadStatus.totalParts; partNumber += 1) {
    throwIfAborted(signal)
    const chunkSize = uploadStatus.chunkSize
    const start = partNumber * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    const chunk = file.slice(start, end)
    await workflowApi.uploadChunk(
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
    if (partNumber === 0 || partNumber + 1 === uploadStatus.totalParts || (partNumber + 1) % 10 === 0) {
      logger.info('upload.resume.chunk-complete', {
        uploadId: uploadStatus.uploadId,
        partNumber,
        totalParts: uploadStatus.totalParts,
      })
    }
    session = {
      ...session,
      nextPart: partNumber + 1,
    }
    await saveActiveUploadSession(session)
    onProgress(Math.min(100, Math.round((end / file.size) * 100)))
  }
  throwIfAborted(signal)
  logger.info('upload.resume.complete-request', {
    uploadId: uploadStatus.uploadId,
    totalParts: uploadStatus.totalParts,
  })
  const response = await workflowApi.completeUpload(uploadStatus.uploadId, signal)
  const importingSession: PersistedUploadSession = {
    ...session,
    phase: 'importing',
    file: null,
    nextPart: uploadStatus.totalParts,
    sessionId: response.sessionId,
    datasetId: response.datasetId,
    datasetName: response.datasetName ?? session.fileName.replace(/\.zip$/i, ''),
    jobId: response.jobId,
  }
  await saveActiveUploadSession(importingSession)
  logger.info('upload.resume.importing', {
    uploadId: uploadStatus.uploadId,
    sessionId: response.sessionId,
    datasetId: response.datasetId,
    jobId: response.jobId,
  })
  return { response, session: importingSession }
}

export function isUploadAbortError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.code === 'ERR_CANCELED'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Upload aborted', 'AbortError')
  }
}

async function resolveUploadStatus(session: PersistedUploadSession) {
  if (!session.uploadId) {
    throw new Error('Отсутствует uploadId для возобновления.')
  }
  try {
    return await workflowApi.getUploadStatus(session.uploadId)
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      const file = session.file
      if (!file) {
        throw error
      }
      const initialized = await workflowApi.initUpload(file.name, file.size)
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
