-- Phase 3 follow-up: repair membership for previously-created Auth users,
-- idempotent daily-template creation, and safe recurrence shutdown.
-- The two private authorized Gmail addresses must be provisioned separately.

begin;

-- A verified account must still be in the private allowlist on every RLS check.
-- Disabling/removing an allowlist row therefore revokes access without waiting
-- for the next client-side route change.
create or replace function private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, private
as $$
  select exists (
    select 1
    from public.workspace_members wm
    join auth.users au on au.id = wm.user_id
    join private.authorized_emails ae
      on ae.email = lower(btrim(au.email))
     and ae.workspace_id = wm.workspace_id
     and ae.member_role = wm.member_role
     and ae.is_active
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and au.email_confirmed_at is not null
      and coalesce(au.raw_app_meta_data ->> 'provider', '') = 'google'
  );
$$;
revoke all on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;

-- New Auth users are provisioned by the trigger in 001. This RPC covers an
-- already-existing verified Auth user and is safe to call on every session restore.
create or replace function public.ensure_current_user_workspace_member()
returns table(workspace_id uuid, member_role text)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_confirmed_at timestamptz;
  v_provider text;
  v_metadata jsonb;
  v_workspace_id uuid;
  v_member_role text;
  v_active_count integer;
  v_admin_count integer;
  v_member_count integer;
  v_display_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  select lower(btrim(au.email)), au.email_confirmed_at, au.raw_app_meta_data ->> 'provider', au.raw_user_meta_data
    into v_email, v_confirmed_at, v_provider, v_metadata
  from auth.users au where au.id = v_user_id;
  if not found or v_email is null or v_confirmed_at is null or coalesce(v_provider, '') <> 'google' then
    raise exception using errcode = '42501', message = 'A verified, authorized Google account is required.';
  end if;

  select ae.workspace_id, ae.member_role into v_workspace_id, v_member_role
  from private.authorized_emails ae
  where ae.email = v_email and ae.is_active;
  if not found then
    raise exception using errcode = '42501', message = 'This account is not authorized for SmartFlow Duo.';
  end if;
  select count(*), count(*) filter (where ae.member_role = 'admin'), count(*) filter (where ae.member_role = 'member')
    into v_active_count, v_admin_count, v_member_count
  from private.authorized_emails ae
  where ae.workspace_id = v_workspace_id and ae.is_active;
  if v_active_count <> 2 or v_admin_count <> 1 or v_member_count <> 1 then
    raise exception using errcode = '55000', message = 'The private two-member allowlist is not fully provisioned.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, member_role, is_active)
  values (v_workspace_id, v_user_id, v_member_role, true)
  on conflict on constraint workspace_members_pkey do update
    set member_role = excluded.member_role, is_active = true;

  v_display_name := coalesce(nullif(btrim(v_metadata ->> 'full_name'), ''), split_part(v_email, '@', 1));
  insert into public.profiles (user_id, workspace_id, display_name)
  values (v_user_id, v_workspace_id, left(v_display_name, 80))
  on conflict (user_id) do nothing;
  insert into public.notification_preferences (user_id, workspace_id)
  values (v_user_id, v_workspace_id)
  on conflict (user_id) do nothing;

  return query select v_workspace_id, v_member_role;
end;
$$;
revoke all on function public.ensure_current_user_workspace_member() from public, anon;
grant execute on function public.ensure_current_user_workspace_member() to authenticated;

-- Template creation receives one client-generated key and can safely be retried
-- after a lost response; it never creates a second daily template for that key.
alter table public.task_templates
  add column if not exists creation_key uuid unique;

create or replace function public.create_daily_task_template(
  p_title text,
  p_description text,
  p_category text,
  p_priority text,
  p_active_from date,
  p_start_time time,
  p_duration_minutes integer,
  p_reminder_minutes integer,
  p_creation_key uuid
)
returns public.task_templates
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_template public.task_templates%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_creation_key is null then raise exception using errcode = '22023', message = 'A retry-stable creation key is required.'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'Task title must contain 1 to 200 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 4000 then
    raise exception using errcode = '22023', message = 'Task description cannot exceed 4000 characters.';
  end if;
  if p_priority is null or p_priority not in ('low', 'medium', 'high') then
    raise exception using errcode = '22023', message = 'Task priority is invalid.';
  end if;
  if p_category is not null and char_length(btrim(p_category)) > 80 then
    raise exception using errcode = '22023', message = 'Task category cannot exceed 80 characters.';
  end if;
  if p_active_from is null or p_start_time is null or p_duration_minutes is null or p_duration_minutes not between 1 and 1440 then
    raise exception using errcode = '22023', message = 'A valid date, start time, and duration are required.';
  end if;
  if p_reminder_minutes is not null and p_reminder_minutes not between 0 and 10080 then
    raise exception using errcode = '22023', message = 'Reminder minutes must be between 0 and 10080.';
  end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active
    and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;

  select * into v_template from public.task_templates where creation_key = p_creation_key;
  if found then
    if v_template.workspace_id <> v_workspace_id then
      raise exception using errcode = '23505', message = 'Creation key is already used by another workspace.';
    end if;
    return v_template;
  end if;

  insert into public.task_templates (
    workspace_id, creation_key, title, description, category, priority, days_of_week,
    active_from, scheduled_start_time, duration_minutes, reminder_minutes, is_active, created_by
  ) values (
    v_workspace_id, p_creation_key, btrim(p_title), coalesce(p_description, ''),
    coalesce(nullif(btrim(p_category), ''), 'work'), p_priority, array[0,1,2,3,4,5,6]::smallint[],
    p_active_from, p_start_time, p_duration_minutes, p_reminder_minutes, true, v_user_id
  ) on conflict (creation_key) do nothing
  returning * into v_template;

  if not found then
    select * into v_template from public.task_templates where creation_key = p_creation_key;
    if not found or v_template.workspace_id <> v_workspace_id then
      raise exception using errcode = '23505', message = 'Creation key is already used by another workspace.';
    end if;
  end if;
  return v_template;
end;
$$;
revoke all on function public.create_daily_task_template(text, text, text, text, date, time, integer, integer, uuid) from public, anon;
grant execute on function public.create_daily_task_template(text, text, text, text, date, time, integer, integer, uuid) to authenticated;

-- The live client must use the validated, retry-safe RPC instead of direct writes.
revoke insert, update, delete on public.task_templates from authenticated;

-- A shared workspace may have at most one running timer at a time. The database
-- constraint is race-safe across both members and separate browser devices.
create unique index if not exists task_instances_one_running_timer_per_workspace
  on public.task_instances (workspace_id)
  where status in ('in_progress', 'overdue') and running_since is not null and deleted_at is null;

create table if not exists private.template_operation_receipts (
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  template_id uuid not null references public.task_templates(id) on delete cascade,
  operation_type text not null check (operation_type = 'stop_daily_template'),
  affected_instances integer not null default 0 check (affected_instances >= 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_id, operation_id)
);
alter table private.template_operation_receipts enable row level security;
revoke all on table private.template_operation_receipts from public, anon, authenticated;

create or replace function public.stop_daily_task_template(p_template_id uuid, p_operation_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_template public.task_templates%rowtype;
  v_receipt private.template_operation_receipts%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Dhaka')::date;
  v_now timestamptz := clock_timestamp();
  v_removed integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'An operation id is required for safe retry.'; end if;
  select * into v_receipt from private.template_operation_receipts
  where actor_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_receipt.template_id <> p_template_id or v_receipt.operation_type <> 'stop_daily_template' then
      raise exception using errcode = '23505', message = 'Operation id was reused for another template operation.';
    end if;
    return v_receipt.affected_instances;
  end if;

  select * into v_template from public.task_templates where id = p_template_id for update;
  if not found or not private.is_workspace_member(v_template.workspace_id) then
    raise exception using errcode = '42501', message = 'Daily template is unavailable to this user.';
  end if;
  update public.task_templates set is_active = false where id = p_template_id;

  with removed as (
    update public.task_instances
      set deleted_at = v_now,
          accumulated_seconds = accumulated_seconds + case when running_since is null then 0 else
            greatest(0, floor(extract(epoch from (v_now - running_since)))::bigint) end,
          running_since = null,
          version = version + 1
    where template_id = p_template_id and planned_date > v_today
      and status = 'pending' and running_since is null and deleted_at is null
    returning id, workspace_id, planned_date
  )
  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type, details)
  select removed.workspace_id, removed.id, v_user_id, gen_random_uuid(), 'task_edited',
    jsonb_build_object('action', 'recurrence_stopped', 'planned_date', removed.planned_date)
  from removed;
  get diagnostics v_removed = row_count;

  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type, details)
  values (v_template.workspace_id, null, v_user_id, 'daily_template_stopped',
    jsonb_build_object('template_id', p_template_id, 'future_instances_soft_deleted', v_removed));
  insert into private.template_operation_receipts (actor_id, operation_id, template_id, operation_type, affected_instances)
  values (v_user_id, p_operation_id, p_template_id, 'stop_daily_template', v_removed);
  return v_removed;
end;
$$;
revoke all on function public.stop_daily_task_template(uuid, uuid) from public, anon;
grant execute on function public.stop_daily_task_template(uuid, uuid) to authenticated;

commit;
