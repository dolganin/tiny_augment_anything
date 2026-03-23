export type ClassifierWeightsUploadPhase = 'uploading' | 'uploaded'

export type PersistedClassifierWeightsUploadSession = {
  id: string
  phase: ClassifierWeightsUploadPhase
  file: File | null
  fileName: string
  fileSize: number
  fileLastModified: number
  uploadId: string | null
  chunkSize: number | null
  totalParts: number | null
  nextPart: number
  weightsPath: string | null
  updatedAt: number
}

const DB_NAME = 'tiny-augment-anything-runtime'
const STORE_NAME = 'upload-sessions'

export function classifierWeightsUploadStorageId(sessionId: string): string {
  return `classifier-weights:${sessionId}`
}

export function createClassifierWeightsUploadSession(
  sessionId: string,
  file: File,
): PersistedClassifierWeightsUploadSession {
  return {
    id: classifierWeightsUploadStorageId(sessionId),
    phase: 'uploading',
    file,
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified,
    uploadId: null,
    chunkSize: null,
    totalParts: null,
    nextPart: 0,
    weightsPath: null,
    updatedAt: Date.now(),
  }
}

export async function loadClassifierWeightsUploadSession(
  sessionId: string,
): Promise<PersistedClassifierWeightsUploadSession | null> {
  const database = await openUploadDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(classifierWeightsUploadStorageId(sessionId))
    request.onsuccess = () => {
      const result = request.result
      resolve(isPersistedClassifierWeightsUploadSession(result) ? result : null)
    }
    request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать classifier weights upload session'))
  })
}

export async function saveClassifierWeightsUploadSession(
  session: PersistedClassifierWeightsUploadSession,
): Promise<void> {
  const database = await openUploadDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put({ ...session, updatedAt: Date.now() })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Не удалось сохранить classifier weights upload session'))
  })
}

export async function clearClassifierWeightsUploadSession(sessionId: string): Promise<void> {
  const database = await openUploadDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(classifierWeightsUploadStorageId(sessionId))
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Не удалось удалить classifier weights upload session'))
  })
}

let databasePromise: Promise<IDBDatabase> | null = null

function openUploadDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'))
  })
  return databasePromise
}

function isPersistedClassifierWeightsUploadSession(
  value: unknown,
): value is PersistedClassifierWeightsUploadSession {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.startsWith('classifier-weights:') &&
    (candidate.phase === 'uploading' || candidate.phase === 'uploaded') &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileSize === 'number'
  )
}
