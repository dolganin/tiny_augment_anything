export type UploadPersistencePhase = 'uploading' | 'importing'

export type PersistedUploadSession = {
  id: 'active'
  phase: UploadPersistencePhase
  file: File | null
  fileName: string
  fileSize: number
  fileLastModified: number
  uploadId: string | null
  chunkSize: number | null
  totalParts: number | null
  nextPart: number
  sessionId: string | null
  datasetId: string | null
  datasetName: string | null
  jobId: string | null
  updatedAt: number
}

const DB_NAME = 'tiny-augment-anything-runtime'
const STORE_NAME = 'upload-sessions'
const ACTIVE_UPLOAD_ID = 'active'

export function createUploadSession(file: File): PersistedUploadSession {
  return {
    id: ACTIVE_UPLOAD_ID,
    phase: 'uploading',
    file,
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified,
    uploadId: null,
    chunkSize: null,
    totalParts: null,
    nextPart: 0,
    sessionId: null,
    datasetId: null,
    datasetName: null,
    jobId: null,
    updatedAt: Date.now(),
  }
}

export async function loadActiveUploadSession(): Promise<PersistedUploadSession | null> {
  const database = await openUploadDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(ACTIVE_UPLOAD_ID)
    request.onsuccess = () => {
      const result = request.result
      resolve(isPersistedUploadSession(result) ? result : null)
    }
    request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать upload session'))
  })
}

export async function saveActiveUploadSession(session: PersistedUploadSession): Promise<void> {
  const database = await openUploadDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put({ ...session, updatedAt: Date.now() })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Не удалось сохранить upload session'))
  })
}

export async function clearActiveUploadSession(): Promise<void> {
  const database = await openUploadDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(ACTIVE_UPLOAD_ID)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Не удалось удалить upload session'))
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

function isPersistedUploadSession(value: unknown): value is PersistedUploadSession {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    candidate.id === ACTIVE_UPLOAD_ID &&
    (candidate.phase === 'uploading' || candidate.phase === 'importing') &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.fileSize === 'number'
  )
}
