import type { LiveTask, LiveTaskStatus } from './task-service'

const DATABASE_NAME = 'smartflow-duo-phase3'
const DATABASE_VERSION = 4
const TASK_STORE = 'taskSnapshots'
const OPERATION_STORE = 'pendingTaskStatus'
const NOTIFICATION_STORE = 'notificationReceipts'
const MEMBERSHIP_STORE = 'verifiedMemberships'
const WORKSPACE_RECORD_STORE = 'workspaceRecords'
const WORKSPACE_OPERATION_STORE = 'pendingWorkspaceOperations'

export interface PendingTaskStatus {
  operationId: string
  userId: string
  taskId: string
  targetStatus: 'pending' | 'in_progress' | 'completed'
  expectedVersion: number
  createdAt: number
  state: 'pending' | 'conflict'
  error?: string
}

export interface CachedWorkspaceMembership {
  userId: string
  workspaceId: string
  memberRole: 'admin' | 'member'
  displayName: string
  avatarUrl: string | null
  verifiedAt: number
}

export type WorkspaceRecordCollection = 'chat' | 'notes'
export type WorkspaceEntityType = 'chat_message' | 'chat_read_receipt' | 'workspace_note'
export type WorkspaceOperationAction = 'send_chat_message' | 'mark_chat_read' | 'upsert_workspace_note' | 'delete_workspace_note'

export interface PendingWorkspaceOperation {
  operationId: string
  userId: string
  workspaceId: string
  entityType: WorkspaceEntityType
  action: WorkspaceOperationAction
  recordId: string
  expectedVersion: number | null
  payload: Record<string, unknown>
  createdAt: number
  state: 'pending' | 'conflict'
  error?: string
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('এই browser-এ IndexedDB পাওয়া যায়নি।'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(TASK_STORE)) {
        const tasks = database.createObjectStore(TASK_STORE, { keyPath: ['userId', 'taskId'] })
        tasks.createIndex('byUser', 'userId', { unique: false })
      }
      if (!database.objectStoreNames.contains(OPERATION_STORE)) {
        const operations = database.createObjectStore(OPERATION_STORE, { keyPath: 'operationId' })
        operations.createIndex('byUserCreated', ['userId', 'createdAt'], { unique: false })
        operations.createIndex('byUser', 'userId', { unique: false })
        operations.createIndex('byUserTask', ['userId', 'taskId'], { unique: false })
      }
      if (!database.objectStoreNames.contains(NOTIFICATION_STORE)) {
        const notifications = database.createObjectStore(NOTIFICATION_STORE, { keyPath: ['userId', 'notificationKey'] })
        notifications.createIndex('byUser', 'userId', { unique: false })
      }
      if (!database.objectStoreNames.contains(MEMBERSHIP_STORE)) {
        database.createObjectStore(MEMBERSHIP_STORE, { keyPath: 'userId' })
      }
      if (!database.objectStoreNames.contains(WORKSPACE_RECORD_STORE)) {
        const records = database.createObjectStore(WORKSPACE_RECORD_STORE, { keyPath: ['userId', 'collection', 'recordId'] })
        records.createIndex('byUserCollection', ['userId', 'collection'], { unique: false })
        records.createIndex('byUser', 'userId', { unique: false })
      }
      if (!database.objectStoreNames.contains(WORKSPACE_OPERATION_STORE)) {
        const operations = database.createObjectStore(WORKSPACE_OPERATION_STORE, { keyPath: 'operationId' })
        operations.createIndex('byUserCreated', ['userId', 'createdAt'], { unique: false })
        operations.createIndex('byUser', 'userId', { unique: false })
        operations.createIndex('byUserEntityRecord', ['userId', 'entityType', 'recordId'], { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB খোলা যায়নি।'))
    request.onblocked = () => reject(new Error('অন্য tab-এ IndexedDB update আটকে আছে; tab reload করুন।'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request ব্যর্থ হয়েছে।'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction ব্যর্থ হয়েছে।'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction বাতিল হয়েছে।'))
  })
}

export async function readCachedTasks(userId: string): Promise<LiveTask[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(TASK_STORE, 'readonly')
    const rows = await requestResult<Array<{ userId: string; taskId: string; task: LiveTask }>>(
      transaction.objectStore(TASK_STORE).index('byUser').getAll(userId),
    )
    return rows.map((row) => row.task)
  } finally {
    database.close()
  }
}

export async function cacheVerifiedMembership(
  membership: Omit<CachedWorkspaceMembership, 'verifiedAt'>,
): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(MEMBERSHIP_STORE, 'readwrite')
    transaction.objectStore(MEMBERSHIP_STORE).put({ ...membership, verifiedAt: Date.now() })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function readVerifiedMembership(userId: string): Promise<CachedWorkspaceMembership | null> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(MEMBERSHIP_STORE, 'readonly')
    return await requestResult<CachedWorkspaceMembership | undefined>(transaction.objectStore(MEMBERSHIP_STORE).get(userId)) ?? null
  } finally {
    database.close()
  }
}

export async function removeVerifiedMembership(userId: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(MEMBERSHIP_STORE, 'readwrite')
    transaction.objectStore(MEMBERSHIP_STORE).delete(userId)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function cacheTasks(userId: string, tasks: LiveTask[]): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(TASK_STORE, 'readwrite')
    const store = transaction.objectStore(TASK_STORE)
    const previous = await requestResult<Array<{ userId: string; taskId: string }>>(store.index('byUser').getAll(userId))
    previous.forEach((row) => store.delete([userId, row.taskId]))
    tasks.forEach((task) => store.put({ userId, taskId: task.id, task }))
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function cacheWorkspaceRecords<T extends { id: string }>(
  userId: string,
  collection: WorkspaceRecordCollection,
  records: T[],
): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKSPACE_RECORD_STORE, 'readwrite')
    const store = transaction.objectStore(WORKSPACE_RECORD_STORE)
    const previous = await requestResult<Array<{ userId: string; collection: WorkspaceRecordCollection; recordId: string }>>(
      store.index('byUserCollection').getAll([userId, collection]),
    )
    previous.forEach((row) => store.delete([userId, collection, row.recordId]))
    records.forEach((record) => store.put({ userId, collection, recordId: record.id, record }))
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function readCachedWorkspaceRecords<T extends { id: string }>(
  userId: string,
  collection: WorkspaceRecordCollection,
): Promise<T[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKSPACE_RECORD_STORE, 'readonly')
    const rows = await requestResult<Array<{ record: T }>>(
      transaction.objectStore(WORKSPACE_RECORD_STORE).index('byUserCollection').getAll([userId, collection]),
    )
    return rows.map((row) => row.record)
  } finally {
    database.close()
  }
}

export async function enqueueWorkspaceOperation(
  operation: Omit<PendingWorkspaceOperation, 'createdAt' | 'state'>,
): Promise<PendingWorkspaceOperation | null> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKSPACE_OPERATION_STORE, 'readwrite')
    const store = transaction.objectStore(WORKSPACE_OPERATION_STORE)
    const existing = await requestResult<PendingWorkspaceOperation[]>(
      store.index('byUserEntityRecord').getAll([operation.userId, operation.entityType, operation.recordId]),
    )
    const replaceable = operation.entityType === 'workspace_note'
      ? existing.find((entry) => entry.state === 'pending')
      : undefined

    if (replaceable && operation.action === 'delete_workspace_note'
        && replaceable.action === 'upsert_workspace_note' && replaceable.expectedVersion === null) {
      store.delete(replaceable.operationId)
      await transactionDone(transaction)
      return null
    }

    const queued: PendingWorkspaceOperation = {
      ...operation,
      operationId: replaceable?.operationId ?? operation.operationId,
      expectedVersion: replaceable ? replaceable.expectedVersion : operation.expectedVersion,
      createdAt: replaceable?.createdAt ?? Date.now(),
      state: 'pending',
    }
    if (replaceable) store.delete(replaceable.operationId)
    store.put(queued)
    await transactionDone(transaction)
    return queued
  } finally {
    database.close()
  }
}

export async function getPendingWorkspaceOperations(userId: string): Promise<PendingWorkspaceOperation[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKSPACE_OPERATION_STORE, 'readonly')
    const rows = await requestResult<PendingWorkspaceOperation[]>(
      transaction.objectStore(WORKSPACE_OPERATION_STORE).index('byUser').getAll(userId),
    )
    return rows.sort((left, right) => left.createdAt - right.createdAt)
  } finally {
    database.close()
  }
}

export async function markWorkspaceOperationConflict(operationId: string, message: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKSPACE_OPERATION_STORE, 'readwrite')
    const store = transaction.objectStore(WORKSPACE_OPERATION_STORE)
    const operation = await requestResult<PendingWorkspaceOperation | undefined>(store.get(operationId))
    if (operation) store.put({ ...operation, state: 'conflict', error: message })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function updateWorkspaceOperationVersion(operationId: string, expectedVersion: number): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKSPACE_OPERATION_STORE, 'readwrite')
    const store = transaction.objectStore(WORKSPACE_OPERATION_STORE)
    const operation = await requestResult<PendingWorkspaceOperation | undefined>(store.get(operationId))
    if (operation) store.put({ ...operation, expectedVersion, state: 'pending', error: undefined })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function removeWorkspaceOperation(operationId: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(WORKSPACE_OPERATION_STORE, 'readwrite')
    transaction.objectStore(WORKSPACE_OPERATION_STORE).delete(operationId)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function queueTaskStatus(
  operation: Omit<PendingTaskStatus, 'createdAt' | 'state'>,
): Promise<PendingTaskStatus> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(OPERATION_STORE, 'readwrite')
    const store = transaction.objectStore(OPERATION_STORE)
    const existing = await requestResult<PendingTaskStatus[]>(store.index('byUserTask').getAll([operation.userId, operation.taskId]))
    const replaceable = existing.find((entry) => entry.state === 'pending')
    const queued: PendingTaskStatus = {
      ...operation,
      operationId: replaceable?.operationId ?? operation.operationId,
      expectedVersion: replaceable?.expectedVersion ?? operation.expectedVersion,
      createdAt: replaceable?.createdAt ?? Date.now(),
      state: 'pending',
    }
    if (replaceable) store.delete(replaceable.operationId)
    store.put(queued)
    await transactionDone(transaction)
    return queued
  } finally {
    database.close()
  }
}

export async function getPendingTaskStatuses(userId: string): Promise<PendingTaskStatus[]> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(OPERATION_STORE, 'readonly')
    const rows = await requestResult<PendingTaskStatus[]>(transaction.objectStore(OPERATION_STORE).index('byUser').getAll(userId))
    return rows.sort((left, right) => left.createdAt - right.createdAt)
  } finally {
    database.close()
  }
}

export async function updateQueuedStatusVersion(operationId: string, expectedVersion: number): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(OPERATION_STORE, 'readwrite')
    const store = transaction.objectStore(OPERATION_STORE)
    const operation = await requestResult<PendingTaskStatus | undefined>(store.get(operationId))
    if (operation) store.put({ ...operation, expectedVersion, state: 'pending', error: undefined })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function markQueuedStatusConflict(operationId: string, message: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(OPERATION_STORE, 'readwrite')
    const store = transaction.objectStore(OPERATION_STORE)
    const operation = await requestResult<PendingTaskStatus | undefined>(store.get(operationId))
    if (operation) store.put({ ...operation, state: 'conflict', error: message })
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function removeQueuedStatus(operationId: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(OPERATION_STORE, 'readwrite')
    transaction.objectStore(OPERATION_STORE).delete(operationId)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function claimNotificationReceipt(userId: string, notificationKey: string): Promise<boolean> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(NOTIFICATION_STORE, 'readwrite')
    const store = transaction.objectStore(NOTIFICATION_STORE)
    const key: IDBValidKey = [userId, notificationKey]
    const existing = await requestResult(store.get(key))
    if (existing !== undefined) {
      await transactionDone(transaction)
      return false
    }
    store.put({ userId, notificationKey, claimedAt: Date.now() })
    await transactionDone(transaction)
    return true
  } finally {
    database.close()
  }
}

export async function releaseNotificationReceipt(userId: string, notificationKey: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(NOTIFICATION_STORE, 'readwrite')
    transaction.objectStore(NOTIFICATION_STORE).delete([userId, notificationKey])
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export async function clearUserTaskData(userId: string): Promise<void> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction([
      TASK_STORE, OPERATION_STORE, NOTIFICATION_STORE, MEMBERSHIP_STORE, WORKSPACE_RECORD_STORE, WORKSPACE_OPERATION_STORE,
    ], 'readwrite')
    const taskStore = transaction.objectStore(TASK_STORE)
    const operationStore = transaction.objectStore(OPERATION_STORE)
    const notificationStore = transaction.objectStore(NOTIFICATION_STORE)
    const membershipStore = transaction.objectStore(MEMBERSHIP_STORE)
    const workspaceRecordStore = transaction.objectStore(WORKSPACE_RECORD_STORE)
    const workspaceOperationStore = transaction.objectStore(WORKSPACE_OPERATION_STORE)
    const [tasks, operations, notifications, records, workspaceOperations] = await Promise.all([
      requestResult<Array<{ userId: string; taskId: string }>>(taskStore.index('byUser').getAll(userId)),
      requestResult<PendingTaskStatus[]>(operationStore.index('byUser').getAll(userId)),
      requestResult<Array<{ userId: string; notificationKey: string }>>(notificationStore.index('byUser').getAll(userId)),
      requestResult<Array<{ userId: string; collection: WorkspaceRecordCollection; recordId: string }>>(workspaceRecordStore.index('byUser').getAll(userId)),
      requestResult<PendingWorkspaceOperation[]>(workspaceOperationStore.index('byUser').getAll(userId)),
    ])
    tasks.forEach((row) => taskStore.delete([userId, row.taskId]))
    operations.forEach((operation) => operationStore.delete(operation.operationId))
    notifications.forEach((notification) => notificationStore.delete([userId, notification.notificationKey]))
    records.forEach((row) => workspaceRecordStore.delete([userId, row.collection, row.recordId]))
    workspaceOperations.forEach((operation) => workspaceOperationStore.delete(operation.operationId))
    membershipStore.delete(userId)
    await transactionDone(transaction)
  } finally {
    database.close()
  }
}

export function applyPendingStatus(task: LiveTask, target: LiveTaskStatus): LiveTask {
  return { ...task, status: target, effective_status: target, version: task.version }
}
