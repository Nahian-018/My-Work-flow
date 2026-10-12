-- SmartFlow Duo Phase 3 task-system foundation.
-- Apply only to the intended Supabase project after reviewing supabase/README.md.
-- No user email, OAuth secret, service-role key, or push private key belongs here.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.workspaces (
  id uuid primary key,
  name text not null,
  time_zone text not null default 'Asia/Dhaka' check (time_zone = 'Asia/Dhaka'),
  created_at timestamptz not null default now()
);

-- One shared workspace for this app. This contains no user identity or credential.
insert into public.workspaces (id, name, time_zone)
values ('00000000-0000-4000-8000-000000000001', 'SmartFlow Duo', 'Asia/Dhaka')
on conflict (id) do nothing;

create table if not exists private.authorized_emails (
  email text primary key check (
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@gmail[.]com$'
  ),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_role text not null check (member_role in ('admin', 'member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists authorized_emails_one_active_role
  on private.authorized_emails (workspace_id, member_role)
  where is_active;
alter table private.authorized_emails enable row level security;
revoke all on table private.authorized_emails from public, anon, authenticated;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null check (member_role in ('admin', 'member')),
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  display_name text not null default 'SmartFlow member' check (char_length(display_name) between 1 and 80),
  avatar_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.work_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'work' check (char_length(btrim(category)) between 1 and 80),
  color text not null default 'blue',
  is_archived boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_list_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null default 'work' check (char_length(btrim(category)) between 1 and 80),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  -- PostgreSQL DOW convention: Sunday=0, Monday=1, ... Saturday=6.
  days_of_week smallint[] not null default array[0,1,2,3,4,5,6]::smallint[]
    check (cardinality(days_of_week) between 1 and 7 and days_of_week <@ array[0,1,2,3,4,5,6]::smallint[]),
  active_from date not null default (now() at time zone 'Asia/Dhaka')::date,
  active_until date,
  scheduled_start_time time not null default '09:00',
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 1440),
  reminder_minutes integer check (reminder_minutes between 0 and 10080),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_until is null or active_until >= active_from),
  foreign key (work_list_id, workspace_id) references public.work_lists(id, workspace_id),
  unique (id, workspace_id)
);

create table if not exists public.task_instances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid references public.task_templates(id) on delete set null,
  work_list_id uuid,
  creation_key uuid unique,
  planned_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null default 'work' check (char_length(btrim(category)) between 1 and 80),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  scheduled_start_time time not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  reminder_minutes integer check (reminder_minutes between 0 and 10080),
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  reminder_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'overdue')),
  actual_started_at timestamptz,
  actual_completed_at timestamptz,
  accumulated_seconds bigint not null default 0 check (accumulated_seconds >= 0),
  running_since timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (work_list_id, workspace_id) references public.work_lists(id, workspace_id),
  foreign key (template_id, workspace_id) references public.task_templates(id, workspace_id)
);

-- A recurring template can create no more than one instance for a Dhaka date,
-- including when multiple clients race to generate the same date.
create unique index if not exists task_instances_template_occurrence_unique
  on public.task_instances (template_id, planned_date)
  where template_id is not null;
create index if not exists task_instances_workspace_date_idx
  on public.task_instances (workspace_id, planned_date, planned_start_at);
create index if not exists task_templates_active_idx
  on public.task_templates (workspace_id, is_active, active_from, active_until);

create table if not exists public.task_time_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_instance_id uuid not null references public.task_instances(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null,
  event_type text not null check (event_type in ('started', 'paused', 'resumed', 'completed', 'reopened', 'schedule_changed', 'reset_pending')),
  event_at timestamptz not null default clock_timestamp(),
  details jsonb not null default '{}'::jsonb,
  unique (actor_id, operation_id)
);
create index if not exists task_time_events_task_idx on public.task_time_events (task_instance_id, event_at);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_instance_id uuid references public.task_instances(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists activity_events_task_idx on public.activity_events (task_instance_id, created_at);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pre_start_enabled boolean not null default true,
  task_start_enabled boolean not null default true,
  overdue_enabled boolean not null default true,
  upcoming_enabled boolean not null default true,
  daily_summary_enabled boolean not null default true,
  daily_summary_time time not null default '20:00',
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '08:00',
  updated_at timestamptz not null default now()
);

-- Private delivery queue only. A free Web Push/native delivery worker still needs
-- to be configured; rows in this table alone are not delivered notifications.
create table if not exists private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  task_instance_id uuid references public.task_instances(id) on delete cascade,
  notification_type text not null check (notification_type in ('pre_start', 'task_start', 'overdue', 'upcoming', 'daily_summary')),
  idempotency_key text not null unique,
  fire_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now()
);
create index if not exists notification_outbox_due_idx
  on private.notification_outbox (fire_at, next_attempt_at)
  where delivery_status = 'pending';
alter table private.notification_outbox enable row level security;
revoke all on table private.notification_outbox from public, anon, authenticated;

create or replace function private.enqueue_daily_summaries()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_member record;
  v_today date := (clock_timestamp() at time zone 'Asia/Dhaka')::date;
  v_fire_at timestamptz;
  v_queued integer := 0;
begin
  for v_member in
    select wm.workspace_id, wm.user_id, coalesce(np.daily_summary_enabled, true) as enabled,
      coalesce(np.daily_summary_time, time '20:00') as summary_time
    from public.workspace_members wm
    left join public.notification_preferences np on np.user_id = wm.user_id
    where wm.is_active
  loop
    if v_member.enabled then
      v_fire_at := (v_today + v_member.summary_time) at time zone 'Asia/Dhaka';
      insert into private.notification_outbox (workspace_id, recipient_id, notification_type, idempotency_key, fire_at, payload)
      values (v_member.workspace_id, v_member.user_id, 'daily_summary',
        concat('daily-summary:', v_member.user_id, ':', v_today), v_fire_at,
        jsonb_build_object('workspace_id', v_member.workspace_id, 'local_date', v_today))
      on conflict (idempotency_key) do nothing;
      if found then v_queued := v_queued + 1; end if;
    end if;
  end loop;
  return v_queued;
end;
$$;
revoke all on function private.enqueue_daily_summaries() from public, anon, authenticated;

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
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
  );
$$;
revoke all on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth, private
as $$
declare
  v_email text;
  v_workspace_id uuid;
  v_member_role text;
  v_active_count integer;
  v_admin_count integer;
  v_member_count integer;
  v_display_name text;
begin
  v_email := lower(btrim(coalesce(new.email, '')));
  if v_email = '' or new.email_confirmed_at is null
     or coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception using errcode = '42501', message = 'A verified, authorized Google account is required.';
  end if;

  select ae.workspace_id, ae.member_role
    into v_workspace_id, v_member_role
  from private.authorized_emails ae
  where ae.email = v_email and ae.is_active;
  if not found then
    raise exception using errcode = '42501', message = 'This account is not authorized for SmartFlow Duo.';
  end if;

  select count(*), count(*) filter (where member_role = 'admin'), count(*) filter (where member_role = 'member')
    into v_active_count, v_admin_count, v_member_count
  from private.authorized_emails
  where workspace_id = v_workspace_id and is_active;
  if v_active_count <> 2 or v_admin_count <> 1 or v_member_count <> 1 then
    raise exception using errcode = '55000', message = 'The private two-member allowlist is not fully provisioned.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, member_role, is_active)
  values (v_workspace_id, new.id, v_member_role, true)
  on conflict (workspace_id, user_id) do update
    set member_role = excluded.member_role, is_active = true;

  v_display_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(v_email, '@', 1));
  insert into public.profiles (user_id, workspace_id, display_name)
  values (new.id, v_workspace_id, left(v_display_name, 80))
  on conflict (user_id) do nothing;

  insert into public.notification_preferences (user_id, workspace_id)
  values (new.id, v_workspace_id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
drop trigger if exists smartflow_authorize_auth_user on auth.users;
create trigger smartflow_authorize_auth_user
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

create or replace function private.calculate_task_schedule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_time_zone text;
begin
  select w.time_zone into v_time_zone from public.workspaces w where w.id = new.workspace_id;
  if not found then
    raise exception using errcode = '23503', message = 'Task workspace does not exist.';
  end if;
  new.planned_start_at := (new.planned_date + new.scheduled_start_time) at time zone v_time_zone;
  new.planned_end_at := new.planned_start_at + make_interval(mins => new.duration_minutes);
  new.reminder_at := case
    when new.reminder_minutes is null then null
    else new.planned_start_at - make_interval(mins => new.reminder_minutes)
  end;
  return new;
end;
$$;
revoke all on function private.calculate_task_schedule() from public, anon, authenticated;

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
  if tg_op = 'UPDATE' then
    v_schedule_changed := old.planned_date is distinct from new.planned_date
      or old.scheduled_start_time is distinct from new.scheduled_start_time
      or old.duration_minutes is distinct from new.duration_minutes
      or old.reminder_minutes is distinct from new.reminder_minutes;

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
        concat(new.id, ':', v_member.user_id, ':upcoming:', new.version), greatest(clock_timestamp(), new.planned_start_at - interval '15 minutes'),
        jsonb_build_object('task_instance_id', new.id, 'title', new.title, 'planned_start_at', new.planned_start_at))
      on conflict (idempotency_key) do nothing;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.queue_task_notifications() from public, anon, authenticated;

create or replace function private.log_task_instance_creation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type, details)
  values (new.workspace_id, new.id, new.created_by,
    case when new.template_id is null then 'task_created' else 'daily_task_generated' end,
    jsonb_build_object('planned_date', new.planned_date, 'template_id', new.template_id, 'title', new.title));
  return new;
end;
$$;
revoke all on function private.log_task_instance_creation() from public, anon, authenticated;

create trigger work_lists_touch_updated_at before update on public.work_lists
for each row execute function private.touch_updated_at();
create trigger task_templates_touch_updated_at before update on public.task_templates
for each row execute function private.touch_updated_at();
create trigger task_instances_touch_updated_at before update on public.task_instances
for each row execute function private.touch_updated_at();
create trigger task_instances_calculate_schedule before insert or update of workspace_id, planned_date, scheduled_start_time, duration_minutes, reminder_minutes
on public.task_instances for each row execute function private.calculate_task_schedule();
create trigger task_instances_log_creation after insert on public.task_instances
for each row execute function private.log_task_instance_creation();
create trigger task_instances_queue_notifications after insert or update on public.task_instances
for each row execute function private.queue_task_notifications();

create or replace function public.ensure_daily_task_instances(p_start_date date default null, p_end_date date default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_time_zone text;
  v_from date;
  v_to date;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  select wm.workspace_id, w.time_zone into v_workspace_id, v_time_zone
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.';
  end if;

  v_to := coalesce(p_end_date, (clock_timestamp() at time zone v_time_zone)::date);
  v_from := coalesce(p_start_date, v_to);
  if v_from > v_to or v_to - v_from > 365 then
    raise exception using errcode = '22023', message = 'Daily generation range must be 1 to 366 days.';
  end if;

  insert into public.task_instances (
    workspace_id, template_id, work_list_id, planned_date, title, description, category, priority,
    scheduled_start_time, duration_minutes, reminder_minutes, status, created_by
  )
  select t.workspace_id, t.id, t.work_list_id, days.day_at::date, t.title, t.description, t.category, t.priority,
    t.scheduled_start_time, t.duration_minutes, t.reminder_minutes, 'pending', v_user_id
  from public.task_templates t
  cross join generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') as days(day_at)
  where t.workspace_id = v_workspace_id
    and t.is_active
    and days.day_at::date >= t.active_from
    and (t.active_until is null or days.day_at::date <= t.active_until)
    and extract(dow from days.day_at)::smallint = any(t.days_of_week)
  on conflict (template_id, planned_date) where template_id is not null do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function public.ensure_daily_task_instances(date, date) from public, anon;
grant execute on function public.ensure_daily_task_instances(date, date) to authenticated;

create or replace function public.create_task_instance(
  p_title text,
  p_description text,
  p_category text,
  p_priority text,
  p_planned_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_reminder_minutes integer,
  p_work_list_id uuid,
  p_creation_key uuid
)
returns public.task_instances
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_task public.task_instances%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_creation_key is null then raise exception using errcode = '22023', message = 'A retry-stable creation key is required.'; end if;
  select wm.workspace_id into v_workspace_id from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id) limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;
  if p_work_list_id is not null and not exists (
    select 1 from public.work_lists l where l.id = p_work_list_id and l.workspace_id = v_workspace_id and not l.is_archived
  ) then
    raise exception using errcode = '23503', message = 'The selected work list is unavailable.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'Task title must contain 1 to 200 characters.';
  end if;

  insert into public.task_instances (
    workspace_id, work_list_id, creation_key, planned_date, title, description, category, priority,
    scheduled_start_time, duration_minutes, reminder_minutes, status, created_by
  ) values (
    v_workspace_id, p_work_list_id, p_creation_key, p_planned_date, btrim(p_title), coalesce(p_description, ''),
    coalesce(nullif(btrim(p_category), ''), 'work'), coalesce(nullif(p_priority, ''), 'medium'),
    p_start_time, p_duration_minutes, p_reminder_minutes, 'pending', v_user_id
  ) on conflict (creation_key) do nothing;

  select * into v_task from public.task_instances where creation_key = p_creation_key;
  if v_task.workspace_id <> v_workspace_id then
    raise exception using errcode = '23505', message = 'Creation key is already used by another workspace.';
  end if;
  return v_task;
end;
$$;
revoke all on function public.create_task_instance(text, text, text, text, date, time, integer, integer, uuid, uuid) from public, anon;
grant execute on function public.create_task_instance(text, text, text, text, date, time, integer, integer, uuid, uuid) to authenticated;

create or replace function public.update_task_schedule(
  p_task_id uuid,
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
  v_previous public.task_instances%rowtype;
  v_duplicate_task_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_expected_version is null then raise exception using errcode = '22023', message = 'An expected version is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'An operation id is required for safe retry.'; end if;
  select task_instance_id into v_duplicate_task_id from public.task_time_events where actor_id = v_user_id and operation_id = p_operation_id;
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
    raise exception using errcode = '40001', message = 'TASK_VERSION_CONFLICT: reload before applying the schedule change.';
  end if;
  v_previous := v_task;
  update public.task_instances set
    planned_date = p_planned_date,
    scheduled_start_time = p_start_time,
    duration_minutes = p_duration_minutes,
    reminder_minutes = p_reminder_minutes,
    version = version + 1
  where id = p_task_id returning * into v_task;

  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, p_operation_id, 'schedule_changed', jsonb_build_object(
    'before', jsonb_build_object('planned_date', v_previous.planned_date, 'start_time', v_previous.scheduled_start_time, 'duration_minutes', v_previous.duration_minutes, 'reminder_minutes', v_previous.reminder_minutes),
    'after', jsonb_build_object('planned_date', v_task.planned_date, 'start_time', v_task.scheduled_start_time, 'duration_minutes', v_task.duration_minutes, 'reminder_minutes', v_task.reminder_minutes)
  ));
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, 'schedule_changed', jsonb_build_object('version', v_task.version));
  return v_task;
end;
$$;
revoke all on function public.update_task_schedule(uuid, date, time, integer, integer, integer, uuid) from public, anon;
grant execute on function public.update_task_schedule(uuid, date, time, integer, integer, integer, uuid) to authenticated;

create or replace function public.start_task_timer(p_task_id uuid, p_operation_id uuid)
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
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'An operation id is required for safe retry.'; end if;
  select task_instance_id into v_duplicate_task_id from public.task_time_events where actor_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_duplicate_task_id <> p_task_id then raise exception using errcode = '23505', message = 'Operation id was reused for another task.'; end if;
    select * into v_task from public.task_instances where id = p_task_id;
    return v_task;
  end if;
  select * into v_task from public.task_instances where id = p_task_id for update;
  if not found or v_task.deleted_at is not null or not private.is_workspace_member(v_task.workspace_id) then raise exception using errcode = '42501', message = 'Task is unavailable to this user.'; end if;

  if v_task.status = 'completed' then
    update public.task_instances set status = 'in_progress', actual_started_at = v_now, actual_completed_at = null,
      accumulated_seconds = 0, running_since = v_now, version = version + 1 where id = p_task_id returning * into v_task;
  elsif v_task.status in ('in_progress', 'overdue') and v_task.running_since is not null then
    return v_task;
  elsif v_task.status in ('pending', 'overdue') then
    update public.task_instances set status = case when planned_end_at <= v_now then 'overdue' else 'in_progress' end,
      actual_started_at = coalesce(actual_started_at, v_now), running_since = coalesce(running_since, v_now),
      version = version + 1 where id = p_task_id returning * into v_task;
  elsif v_task.running_since is null then
    update public.task_instances set running_since = v_now, version = version + 1 where id = p_task_id returning * into v_task;
  else
    return v_task;
  end if;
  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type)
  values (v_task.workspace_id, v_task.id, v_user_id, p_operation_id, 'started');
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type)
  values (v_task.workspace_id, v_task.id, v_user_id, 'timer_started');
  return v_task;
end;
$$;
revoke all on function public.start_task_timer(uuid, uuid) from public, anon;
grant execute on function public.start_task_timer(uuid, uuid) to authenticated;

create or replace function public.pause_task_timer(p_task_id uuid, p_operation_id uuid)
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
  v_delta bigint;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'An operation id is required for safe retry.'; end if;
  select task_instance_id into v_duplicate_task_id from public.task_time_events where actor_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_duplicate_task_id <> p_task_id then raise exception using errcode = '23505', message = 'Operation id was reused for another task.'; end if;
    select * into v_task from public.task_instances where id = p_task_id;
    return v_task;
  end if;
  select * into v_task from public.task_instances where id = p_task_id for update;
  if not found or v_task.deleted_at is not null or not private.is_workspace_member(v_task.workspace_id) then raise exception using errcode = '42501', message = 'Task is unavailable to this user.'; end if;
  if v_task.running_since is null or v_task.status not in ('in_progress', 'overdue') then return v_task; end if;

  v_delta := greatest(0, floor(extract(epoch from (v_now - v_task.running_since)))::bigint);
  update public.task_instances set accumulated_seconds = accumulated_seconds + v_delta,
    running_since = null, version = version + 1 where id = p_task_id returning * into v_task;
  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, p_operation_id, 'paused', jsonb_build_object('segment_seconds', v_delta));
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, 'timer_paused', jsonb_build_object('segment_seconds', v_delta));
  return v_task;
end;
$$;
revoke all on function public.pause_task_timer(uuid, uuid) from public, anon;
grant execute on function public.pause_task_timer(uuid, uuid) to authenticated;

create or replace function public.resume_task_timer(p_task_id uuid, p_operation_id uuid)
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
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'An operation id is required for safe retry.'; end if;
  select task_instance_id into v_duplicate_task_id from public.task_time_events where actor_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_duplicate_task_id <> p_task_id then raise exception using errcode = '23505', message = 'Operation id was reused for another task.'; end if;
    select * into v_task from public.task_instances where id = p_task_id;
    return v_task;
  end if;
  select * into v_task from public.task_instances where id = p_task_id for update;
  if not found or v_task.deleted_at is not null or not private.is_workspace_member(v_task.workspace_id) then raise exception using errcode = '42501', message = 'Task is unavailable to this user.'; end if;
  if v_task.status = 'completed' then raise exception using errcode = '22023', message = 'A completed task must be reopened before resuming.'; end if;
  if v_task.status not in ('in_progress', 'overdue') then
    raise exception using errcode = '22023', message = 'Only a paused in-progress task can be resumed.';
  end if;
  if v_task.running_since is not null then return v_task; end if;

  update public.task_instances set status = case when planned_end_at <= v_now then 'overdue' else 'in_progress' end,
    actual_started_at = coalesce(actual_started_at, v_now), running_since = v_now,
    version = version + 1 where id = p_task_id returning * into v_task;
  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type)
  values (v_task.workspace_id, v_task.id, v_user_id, p_operation_id, 'resumed');
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type)
  values (v_task.workspace_id, v_task.id, v_user_id, 'timer_resumed');
  return v_task;
end;
$$;
revoke all on function public.resume_task_timer(uuid, uuid) from public, anon;
grant execute on function public.resume_task_timer(uuid, uuid) to authenticated;

create or replace function public.set_task_status(p_task_id uuid, p_target_status text, p_expected_version integer, p_operation_id uuid)
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
  v_delta bigint := 0;
  v_event text;
  v_previous_status text;
  v_was_running boolean := false;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_target_status is null or p_target_status not in ('pending', 'in_progress', 'completed') then raise exception using errcode = '22023', message = 'Unsupported target status.'; end if;
  if p_expected_version is null then raise exception using errcode = '22023', message = 'An expected version is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'An operation id is required for safe retry.'; end if;
  select task_instance_id into v_duplicate_task_id from public.task_time_events where actor_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_duplicate_task_id <> p_task_id then raise exception using errcode = '23505', message = 'Operation id was reused for another task.'; end if;
    select * into v_task from public.task_instances where id = p_task_id;
    return v_task;
  end if;
  select * into v_task from public.task_instances where id = p_task_id for update;
  if not found or v_task.deleted_at is not null or not private.is_workspace_member(v_task.workspace_id) then raise exception using errcode = '42501', message = 'Task is unavailable to this user.'; end if;
  if v_task.version <> p_expected_version then raise exception using errcode = '40001', message = 'TASK_VERSION_CONFLICT: reload before changing task status.'; end if;
  v_previous_status := v_task.status;
  v_was_running := v_task.running_since is not null;

  if v_task.status = 'completed' and p_target_status = 'completed' then return v_task; end if;
  if v_task.running_since is not null then
    v_delta := greatest(0, floor(extract(epoch from (v_now - v_task.running_since)))::bigint);
  end if;

  if p_target_status = 'completed' then
    update public.task_instances set status = 'completed',
      accumulated_seconds = accumulated_seconds + v_delta, running_since = null, actual_completed_at = v_now,
      version = version + 1 where id = p_task_id returning * into v_task;
    v_event := 'completed';
  elsif p_target_status = 'pending' then
    update public.task_instances set status = 'pending', accumulated_seconds = 0, running_since = null,
      actual_started_at = null, actual_completed_at = null, version = version + 1
      where id = p_task_id returning * into v_task;
    v_event := case when v_previous_status = 'completed' then 'reopened' else 'reset_pending' end;
  else
    if v_previous_status in ('in_progress', 'overdue') and v_was_running then
      return v_task;
    elsif v_previous_status = 'completed' then
      update public.task_instances set status = 'in_progress', actual_started_at = v_now, actual_completed_at = null,
        accumulated_seconds = 0, running_since = v_now, version = version + 1
        where id = p_task_id returning * into v_task;
      v_event := 'reopened';
    else
      update public.task_instances set status = case when planned_end_at <= v_now then 'overdue' else 'in_progress' end,
        accumulated_seconds = accumulated_seconds + v_delta,
        actual_started_at = coalesce(actual_started_at, v_now), actual_completed_at = null,
        running_since = v_now, version = version + 1
        where id = p_task_id returning * into v_task;
      v_event := case when v_previous_status in ('in_progress', 'overdue') then 'resumed' else 'started' end;
    end if;
  end if;

  insert into public.task_time_events (workspace_id, task_instance_id, actor_id, operation_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, p_operation_id, v_event, jsonb_build_object('status', v_task.status, 'segment_seconds', v_delta));
  insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type, details)
  values (v_task.workspace_id, v_task.id, v_user_id, v_event, jsonb_build_object('status', v_task.status));
  return v_task;
end;
$$;
revoke all on function public.set_task_status(uuid, text, integer, uuid) from public, anon;
grant execute on function public.set_task_status(uuid, text, integer, uuid) to authenticated;

create or replace function public.refresh_overdue_tasks()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_task public.task_instances%rowtype;
  v_updated public.task_instances%rowtype;
  v_count integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  select wm.workspace_id into v_workspace_id from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id) limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;

  for v_task in
    select * from public.task_instances
    where workspace_id = v_workspace_id and deleted_at is null and status in ('pending', 'in_progress') and planned_end_at <= clock_timestamp()
    for update
  loop
    update public.task_instances set status = 'overdue', version = version + 1
    where id = v_task.id returning * into v_updated;
    insert into public.activity_events (workspace_id, task_instance_id, actor_id, event_type)
    values (v_workspace_id, v_task.id, v_user_id, 'marked_overdue');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.refresh_overdue_tasks() from public, anon;
grant execute on function public.refresh_overdue_tasks() to authenticated;

create or replace view public.task_instance_clock
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

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.profiles enable row level security;
alter table public.work_lists enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_instances enable row level security;
alter table public.task_time_events enable row level security;
alter table public.activity_events enable row level security;
alter table public.notification_preferences enable row level security;

create policy workspaces_member_read on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy profiles_member_read on public.profiles for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy profiles_self_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid() and private.is_workspace_member(workspace_id));
create policy profiles_self_update on public.profiles for update to authenticated
  using (user_id = auth.uid() and private.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and private.is_workspace_member(workspace_id));

create policy work_lists_member_read on public.work_lists for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy work_lists_member_insert on public.work_lists for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and (created_by is null or created_by = auth.uid()));
create policy work_lists_member_update on public.work_lists for update to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy work_lists_member_delete on public.work_lists for delete to authenticated
  using (private.is_workspace_member(workspace_id));

create policy task_templates_member_read on public.task_templates for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy task_templates_member_insert on public.task_templates for insert to authenticated
  with check (private.is_workspace_member(workspace_id) and (created_by is null or created_by = auth.uid()));
create policy task_templates_member_update on public.task_templates for update to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
create policy task_templates_member_delete on public.task_templates for delete to authenticated
  using (private.is_workspace_member(workspace_id));

create policy task_instances_member_read on public.task_instances for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy task_time_events_member_read on public.task_time_events for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy activity_events_member_read on public.activity_events for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy notification_preferences_self_read on public.notification_preferences for select to authenticated
  using (user_id = auth.uid() and private.is_workspace_member(workspace_id));
create policy notification_preferences_self_insert on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid() and private.is_workspace_member(workspace_id));
create policy notification_preferences_self_update on public.notification_preferences for update to authenticated
  using (user_id = auth.uid() and private.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and private.is_workspace_member(workspace_id));

revoke all on public.workspaces, public.workspace_members, public.profiles,
  public.work_lists, public.task_templates, public.task_instances,
  public.task_time_events, public.activity_events, public.notification_preferences
  from anon, authenticated;
grant select on public.workspaces, public.workspace_members, public.profiles,
  public.work_lists, public.task_templates, public.task_instances,
  public.task_time_events, public.activity_events, public.notification_preferences
  to authenticated;
grant insert, update, delete on public.work_lists, public.task_templates to authenticated;
grant insert, update on public.profiles, public.notification_preferences to authenticated;
grant select on public.task_instance_clock to authenticated;

commit;
