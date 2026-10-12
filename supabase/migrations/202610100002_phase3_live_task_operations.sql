-- Phase 3 follow-up: live client task edits/deletes and a trusted daily scheduler hook.
-- No account emails or secrets are included. Apply after 202610100001_phase3_task_system.sql.

begin;

alter table public.task_instances
  add column if not exists deleted_at timestamptz;

alter table public.task_time_events
  drop constraint if exists task_time_events_event_type_check;
alter table public.task_time_events
  add constraint task_time_events_event_type_check
  check (event_type in ('started', 'paused', 'resumed', 'completed', 'reopened', 'schedule_changed', 'task_edited', 'reset_pending'));

create or replace function private.queue_task_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_member record;
  v_schedule_changed boolean := true;
begin
  if new.deleted_at is not null then
    update private.notification_outbox
      set delivery_status = 'cancelled'
      where task_instance_id = new.id and delivery_status = 'pending';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_schedule_changed := old.planned_date is distinct from new.planned_date
      or old.scheduled_start_time is distinct from new.scheduled_start_time
      or old.duration_minutes is distinct from new.duration_minutes
      or old.reminder_minutes is distinct from new.reminder_minutes;

    if new.status in ('in_progress', 'overdue') and old.status is distinct from new.status then
      update private.notification_outbox
        set delivery_status = 'cancelled'
        where task_instance_id = new.id and delivery_status = 'pending'
          and notification_type in ('pre_start', 'task_start', 'upcoming');
    end if;

    if new.status = 'completed' then
      update private.notification_outbox
        set delivery_status = 'cancelled'
        where task_instance_id = new.id and delivery_status = 'pending';
      return new;
    end if;

    if not v_schedule_changed and not (old.status = 'completed' and new.status <> 'completed') then
      return new;
    end if;

    update private.notification_outbox
      set delivery_status = 'cancelled'
      where task_instance_id = new.id and delivery_status = 'pending';
  end if;

  for v_member in
    select wm.user_id,
      coalesce(np.pre_start_enabled, true) as pre_start_enabled,
      coalesce(np.task_start_enabled, true) as task_start_enabled,
      coalesce(np.overdue_enabled, true) as overdue_enabled,
      coalesce(np.upcoming_enabled, true) as upcoming_enabled
    from public.workspace_members wm
    left join public.notification_preferences np on np.user_id = wm.user_id
    where wm.workspace_id = new.workspace_id and wm.is_active
  loop
    if v_member.pre_start_enabled and new.reminder_at is not null and new.reminder_at > clock_timestamp() then
      insert into private.notification_outbox (workspace_id, recipient_id, task_instance_id, notification_type, idempotency_key, fire_at, payload)
      values (new.workspace_id, v_member.user_id, new.id, 'pre_start',
        concat(new.id, ':', v_member.user_id, ':pre_start:', new.version), new.reminder_at,
        jsonb_build_object('task_instance_id', new.id, 'title', new.title, 'planned_start_at', new.planned_start_at))
      on conflict (idempotency_key) do nothing;
    end if;
    if v_member.task_start_enabled and new.planned_start_at > clock_timestamp() then
      insert into private.notification_outbox (workspace_id, recipient_id, task_instance_id, notification_type, idempotency_key, fire_at, payload)
      values (new.workspace_id, v_member.user_id, new.id, 'task_start',
        concat(new.id, ':', v_member.user_id, ':task_start:', new.version), new.planned_start_at,
        jsonb_build_object('task_instance_id', new.id, 'title', new.title, 'planned_start_at', new.planned_start_at))
      on conflict (idempotency_key) do nothing;
    end if;
    if v_member.overdue_enabled and new.planned_end_at > clock_timestamp() then
      insert into private.notification_outbox (workspace_id, recipient_id, task_instance_id, notification_type, idempotency_key, fire_at, payload)
      values (new.workspace_id, v_member.user_id, new.id, 'overdue',
        concat(new.id, ':', v_member.user_id, ':overdue:', new.version), new.planned_end_at,
        jsonb_build_object('task_instance_id', new.id, 'title', new.title, 'planned_end_at', new.planned_end_at))
      on conflict (idempotency_key) do nothing;
    end if;
    if v_member.upcoming_enabled and new.planned_start_at > clock_timestamp() then
      insert into private.notification_outbox (workspace_id, recipient_id, task_instance_id, notification_type, idempotency_key, fire_at, payload)
      values (new.workspace_id, v_member.user_id, new.id, 'upcoming',
        concat(new.id, ':', v_member.user_id, ':upcoming:', new.version), new.planned_start_at,
        jsonb_build_object('task_instance_id', new.id, 'title', new.title, 'planned_start_at', new.planned_start_at))
      on conflict (idempotency_key) do nothing;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.queue_task_notifications() from public, anon, authenticated;

create or replace function public.update_task_instance(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_priority text,
  p_work_list_id uuid,
  p_planned_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_reminder_minutes integer,
  p_expected_version integer,
  p_operation_id uuid
)
returns public.task_instances
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.task_instances%rowtype;
  v_before public.task_instances%rowtype;
  v_duplicate_task_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_expected_version is null or p_operation_id is null then
    raise exception using errcode = '22023', message = 'Expected version and operation id are required.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'Task title must contain 1 to 200 characters.';
  end if;

  select task_instance_id into v_duplicate_task_id
  from public.task_time_events where actor_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_duplicate_task_id <> p_task_id then raise exception using errcode = '23505', message = 'Operation id was reused for another task.'; end if;
    select * into v_task from public.task_instances where id = p_task_id;
    return v_task;
  end if;

  select * into v_task from public.task_instances where id = p_task_id for update;
  if not found or v_task.deleted_at is not null or not private.is_workspace_member(v_task.workspace_id) then
    raise exception using errcode = '42501', message = 'Task is unavailable to this user.';
  end if;
  if v_task.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'TASK_VERSION_CONFLICT: reload before editing this task.';
  end if;
  if p_work_list_id is not null and not exists (
    select 1 from public.work_lists l where l.id = p_work_list_id and l.workspace_id = v_task.workspace_id and not l.is_archived
  ) then
    raise exception using errcode = '23503', message = 'The selected work list is unavailable.';
  end if;
  v_before := v_task;

  update public.task_instances set
    title = btrim(p_title),
    description = coalesce(p_description, ''),
    category = coalesce(nullif(btrim(p_category), ''), 'work'),
    priority = coalesce(nullif(p_priority, ''), 'medium'),
    work_list_id = p_work_list_id,
    planned_date = p_planned_date,
    scheduled_start_time = p_start_time,
    duration_minutes = p_duration_minutes,
    reminder_minutes = p_reminder_minutes,
    version = version + 1
  where id = p_task_id returning * into v_task;

  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, p_operation_id, 'task_edited', jsonb_build_object(
    'before', jsonb_build_object('title', v_before.title, 'planned_date', v_before.planned_date, 'start_time', v_before.scheduled_start_time, 'duration_minutes', v_before.duration_minutes),
    'after', jsonb_build_object('title', v_task.title, 'planned_date', v_task.planned_date, 'start_time', v_task.scheduled_start_time, 'duration_minutes', v_task.duration_minutes)
  ));
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, 'task_updated', jsonb_build_object('version', v_task.version));
  return v_task;
end;
$$;
revoke all on function public.update_task_instance(uuid, text, text, text, text, uuid, date, time, integer, integer, integer, uuid) from public, anon;
grant execute on function public.update_task_instance(uuid, text, text, text, text, uuid, date, time, integer, integer, integer, uuid) to authenticated;

create or replace function public.soft_delete_task_instance(p_task_id uuid, p_expected_version integer, p_operation_id uuid)
returns public.task_instances
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.task_instances%rowtype;
  v_duplicate_task_id uuid;
  v_now timestamptz := clock_timestamp();
  v_elapsed bigint := 0;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_expected_version is null or p_operation_id is null then
    raise exception using errcode = '22023', message = 'Expected version and operation id are required.';
  end if;
  select task_instance_id into v_duplicate_task_id
  from public.task_time_events where actor_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_duplicate_task_id <> p_task_id then raise exception using errcode = '23505', message = 'Operation id was reused for another task.'; end if;
    select * into v_task from public.task_instances where id = p_task_id;
    return v_task;
  end if;

  select * into v_task from public.task_instances where id = p_task_id for update;
  if not found or v_task.deleted_at is not null or not private.is_workspace_member(v_task.workspace_id) then
    raise exception using errcode = '42501', message = 'Task is unavailable to this user.';
  end if;
  if v_task.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'TASK_VERSION_CONFLICT: reload before deleting this task.';
  end if;
  if v_task.running_since is not null then
    v_elapsed := greatest(0, floor(extract(epoch from (v_now - v_task.running_since)))::bigint);
  end if;

  update public.task_instances set deleted_at = v_now, accumulated_seconds = accumulated_seconds + v_elapsed,
    running_since = null, version = version + 1
  where id = p_task_id returning * into v_task;
  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, p_operation_id, 'task_edited', jsonb_build_object('action', 'soft_delete'));
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, 'task_deleted', jsonb_build_object('preserved_in_history', true));
  return v_task;
end;
$$;
revoke all on function public.soft_delete_task_instance(uuid, integer, uuid) from public, anon;
grant execute on function public.soft_delete_task_instance(uuid, integer, uuid) to authenticated;

create or replace function private.generate_daily_workspace_instances()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_workspace_id uuid;
  v_time_zone text;
  v_today date;
  v_inserted integer := 0;
begin
  select id, time_zone into v_workspace_id, v_time_zone from public.workspaces limit 1;
  if not found then return 0; end if;
  v_today := (clock_timestamp() at time zone v_time_zone)::date;

  insert into public.task_instances (
    workspace_id, template_id, work_list_id, planned_date, title, description, category, priority,
    scheduled_start_time, duration_minutes, reminder_minutes, status
  )
  select t.workspace_id, t.id, t.work_list_id, v_today, t.title, t.description, t.category, t.priority,
    t.scheduled_start_time, t.duration_minutes, t.reminder_minutes, 'pending'
  from public.task_templates t
  where t.workspace_id = v_workspace_id and t.is_active
    and v_today >= t.active_from and (t.active_until is null or v_today <= t.active_until)
    and extract(dow from v_today)::smallint = any(t.days_of_week)
  on conflict (template_id, planned_date) where template_id is not null do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function private.generate_daily_workspace_instances() from public, anon, authenticated;

-- Rebuild the clock view so deleted_at is visible to an authenticated client.
drop view public.task_instance_clock;
create view public.task_instance_clock
with (security_invoker = true)
as
select ti.*,
  (ti.accumulated_seconds + case
    when ti.running_since is not null and ti.status in ('in_progress', 'overdue')
      then greatest(0, floor(extract(epoch from (statement_timestamp() - ti.running_since)))::bigint)
    else 0
  end) as elapsed_seconds,
  greatest(0, ti.duration_minutes::bigint * 60 - (ti.accumulated_seconds + case
    when ti.running_since is not null and ti.status in ('in_progress', 'overdue')
      then greatest(0, floor(extract(epoch from (statement_timestamp() - ti.running_since)))::bigint)
    else 0
  end)) as remaining_seconds,
  greatest(0, (ti.accumulated_seconds + case
    when ti.running_since is not null and ti.status in ('in_progress', 'overdue')
      then greatest(0, floor(extract(epoch from (statement_timestamp() - ti.running_since)))::bigint)
    else 0
  end) - ti.duration_minutes::bigint * 60) as overtime_seconds,
  case when ti.actual_started_at is not null then
    (ti.accumulated_seconds + case
      when ti.running_since is not null and ti.status in ('in_progress', 'overdue')
        then greatest(0, floor(extract(epoch from (statement_timestamp() - ti.running_since)))::bigint)
      else 0
    end) - ti.duration_minutes::bigint * 60
    else null
  end as schedule_delta_seconds,
  case when ti.status <> 'completed' and ti.planned_end_at <= statement_timestamp() then 'overdue' else ti.status end as effective_status
from public.task_instances ti;
grant select on public.task_instance_clock to authenticated;

-- Realtime is optional on a fresh/non-Supabase PostgreSQL instance; add the table only when the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_instances') then
    execute 'alter publication supabase_realtime add table public.task_instances';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events') then
    execute 'alter publication supabase_realtime add table public.activity_events';
  end if;
end;
$$;

commit;
