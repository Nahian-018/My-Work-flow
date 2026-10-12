import type { DemoList, DemoNote, DemoTask } from '../demo-data'

export interface DemoExport {
  type: 'SMARTFLOW_DEMO_EXPORT'
  tasks: DemoTask[]
  lists: DemoList[]
  notes: DemoNote[]
}

export function isDemoExport(value: unknown): value is DemoExport {
  if (!isRecord(value) || value.type !== 'SMARTFLOW_DEMO_EXPORT') return false
  if (!Array.isArray(value.tasks) || !Array.isArray(value.lists) || !Array.isArray(value.notes)) return false
  return value.tasks.every(isDemoTask) && value.lists.every(isDemoList) && value.notes.every(isDemoNote)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLocalizedText(value: unknown): value is { bn: string; en: string } {
  return isRecord(value) && typeof value.bn === 'string' && typeof value.en === 'string'
}

function isDemoTask(value: unknown): value is DemoTask {
  if (!isRecord(value)) return false
  const validStatus = ['completed', 'in-progress', 'pending', 'overdue'].includes(String(value.status))
  const validPriority = ['high', 'medium', 'low'].includes(String(value.priority))
  const validAssignee = value.assignee === 'Admin' || value.assignee === 'Member'
  const time = typeof value.startTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.startTime)
  const duration = Number.isInteger(value.durationMinutes) && Number(value.durationMinutes) >= 1 && Number(value.durationMinutes) <= 1440
  return typeof value.id === 'string' && typeof value.listId === 'string' && isLocalizedText(value.title) && validStatus && validPriority && validAssignee && time && duration
    && (value.actualMinutes === undefined || (Number.isInteger(value.actualMinutes) && Number(value.actualMinutes) >= 0))
    && (value.countdown === undefined || typeof value.countdown === 'string')
}

function isDemoList(value: unknown): value is DemoList {
  if (!isRecord(value)) return false
  const category = ['work', 'personal', 'project'].includes(String(value.category))
  const accent = ['teal', 'amber', 'blue'].includes(String(value.accent))
  return typeof value.id === 'string' && isLocalizedText(value.name) && category && accent
    && (value.archived === undefined || typeof value.archived === 'boolean')
}

function isDemoNote(value: unknown): value is DemoNote {
  return isRecord(value) && typeof value.id === 'string' && isLocalizedText(value.title) && isLocalizedText(value.body)
    && isLocalizedText(value.category) && isLocalizedText(value.updatedAt) && typeof value.pinned === 'boolean'
}

export function downloadDemoCsv(tasks: DemoTask[], lists: DemoList[], language: 'bn' | 'en') {
  const header = language === 'bn' ? ['কাজের নাম', 'তালিকা', 'অগ্রাধিকার', 'অবস্থা', 'শুরু', 'সময়কাল (মিনিট)'] : ['Task', 'Work list', 'Priority', 'Status', 'Start', 'Duration (minutes)']
  const rows = tasks.map((task) => {
    const list = lists.find((item) => item.id === task.listId)
    return [task.title[language], list?.name[language] ?? '', task.priority, task.status, task.startTime, task.durationMinutes]
  })
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  triggerDownload(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }), 'smartflow-demo-report.csv')
}

export function downloadDemoJson(data: { tasks: DemoTask[]; lists: DemoList[]; notes: DemoNote[] }) {
  const blob = new Blob([JSON.stringify({ type: 'SMARTFLOW_DEMO_EXPORT', exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' })
  triggerDownload(blob, 'smartflow-demo-export.json')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
