// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OUTSIDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'
const PRIVATE_NOTE_ID = '11111111-1111-4111-8111-111111111111'
const SHARED_NOTE_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_NOTE_ID = '33333333-3333-4333-8333-333333333333'
const RESTORED_SHARED_NOTE_ID = '44444444-4444-4444-8444-444444444444'
const RESTORED_PRIVATE_NOTE_ID = '55555555-5555-4555-8555-555555555555'
const RESTORED_FOREIGN_NOTE_ID = '66666666-6666-4666-8666-666666666666'
const EXISTING_TASK_ID = '77777777-7777-4777-8777-777777777777'
const RESTORED_TASK_ID = '88888888-8888-4888-8888-888888888888'
const RESTORED_LIST_ID = '99999999-9999-4999-8999-999999999999'
const ARCHIVE_SOURCE_ID = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
const DASHBOARD_COMPLETED_ID = 'abc11111-1111-4111-8111-111111111111'
const DASHBOARD_OVERDUE_ID = 'abc22222-2222-4222-8222-222222222222'
const DASHBOARD_UPCOMING_ID = 'abc33333-3333-4333-8333-333333333333'
const MIGRATION_URLS = [
  new URL('../../supabase/migrations/202610100001_phase3_task_system.sql', import.meta.url),
  new URL('../../supabase/migrations/202610100002_phase3_live_task_operations.sql', import.meta.url),
  new URL('../../supabase/migrations/202610100003_phase3_auth_recovery_and_recurring_templates.sql', import.meta.url),
  new URL('../../supabase/migrations/202610100004_phase4_chat_notes_backup.sql', import.meta.url),
]

let db: PGlite

async function query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return db.query<T>(sql, params)
}

async function setCurrentUser(userId: string) {
  await query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
}

async function makeNote(noteId: string, title: string, visibility: 'private' | 'shared', operationId: string) {
  return query<{ id: string; version: number }>(
    `select (note).id, (note).version from (
       select public.upsert_workspace_note($1, $2, '', 'general', $3, false, null, $4) as note
     ) created`,
    [noteId, title, visibility, operationId],
  )
}

async function makeExistingTask() {
  await db.exec('reset role')
  await query(
    `insert into public.task_instances (id, workspace_id, planned_date, title, description, category, priority,
       scheduled_start_time, duration_minutes, status, created_by)
     values ($1, $2, '2099-01-01', 'Existing task', '', 'work', 'medium', '09:00', 30, 'pending', $3)`,
    [EXISTING_TASK_ID, WORKSPACE_ID, ADMIN_ID],
  )
  await db.exec('set role authenticated')
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      raw_app_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `)
  for (const migrationUrl of MIGRATION_URLS) await db.exec(await readFile(migrationUrl, 'utf8'))
  await query(
    `insert into private.authorized_emails(email, workspace_id, member_role)
     values ('phase4-admin-fixture@gmail.com', $1, 'admin'), ('phase4-member-fixture@gmail.com', $1, 'member')`,
    [WORKSPACE_ID],
  )
  await query(
    `insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
     values ($1, 'phase4-admin-fixture@gmail.com', now(), '{}'::jsonb, '{"provider":"google"}'::jsonb),
            ($2, 'phase4-member-fixture@gmail.com', now(), '{}'::jsonb, '{"provider":"google"}'::jsonb)`,
    [ADMIN_ID, MEMBER_ID],
  )
})

afterEach(async () => {
  await db.close()
})

describe('Phase 4 PostgreSQL migration (PGlite/Auth/RLS simulation)', () => {
  it('stores idempotent one-to-one chat messages and protects reads, receipts, and RPCs', async () => {
    await db.exec('set role authenticated')
    await setCurrentUser(ADMIN_ID)
    const operationId = 'a1111111-1111-4111-8111-111111111111'
    const sent = await query<{ id: string; created_at: Date }>(
      `select (message).id, (message).created_at from (
         select public.send_chat_message('বাংলা message with history', $1) as message
       ) sent`,
      [operationId],
    )
    expect(sent.rows[0].id).toBeTruthy()
    expect(sent.rows[0].created_at).toBeTruthy()
    const retried = await query<{ id: string }>(
      `select (message).id from (select public.send_chat_message('বাংলা message with history', $1) as message) sent`,
      [operationId],
    )
    expect(retried.rows[0].id).toBe(sent.rows[0].id)
    await expect(query(`select public.send_chat_message('different payload', $1)`, [operationId]))
      .rejects.toThrow(/already used for a different message/i)
    expect((await query<{ count: number }>(`select count(*)::int as count from public.chat_messages`)).rows[0].count).toBe(1)
    expect((await query<{ count: number }>(`select public.get_chat_unread_count() as count`)).rows[0].count).toBe(0)

    await setCurrentUser(MEMBER_ID)
    const incoming = await query<{ id: string; body: string }>(`select id, body from public.chat_messages`)
    expect(incoming.rows).toEqual([{ id: sent.rows[0].id, body: 'বাংলা message with history' }])
    expect((await query<{ count: number }>(`select public.get_chat_unread_count() as count`)).rows[0].count).toBe(1)
    expect((await query<{ count: number }>(`select public.mark_chat_messages_read(array[$1::uuid]) as count`, [sent.rows[0].id])).rows[0].count).toBe(1)
    expect((await query<{ count: number }>(`select public.get_chat_unread_count() as count`)).rows[0].count).toBe(0)
    expect((await query<{ count: number }>(`select count(*)::int as count from public.chat_read_receipts where reader_id = $1`, [MEMBER_ID])).rows[0].count).toBe(1)
    await expect(query(
      `insert into public.chat_messages(workspace_id, sender_id, client_operation_id, body)
       values ($1, $2, $3, 'direct write')`,
      [WORKSPACE_ID, MEMBER_ID, 'a2222222-2222-4222-8222-222222222222'],
    )).rejects.toThrow(/permission denied/i)

    await setCurrentUser(OUTSIDER_ID)
    expect((await query<{ count: number }>(`select count(*)::int as count from public.chat_messages`)).rows[0].count).toBe(0)
    await expect(query(`select public.send_chat_message('blocked', $1)`, ['a3333333-3333-4333-8333-333333333333']))
      .rejects.toThrow(/membership/i)
    await expect(query(`select public.get_chat_unread_count()`)).rejects.toThrow(/membership/i)
    await expect(query(`select * from private.workspace_note_operation_receipts`)).rejects.toThrow(/permission denied/i)

    await db.exec('reset role; set role anon')
    await expect(query(`select public.send_chat_message('anon blocked', $1)`, ['a4444444-4444-4444-8444-444444444444']))
      .rejects.toThrow(/permission denied/i)
    await expect(query(`select * from public.chat_messages`)).rejects.toThrow(/permission denied/i)
  })

  it('enforces owner-only private notes, shared collaboration, versions, and write RPC authorization', async () => {
    await db.exec('set role authenticated')
    await setCurrentUser(ADMIN_ID)
    await makeNote(PRIVATE_NOTE_ID, 'Admin secret', 'private', 'b1111111-1111-4111-8111-111111111111')
    await makeNote(SHARED_NOTE_ID, 'Shared note', 'shared', 'b2222222-2222-4222-8222-222222222222')

    await setCurrentUser(MEMBER_ID)
    const memberView = await query<{ id: string; title: string; visibility: string }>(
      `select id, title, visibility from public.workspace_notes order by id`,
    )
    expect(memberView.rows).toEqual([{ id: SHARED_NOTE_ID, title: 'Shared note', visibility: 'shared' }])
    const updateOperation = 'b3333333-3333-4333-8333-333333333333'
    const updated = await query<{ id: string; version: number }>(
      `select (note).id, (note).version from (
         select public.upsert_workspace_note($1, 'Shared updated', 'body', 'work', 'shared', true, 1, $2) as note
       ) changed`,
      [SHARED_NOTE_ID, updateOperation],
    )
    expect(updated.rows[0].version).toBe(2)
    const retry = await query<{ version: number }>(
      `select (note).version from (
         select public.upsert_workspace_note($1, 'Shared updated', 'body', 'work', 'shared', true, 1, $2) as note
       ) changed`,
      [SHARED_NOTE_ID, updateOperation],
    )
    expect(retry.rows[0].version).toBe(2)
    await expect(query(
      `select public.upsert_workspace_note($1, 'stale', '', 'general', 'shared', false, 1, $2)`,
      [SHARED_NOTE_ID, 'b4444444-4444-4444-8444-444444444444'],
    )).rejects.toThrow(/NOTE_VERSION_CONFLICT/i)
    await expect(query(
      `select public.upsert_workspace_note($1, 'hide shared', '', 'general', 'private', false, 2, $2)`,
      [SHARED_NOTE_ID, 'b5555555-5555-4555-8555-555555555555'],
    )).rejects.toThrow(/only the note owner/i)
    await expect(query(
      `select public.delete_workspace_note($1, 1, $2)`,
      [PRIVATE_NOTE_ID, 'b6666666-6666-4666-8666-666666666666'],
    )).rejects.toThrow(/unavailable/i)
    await makeNote(MEMBER_NOTE_ID, 'Member secret', 'private', 'b7777777-7777-4777-8777-777777777777')
    await expect(query(`update public.workspace_notes set title = 'direct write' where id = $1`, [SHARED_NOTE_ID]))
      .rejects.toThrow(/permission denied/i)

    await setCurrentUser(ADMIN_ID)
    const adminView = await query<{ id: string; title: string; visibility: string }>(
      `select id, title, visibility from public.workspace_notes order by id`,
    )
    expect(adminView.rows).toEqual([
      { id: PRIVATE_NOTE_ID, title: 'Admin secret', visibility: 'private' },
      { id: SHARED_NOTE_ID, title: 'Shared updated', visibility: 'shared' },
    ])
  })

  it('validates same-workspace restore, filters foreign private notes server-side, and merges without overwrite', async () => {
    await db.exec('set role authenticated')
    await setCurrentUser(ADMIN_ID)
    await makeExistingTask()
    await makeNote(PRIVATE_NOTE_ID, 'Protected original', 'private', 'c1111111-1111-4111-8111-111111111111')

    const backup = {
      format: 'smartflow-duo-backup',
      schema_version: 1,
      workspace_id: WORKSPACE_ID,
      exported_at: '2026-10-10T10:00:00.000Z',
      exported_by: ADMIN_ID,
      work_lists: [{ id: RESTORED_LIST_ID, name: 'Imported list', category: 'work', color: 'green', is_archived: false }],
      task_templates: [],
      task_instances: [
        { id: EXISTING_TASK_ID, planned_date: '2099-01-01', title: 'Must not overwrite', description: '', category: 'work', priority: 'medium', scheduled_start_time: '09:00', duration_minutes: 30, status: 'pending' },
        { id: RESTORED_TASK_ID, template_id: null, work_list_id: RESTORED_LIST_ID, creation_key: null, planned_date: '2099-01-02', title: 'Restored task', description: 'From local file', category: 'study', priority: 'high', scheduled_start_time: '11:00', duration_minutes: 25, reminder_minutes: null, status: 'pending', actual_started_at: null, actual_completed_at: null, accumulated_seconds: 0, deleted_at: null },
      ],
      workspace_notes: [
        { id: PRIVATE_NOTE_ID, owner_id: ADMIN_ID, visibility: 'private', title: 'Leaked overwrite attempt', body: 'private', category: 'personal', is_pinned: false },
        { id: RESTORED_FOREIGN_NOTE_ID, owner_id: ADMIN_ID, visibility: 'private', title: 'Foreign secret', body: 'must be ignored', category: 'personal', is_pinned: false },
        { id: RESTORED_SHARED_NOTE_ID, owner_id: ADMIN_ID, visibility: 'shared', title: 'Restored shared', body: 'team', category: 'work', is_pinned: true },
        { id: RESTORED_PRIVATE_NOTE_ID, owner_id: MEMBER_ID, visibility: 'private', title: 'Current user private', body: 'mine', category: 'personal', is_pinned: false },
      ],
      notification_preferences: [{ user_id: ADMIN_ID, upcoming_enabled: false }],
      task_time_events: [],
      activity_events: [{ id: ARCHIVE_SOURCE_ID, created_at: '2026-10-09T10:00:00.000Z', event_type: 'task_completed', details: { imported: true } }],
      history_archive: [],
    }
    await setCurrentUser(MEMBER_ID)
    const operationId = 'c2222222-2222-4222-8222-222222222222'
    const restoreSql = `select public.restore_workspace_backup($1::jsonb, $2) as result`
    const first = await query<{ result: Record<string, number> }>(restoreSql, [JSON.stringify(backup), operationId])
    expect(first.rows[0].result).toEqual({ work_lists: 1, task_templates: 0, task_instances: 1, workspace_notes: 2, history_archive: 1, preferences: 0 })
    const retry = await query<{ result: Record<string, number> }>(restoreSql, [JSON.stringify(backup), operationId])
    expect(retry.rows[0].result).toEqual(first.rows[0].result)
    await expect(query(restoreSql, [JSON.stringify({ ...backup, exported_at: 'changed' }), operationId]))
      .rejects.toThrow(/reused for another backup/i)

    const memberTasks = await query<{ id: string; title: string }>(
      `select id, title from public.task_instances where id in ($1, $2) order by id`,
      [EXISTING_TASK_ID, RESTORED_TASK_ID],
    )
    expect(memberTasks.rows.find((task) => task.id === EXISTING_TASK_ID)?.title).toBe('Existing task')
    expect(memberTasks.rows.find((task) => task.id === RESTORED_TASK_ID)?.title).toBe('Restored task')
    const memberNotes = await query<{ id: string; title: string; visibility: string }>(
      `select id, title, visibility from public.workspace_notes order by id`,
    )
    expect(memberNotes.rows).toEqual([
      { id: RESTORED_SHARED_NOTE_ID, title: 'Restored shared', visibility: 'shared' },
      { id: RESTORED_PRIVATE_NOTE_ID, title: 'Current user private', visibility: 'private' },
    ])
    expect((await query<{ count: number }>(`select count(*)::int as count from public.workspace_history_archive where source_id = $1`, [ARCHIVE_SOURCE_ID])).rows[0].count).toBe(1)
    expect((await query<{ upcoming_enabled: boolean }>(
      `select upcoming_enabled from public.notification_preferences where user_id = $1`, [MEMBER_ID],
    )).rows[0].upcoming_enabled).toBe(true)

    await setCurrentUser(ADMIN_ID)
    expect((await query<{ title: string }>(`select title from public.workspace_notes where id = $1`, [PRIVATE_NOTE_ID])).rows[0].title)
      .toBe('Protected original')
    expect((await query<{ count: number }>(`select count(*)::int as count from public.workspace_notes where id = $1`, [RESTORED_FOREIGN_NOTE_ID])).rows[0].count)
      .toBe(0)
    await expect(query(restoreSql, [JSON.stringify({ ...backup, workspace_id: '00000000-0000-4000-8000-000000000002' }), 'c3333333-3333-4333-8333-333333333333']))
      .rejects.toThrow(/another workspace/i)
  })

  it('returns an uncapped, Dhaka-day server dashboard aggregate only to workspace members', async () => {
    await db.exec('set role authenticated')
    await setCurrentUser(ADMIN_ID)
    await db.exec('reset role')
    const today = (await query<{ today: string }>(
      `select (clock_timestamp() at time zone 'Asia/Dhaka')::date::text as today`,
    )).rows[0].today
    await query(
      `insert into public.task_instances (id, workspace_id, planned_date, title, description, category, priority,
         scheduled_start_time, duration_minutes, status, actual_completed_at, created_by)
       values ($1, $2, $3::date, 'Completed today', '', 'work', 'medium', '09:00', 30, 'completed', now(), $4)`,
      [DASHBOARD_COMPLETED_ID, WORKSPACE_ID, today, ADMIN_ID],
    )
    await query(
      `insert into public.task_instances (id, workspace_id, planned_date, title, description, category, priority,
         scheduled_start_time, duration_minutes, status, created_by)
       values ($1, $2, $3::date - 1, 'Old overdue', '', 'work', 'medium', '00:00', 30, 'pending', $4)`,
      [DASHBOARD_OVERDUE_ID, WORKSPACE_ID, today, ADMIN_ID],
    )
    await query(
      `insert into public.task_instances (id, workspace_id, planned_date, title, description, category, priority,
         scheduled_start_time, duration_minutes, status, created_by)
       values ($1, $2, $3::date + 1, 'Tomorrow', '', 'study', 'high', '09:00', 30, 'pending', $4)`,
      [DASHBOARD_UPCOMING_ID, WORKSPACE_ID, today, ADMIN_ID],
    )
    await db.exec('set role authenticated')
    const summary = await query<{
      today: string; total: number; completed: number; pending: number; in_progress: number;
      overdue: number; completion_rate: number; upcoming: Array<{ id: string; title: string }>
    }>(`select today::text, total, completed, pending, in_progress, overdue, completion_rate, upcoming from public.get_dashboard_summary()`)
    expect(summary.rows[0]).toMatchObject({
      today, total: 1, completed: 1, pending: 0, in_progress: 0, overdue: 1, completion_rate: 100,
    })
    expect(summary.rows[0].upcoming.map((task) => task.id)).toEqual([DASHBOARD_UPCOMING_ID])

    await setCurrentUser(OUTSIDER_ID)
    await expect(query(`select * from public.get_dashboard_summary()`)).rejects.toThrow(/membership/i)
  })
})
