// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MEMBER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OUTSIDER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'
const LIST_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TEMPLATE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const MIGRATION_URLS = [
  new URL('../../supabase/migrations/202610100001_phase3_task_system.sql', import.meta.url),
  new URL('../../supabase/migrations/202610100002_phase3_live_task_operations.sql', import.meta.url),
  new URL('../../supabase/migrations/202610100003_phase3_auth_recovery_and_recurring_templates.sql', import.meta.url),
]

let db: PGlite

async function query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return db.query<T>(sql, params)
}

async function setCurrentUser(userId: string) {
  await query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
}

async function seedDailyTemplate() {
  await query(
    `insert into public.work_lists(id, workspace_id, name, created_by)
     values ($1, $2, 'Test list', $3)`,
    [LIST_ID, WORKSPACE_ID, ADMIN_ID],
  )
  await query(
    `insert into public.task_templates(
       id, workspace_id, work_list_id, title, days_of_week, active_from,
       scheduled_start_time, duration_minutes, reminder_minutes, created_by
     ) values ($1, $2, $3, 'Daily test task', array[0,1,2,3,4,5,6]::smallint[],
       '2099-01-01', '09:00', 30, 10, $4)`,
    [TEMPLATE_ID, WORKSPACE_ID, LIST_ID, ADMIN_ID],
  )
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
     values ('phase3-admin-fixture@gmail.com', $1, 'admin'), ('phase3-member-fixture@gmail.com', $1, 'member')`,
    [WORKSPACE_ID],
  )
  await query(
    `insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
     values ($1, 'phase3-admin-fixture@gmail.com', now(), '{}'::jsonb, '{"provider":"google"}'::jsonb),
            ($2, 'phase3-member-fixture@gmail.com', now(), '{}'::jsonb, '{"provider":"google"}'::jsonb)`,
    [ADMIN_ID, MEMBER_ID],
  )
})

afterEach(async () => {
  await db.close()
})

describe('Phase 3 PostgreSQL migration (PGlite with Supabase Auth stubs)', () => {
  it('requires the private two-member allowlist and generates each template/date once', async () => {
    await expect(query(
      `insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       values ($1, 'phase3-outsider-fixture@gmail.com', now(), '{}'::jsonb, '{"provider":"google"}'::jsonb)`,
      [OUTSIDER_ID],
    )).rejects.toThrow(/not authorized/i)
    await expect(query(
      `insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       values ($1, 'phase3-admin-fixture@gmail.com', now(), '{}'::jsonb, '{"provider":"email"}'::jsonb)`,
      ['cd111111-1111-4111-8111-111111111111'],
    )).rejects.toThrow(/Google account/i)

    await setCurrentUser(ADMIN_ID)
    await seedDailyTemplate()
    const first = await query<{ n: number }>(`select public.ensure_daily_task_instances('2099-01-01', '2099-01-03') as n`)
    const retry = await query<{ n: number }>(`select public.ensure_daily_task_instances('2099-01-01', '2099-01-03') as n`)
    expect(first.rows[0].n).toBe(3)
    expect(retry.rows[0].n).toBe(0)
    expect((await query<{ n: number }>(
      `select count(*)::int as n from public.activity_events where event_type = 'daily_task_generated'`,
    )).rows[0].n).toBe(3)
    expect((await query<{ n: number }>(
      `select count(*)::int as n from private.notification_outbox where notification_type = 'pre_start'`,
    )).rows[0].n).toBe(6)
    expect((await query<{ n: number }>(`select private.enqueue_daily_summaries() as n`)).rows[0].n).toBe(2)
    expect((await query<{ n: number }>(`select private.enqueue_daily_summaries() as n`)).rows[0].n).toBe(0)

    const before = await query<{ id: string; status: string }>(
      `select id, status from public.task_instances where planned_date = '2099-01-01'`,
    )
    await query(`update public.task_instances set status = 'completed', actual_completed_at = now() where id = $1`, [before.rows[0].id])
    await query(`select public.ensure_daily_task_instances('2099-01-01', '2099-01-03')`)
    const after = await query<{ status: string }>(`select status from public.task_instances where id = $1`, [before.rows[0].id])
    expect(after.rows[0].status).toBe('completed')
    expect((await query<{ n: number }>(
      `select count(*)::int as n from private.notification_outbox where task_instance_id = $1 and delivery_status = 'cancelled'`,
      [before.rows[0].id],
    )).rows[0].n).toBe(8)
    expect((await query(`select count(*)::int as n from public.task_instances`)).rows[0].n).toBe(3)

    await query(`update public.task_instances set planned_date = '2020-01-01' where planned_date = '2099-01-02'`)
    expect((await query<{ n: number }>(`select public.refresh_overdue_tasks() as n`)).rows[0].n).toBe(1)
    expect((await query<{ status: string }>(`select status from public.task_instances where planned_date = '2020-01-01'`)).rows[0].status)
      .toBe('overdue')
  })

  it('uses saved timestamps for timer transitions and recalculates edited planned end', async () => {
    await setCurrentUser(ADMIN_ID)
    await seedDailyTemplate()
    await query(`select public.ensure_daily_task_instances('2099-01-01', '2099-01-01')`)
    const selected = await query<{ id: string; version: number }>(
      `select id, version from public.task_instances where planned_date = '2099-01-01'`,
    )
    const taskId = selected.rows[0].id

    const started = await query<{ status: string; version: number; running_since: Date }>(
      `select (public.start_task_timer($1, $2)).*`,
      [taskId, 'f1111111-1111-4111-8111-111111111111'],
    )
    expect(started.rows[0].status).toBe('in_progress')
    expect(started.rows[0].running_since).toBeTruthy()
    await query(`select public.start_task_timer($1, $2)`, [taskId, 'f1111111-1111-4111-8111-111111111111'])
    expect((await query<{ version: number }>(`select version from public.task_instances where id = $1`, [taskId])).rows[0].version)
      .toBe(started.rows[0].version)

    await query(`update public.task_instances set running_since = clock_timestamp() - interval '75 seconds' where id = $1`, [taskId])
    const clock = await query<{ elapsed_seconds: number; schedule_delta_seconds: number }>(
      `select elapsed_seconds, schedule_delta_seconds from public.task_instance_clock where id = $1`, [taskId],
    )
    expect(clock.rows[0].elapsed_seconds).toBeGreaterThanOrEqual(75)
    expect(clock.rows[0].schedule_delta_seconds).toBe(clock.rows[0].elapsed_seconds - 1800)

    await query(`select public.pause_task_timer($1, $2)`, [taskId, 'f2222222-2222-4222-8222-222222222222'])
    expect((await query<{ running_since: Date | null; accumulated_seconds: number }>(
      `select running_since, accumulated_seconds from public.task_instances where id = $1`, [taskId],
    )).rows[0].running_since).toBeNull()
    expect((await query<{ accumulated_seconds: number }>(
      `select accumulated_seconds from public.task_instances where id = $1`, [taskId],
    )).rows[0].accumulated_seconds).toBeGreaterThanOrEqual(75)
    await query(`select public.resume_task_timer($1, $2)`, [taskId, 'f3333333-3333-4333-8333-333333333333'])

    const beforeComplete = await query<{ version: number }>(`select version from public.task_instances where id = $1`, [taskId])
    await query(`select public.set_task_status($1, 'completed', $2, $3)`, [taskId, beforeComplete.rows[0].version, 'f4444444-4444-4444-8444-444444444444'])
    const complete = await query<{ status: string; actual_completed_at: Date | null; running_since: Date | null }>(
      `select status, actual_completed_at, running_since from public.task_instances where id = $1`, [taskId],
    )
    expect(complete.rows[0].status).toBe('completed')
    expect(complete.rows[0].actual_completed_at).toBeTruthy()
    expect(complete.rows[0].running_since).toBeNull()

    const beforeReopen = await query<{ version: number }>(`select version from public.task_instances where id = $1`, [taskId])
    await query(`select public.set_task_status($1, 'pending', $2, $3)`, [taskId, beforeReopen.rows[0].version, 'f7777777-7777-4777-8777-777777777777'])
    const reopened = await query<{ status: string; actual_started_at: Date | null; actual_completed_at: Date | null; accumulated_seconds: number }>(
      `select status, actual_started_at, actual_completed_at, accumulated_seconds from public.task_instances where id = $1`, [taskId],
    )
    expect(reopened.rows[0].status).toBe('pending')
    expect(reopened.rows[0].actual_started_at).toBeNull()
    expect(reopened.rows[0].actual_completed_at).toBeNull()
    expect(reopened.rows[0].accumulated_seconds).toBe(0)

    const beforeSchedule = await query<{ version: number }>(`select version from public.task_instances where id = $1`, [taskId])
    const scheduled = await query<{ version: number; planned_end_at: Date }>(
      `with updated as (
         select public.update_task_schedule($1, '2099-01-05', '15:00', 45, 5, $2, $3) as task
       )
       select (task).version, (task).planned_end_at from updated`,
      [taskId, beforeSchedule.rows[0].version, 'f5555555-5555-4555-8555-555555555555'],
    )
    expect(scheduled.rows[0].planned_end_at.toISOString()).toBe('2099-01-05T09:45:00.000Z')
    await expect(query(
      `select public.update_task_schedule($1, '2099-01-06', '16:00', 50, 5, $2, $3)`,
      [taskId, beforeSchedule.rows[0].version, 'f6666666-6666-4666-8666-666666666666'],
    )).rejects.toThrow(/TASK_VERSION_CONFLICT/)
    expect((await query<{ n: number }>(`select count(*)::int as n from public.task_time_events where task_instance_id = $1`, [taskId])).rows[0].n)
      .toBeGreaterThanOrEqual(4)

    const edited = await query<{ id: string; version: number; title: string; planned_end_at: Date }>(
      `select (task).id, (task).version, (task).title, (task).planned_end_at
       from (select public.update_task_instance($1, 'Edited title', 'Details', 'work', 'high', null,
         '2099-01-06', '16:00', 50, 5, $2, $3) as task) updated`,
      [taskId, scheduled.rows[0].version, 'f7777777-7777-4777-8777-777777777778'],
    )
    expect(edited.rows[0].title).toBe('Edited title')
    expect(edited.rows[0].planned_end_at.toISOString()).toBe('2099-01-06T10:50:00.000Z')
    await query(`update public.task_instances set status = 'in_progress', actual_started_at = clock_timestamp() - interval '20 seconds', accumulated_seconds = 7, running_since = clock_timestamp() - interval '13 seconds', version = version + 1 where id = $1`, [taskId])
    const beforeDelete = await query<{ version: number }>(`select version from public.task_instances where id = $1`, [taskId])
    const deleteOperationId = 'f8888888-8888-4888-8888-888888888888'
    const deleted = await query<{ deleted_at: Date | null; version: number; running_since: Date | null; accumulated_seconds: number }>(
      `select (task).deleted_at, (task).version, (task).running_since, (task).accumulated_seconds
       from (select public.soft_delete_task_instance($1, $2, $3) as task) removed`,
      [taskId, beforeDelete.rows[0].version, deleteOperationId],
    )
    expect(deleted.rows[0].deleted_at).toBeTruthy()
    expect(deleted.rows[0].running_since).toBeNull()
    expect(deleted.rows[0].accumulated_seconds).toBeGreaterThanOrEqual(19)
    const deleteRetry = await query<{ deleted_at: Date | null; version: number; running_since: Date | null; accumulated_seconds: number }>(
      `select (task).deleted_at, (task).version, (task).running_since, (task).accumulated_seconds
       from (select public.soft_delete_task_instance($1, $2, $3) as task) removed`,
      [taskId, beforeDelete.rows[0].version, deleteOperationId],
    )
    expect(deleteRetry.rows[0]).toMatchObject(deleted.rows[0])
    await expect(query(`select public.set_task_status($1, 'pending', $2, $3)`, [taskId, deleted.rows[0].version, 'f9999999-9999-4999-8999-999999999999']))
      .rejects.toThrow(/Task is unavailable/i)
    expect((await query<{ n: number }>(`select count(*)::int as n from public.task_instances where id = $1`, [taskId])).rows[0].n)
      .toBe(1)
    expect((await query<{ n: number }>(
      `select count(*)::int as n from private.notification_outbox where task_instance_id = $1 and delivery_status = 'pending'`,
      [taskId],
    )).rows[0].n).toBe(0)
  })

  it('prevents concurrent workspace timers with a race-safe database constraint', async () => {
    await setCurrentUser(ADMIN_ID)
    const create = async (title: string, key: string) => query<{ id: string }>(
      `select (task).id from (
         select public.create_task_instance($1, '', 'work', 'medium', '2099-01-01', '09:00', 30, null, null, $2) as task
       ) created`,
      [title, key],
    )
    const first = await create('First timer', 'ab111111-1111-4111-8111-111111111111')
    const second = await create('Second timer', 'ab222222-2222-4222-8222-222222222222')
    await query(`select public.start_task_timer($1, $2)`, [first.rows[0].id, 'ab333333-3333-4333-8333-333333333333'])
    await expect(query(`select public.start_task_timer($1, $2)`, [second.rows[0].id, 'ab444444-4444-4444-8444-444444444444']))
      .rejects.toThrow(/task_instances_one_running_timer_per_workspace/)
    await query(`select public.pause_task_timer($1, $2)`, [first.rows[0].id, 'ab555555-5555-4555-8555-555555555555'])
    const secondStarted = await query<{ status: string; running_since: Date | null }>(
      `select (task).status, (task).running_since
       from (select public.start_task_timer($1, $2) as task) started`,
      [second.rows[0].id, 'ab666666-6666-4666-8666-666666666666'],
    )
    expect(secondStarted.rows[0].status).toBe('in_progress')
    expect(secondStarted.rows[0].running_since).toBeTruthy()
  })

  it('restores an existing verified Auth user idempotently and rechecks the private allowlist', async () => {
    await query(`delete from public.workspace_members where user_id = $1`, [MEMBER_ID])
    await query(`delete from public.profiles where user_id = $1`, [MEMBER_ID])
    await query(`delete from public.notification_preferences where user_id = $1`, [MEMBER_ID])
    await setCurrentUser(MEMBER_ID)

    const first = await query<{ workspace_id: string; member_role: string }>(`select * from public.ensure_current_user_workspace_member()`)
    const retry = await query<{ workspace_id: string; member_role: string }>(`select * from public.ensure_current_user_workspace_member()`)
    expect(first.rows[0]).toEqual({ workspace_id: WORKSPACE_ID, member_role: 'member' })
    expect(retry.rows[0]).toEqual(first.rows[0])
    expect((await query<{ n: number }>(`select count(*)::int as n from public.workspace_members where user_id = $1`, [MEMBER_ID])).rows[0].n)
      .toBe(1)

    await db.exec('set role authenticated')
    expect((await query<{ n: number }>(`select count(*)::int as n from public.task_instances`)).rows[0].n).toBe(0)
    await db.exec('reset role')
    await query(`update private.authorized_emails set is_active = false where email = 'phase3-member-fixture@gmail.com'`)
    await db.exec('set role authenticated')
    expect((await query<{ n: number }>(`select count(*)::int as n from public.workspace_members`)).rows[0].n).toBe(0)
    await expect(query(`select * from public.ensure_current_user_workspace_member()`)).rejects.toThrow(/not authorized/i)
    await expect(query(`select public.ensure_daily_task_instances('2099-01-01', '2099-01-02')`)).rejects.toThrow(/membership/i)
    await expect(query(`select public.refresh_overdue_tasks()`)).rejects.toThrow(/membership/i)
    await expect(query(
      `select public.create_task_instance('Blocked', '', 'work', 'medium', '2099-01-01', '09:00', 30, null, null, $1)`,
      ['ab777777-7777-4777-8777-777777777777'],
    )).rejects.toThrow(/membership/i)
  })

  it('creates recurring templates idempotently and stops future pending occurrences with history preserved', async () => {
    await setCurrentUser(ADMIN_ID)
    const creationKey = 'aa111111-1111-4111-8111-111111111111'
    const createSql = `select (template).id, (template).title from (
      select public.create_daily_task_template('Daily RPC task', 'Repeat safely', 'study', 'high',
        '2099-01-01', '10:00', 45, 10, $1) as template
    ) created`
    const created = await query<{ id: string; title: string }>(createSql, [creationKey])
    const retried = await query<{ id: string; title: string }>(createSql, [creationKey])
    expect(retried.rows[0]).toEqual(created.rows[0])
    await expect(query(
      `select public.create_daily_task_template('Invalid', '', 'study', 'high', '2099-01-01', '10:00', 0, null, $1)`,
      ['aa222222-2222-4222-8222-222222222222'],
    )).rejects.toThrow(/duration/i)

    await query(`select public.ensure_daily_task_instances('2099-01-01', '2099-01-03')`)
    const countBeforeStop = await query<{ n: number }>(
      `select count(*)::int as n from public.task_instances where template_id = $1 and deleted_at is null`,
      [created.rows[0].id],
    )
    expect(countBeforeStop.rows[0].n).toBe(3)

    const stopOperationId = 'aa333333-3333-4333-8333-333333333333'
    const stopped = await query<{ affected: number }>(
      `select public.stop_daily_task_template($1, $2) as affected`, [created.rows[0].id, stopOperationId],
    )
    const retry = await query<{ affected: number }>(
      `select public.stop_daily_task_template($1, $2) as affected`, [created.rows[0].id, stopOperationId],
    )
    expect(stopped.rows[0].affected).toBe(3)
    expect(retry.rows[0].affected).toBe(3)
    expect((await query<{ n: number }>(
      `select count(*)::int as n from public.task_instances where template_id = $1 and deleted_at is not null`,
      [created.rows[0].id],
    )).rows[0].n).toBe(3)
    expect((await query<{ n: number }>(
      `select count(*)::int as n from public.activity_events where event_type = 'daily_template_stopped'`,
    )).rows[0].n).toBe(1)
    expect((await query<{ is_active: boolean }>(`select is_active from public.task_templates where id = $1`, [created.rows[0].id])).rows[0].is_active)
      .toBe(false)
  })

  it('shares workspace rows with a member but denies allowlist and direct task writes', async () => {
    await setCurrentUser(ADMIN_ID)
    await seedDailyTemplate()
    await query(`select public.ensure_daily_task_instances('2099-01-01', '2099-01-01')`)
    await setCurrentUser(MEMBER_ID)
    await db.exec('set role authenticated')

    const shared = await query<{ n: number }>(`select count(*)::int as n from public.task_instances`)
    expect(shared.rows[0].n).toBe(1)
    await expect(query(`select * from private.authorized_emails`)).rejects.toThrow(/permission denied/i)
    await expect(query(`update public.task_instances set status = 'completed'`)).rejects.toThrow(/permission denied/i)

    await db.exec('reset role')
    await setCurrentUser(OUTSIDER_ID)
    await db.exec('set role authenticated')
    const outsider = await query<{ n: number }>(`select count(*)::int as n from public.task_instances`)
    expect(outsider.rows[0].n).toBe(0)
  })
})
