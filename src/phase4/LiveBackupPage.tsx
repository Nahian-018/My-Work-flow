import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Archive, Download, FileCheck2, FileUp, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useLiveTasks } from '../phase3/LiveTaskProvider'
import { useLiveNotifications } from '../phase3/LiveNotificationProvider'
import { newOperationId } from '../lib/task-service'
import { createWorkspaceBackup, downloadWorkspaceBackup, MAX_WORKSPACE_BACKUP_BYTES, validateWorkspaceBackup } from '../lib/workspace-backup'
import type { BackupValidation } from '../lib/workspace-backup'
import { useWorkspaceCollaboration } from './WorkspaceCollaborationProvider'

interface RestoreResult { work_lists?: number; task_templates?: number; task_instances?: number; workspace_notes?: number; history_archive?: number; preferences?: number }

export function LiveBackupPage() {
  const { client, user, membership } = useAuth()
  const { refresh: refreshTasks } = useLiveTasks()
  const { reloadPreferences } = useLiveNotifications()
  const { refreshNotes, refreshChat } = useWorkspaceCollaboration()
  const fileInput = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [validation, setValidation] = useState<BackupValidation | null>(null)
  const [restoreOperationId, setRestoreOperationId] = useState('')
  const [result, setResult] = useState<RestoreResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const exportBackup = async () => {
    if (!user || !membership || !navigator.onLine) { setError('Backup export করতে authenticated internet connection দরকার।'); return }
    setExporting(true)
    setError('')
    setResult(null)
    try {
      const backup = await createWorkspaceBackup(client, user.id, membership.workspace_id)
      downloadWorkspaceBackup(backup)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Backup export হয়নি।')
    } finally { setExporting(false) }
  }

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || !user || !membership) return
    setValidation(null)
    setResult(null)
    setRestoreOperationId('')
    setError('')
    if (!file.name.toLowerCase().endsWith('.json') || file.size > MAX_WORKSPACE_BACKUP_BYTES) {
      setError('শুধু সর্বোচ্চ ১০ MiB-এর JSON Backup নির্বাচন করুন।')
      return
    }
    try {
      const parsed: unknown = JSON.parse(await file.text())
      setValidation(validateWorkspaceBackup(parsed, membership.workspace_id, user.id, file.size))
      setRestoreOperationId(newOperationId())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'File JSON পড়া যায়নি।')
    }
  }

  const restore = async () => {
    if (!validation || !restoreOperationId || !navigator.onLine) return
    const confirmation = window.confirm(
      'এই Backup merge করে restore করবেন? একই ID-র existing task/template/note overwrite হবে না; notification settings আপনার বর্তমান account-এ update হতে পারে। Soft-deleted task import হবে না, history আলাদা imported archive হিসেবে থাকবে।'
    )
    if (!confirmation) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const { data, error: restoreError } = await client.rpc('restore_workspace_backup', {
        p_backup: validation.backup,
        p_operation_id: restoreOperationId,
      })
      if (restoreError) throw new Error(restoreError.message)
      const returned = Array.isArray(data) ? data[0] : data
      setResult((returned ?? {}) as RestoreResult)
      await Promise.all([refreshTasks(), refreshNotes(), refreshChat(), reloadPreferences()])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Restore ব্যর্থ হয়েছে। একই file/operation দিয়ে আবার চেষ্টা করুন।')
    } finally { setBusy(false) }
  }

  return <section className="live-page phase4-page live-backup-page">
    <div className="live-page-heading"><div><p className="live-eyebrow">OWNER-CONTROLLED FILE · LOCAL EXPORT</p><h1>Backup ও Restore</h1><p className="live-subtitle">Cloud backup নয় · file আপনার device-এ ডাউনলোড হবে</p></div></div>
    <div className="live-info-card phase4-info-card"><ShieldCheck size={18} /><p><strong>Private data server-side RLS দিয়ে সীমাবদ্ধ</strong><span>Export query-তে দুই সদস্যের shared workspace data, বর্তমান user-এর নিজের private note ও নিজের notification settings অন্তর্ভুক্ত। Chat content export করা হয় না; অন্য user-এর private note export/restore হয় না।</span></p></div>
    {error && <div className="live-banner live-banner-error" role="alert">{error}</div>}

    <div className="phase4-backup-grid">
      <article className="live-settings-card phase4-backup-card"><span className="phase4-backup-icon"><Archive size={21} /></span><h2>JSON Backup Export</h2><p>Task, daily template, work list, RLS-visible notes, আপনার notification preferences এবং উপযুক্ত task/activity history-র versioned snapshot।</p><ul><li>UTF-8 JSON · schema version 1</li><li>Private note server RLS-এ আগে সীমিত হয়</li><li>এই page chat message export করে না</li><li>Downloaded file আলাদা নিরাপদ স্থানে রাখুন</li></ul><button className="live-button live-button-primary" onClick={() => void exportBackup()} disabled={exporting || !navigator.onLine}>{exporting ? <span className="live-spinner small-spinner" /> : <Download size={16} />}{exporting ? 'Export হচ্ছে…' : 'Backup ডাউনলোড'}</button></article>

      <article className="live-settings-card phase4-backup-card"><span className="phase4-backup-icon"><FileUp size={21} /></span><h2>Validated Restore</h2><p>Restore একই workspace-এ merge করে। Existing ID overwrite হয় না; restore operation retry-safe। ১০ MiB/file ও row-count limits প্রযোজ্য।</p><input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void chooseFile(event)} />
        <button className="live-button live-button-secondary" onClick={() => fileInput.current?.click()} disabled={busy || !navigator.onLine}><FileCheck2 size={16} />JSON Backup নির্বাচন</button>
        {validation && <div className="phase4-backup-preview" role="status"><strong>Restore preview · schema {validation.backup.schema_version}</strong><span>{validation.backup.task_instances.length} task · {validation.backup.task_templates.length} template · {validation.backup.workspace_notes.length} অনুমোদিত note · {validation.backup.activity_events.length + validation.backup.task_time_events.length + validation.backup.history_archive.length} history row</span>{validation.excludedForeignPrivateNotes > 0 && <small>{validation.excludedForeignPrivateNotes}টি অন্য user-এর private note restore থেকে বাদ দেওয়া হয়েছে।</small>}<small>History archive কেবল imported snapshot; authoritative audit record নয়।</small><button className="live-button live-button-primary" onClick={() => void restore()} disabled={busy}>{busy ? <span className="live-spinner small-spinner" /> : <RefreshCw size={15} />}{busy ? 'Restore হচ্ছে…' : 'Confirmation দিয়ে Restore'}</button></div>}
      </article>
    </div>

    {result && <div className="phase4-restore-result" role="status"><strong>Restore RPC সফল হয়েছে</strong><span>{Number(result.task_instances ?? 0)} task · {Number(result.task_templates ?? 0)} template · {Number(result.workspace_notes ?? 0)} note · {Number(result.history_archive ?? 0)} history archive · {Number(result.preferences ?? 0)} settings item</span><small>এটি শুধু RPC result; hosted backup/restore আলাদাভাবে বাস্তব project-এ test না করা পর্যন্ত production restore PASS নয়।</small></div>}
    <p className="phase4-storage-hint"><LockKeyhole size={14} />Export file cloud storage নয়। Browser data বা download file হারালে backup হারাতে পারেন; restore-এর আগে আলাদা copy রাখুন। Restore-এ hard delete নেই; soft-deleted task ও private note অন্য user-এর data থেকে restore করা হয় না।</p>
  </section>
}
