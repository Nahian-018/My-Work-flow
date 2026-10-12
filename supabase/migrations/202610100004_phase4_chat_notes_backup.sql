-- SmartFlow Duo Phase 4 collaboration, notes, and safe backup/restore.
-- Apply after 001-003, only after reviewing supabase/README.md.
-- No user email, secret, or credential belongs in this migration.

begin;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_id uuid not null,
  client_operation_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default clock_timestamp(),
  unique (sender_id, client_operation_id),
  unique (id, workspace_id),
  foreign key (workspace_id, sender_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);
create index if not exists chat_messages_workspace_created_idx
  on public.chat_messages (workspace_id, created_at desc, id desc);

create table if not exists public.chat_read_receipts (
  message_id uuid not null,
  workspace_id uuid not null,
  reader_id uuid not null,
  read_at timestamptz not null default clock_timestamp(),
  primary key (message_id, reader_id),
  foreign key (message_id, workspace_id) references public.chat_messages(id, workspace_id) on delete cascade,
  foreign key (workspace_id, reader_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);
create index if not exists chat_read_receipts_workspace_reader_idx
  on public.chat_read_receipts (workspace_id, reader_id, read_at desc);

create table if not exists public.workspace_notes (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 10000),
  category text not null default 'general' check (char_length(btrim(category)) between 1 and 80),
  is_pinned boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (id, workspace_id),
  foreign key (workspace_id, owner_id) references public.workspace_members(workspace_id, user_id) on delete cascade
);
create index if not exists workspace_notes_workspace_updated_idx
  on public.workspace_notes (workspace_id, is_pinned desc, updated_at desc)
  where deleted_at is null;
create index if not exists workspace_notes_owner_updated_idx
  on public.workspace_notes (owner_id, updated_at desc)
  where deleted_at is null;

create table if not exists private.workspace_note_operation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  note_id uuid not null,
  action text not null check (action in ('upsert', 'delete')),
  request jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, operation_id)
);
alter table private.workspace_note_operation_receipts enable row level security;
revoke all on table private.workspace_note_operation_receipts from public, anon, authenticated;

create table if not exists private.backup_restore_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, operation_id)
);
alter table private.backup_restore_receipts enable row level security;
revoke all on table private.backup_restore_receipts from public, anon, authenticated;

-- Imported audit history is kept as an explicitly labelled archive, never
-- inserted as new authoritative activity attributed to the importing member.
create table if not exists public.workspace_history_archive (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  imported_by uuid not null references auth.users(id) on delete restrict,
  source_type text not null check (source_type in ('task_time_event', 'activity_event')),
  source_id uuid not null,
  source_at timestamptz,
  payload jsonb not null,
  imported_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, imported_by, source_type, source_id)
);
create index if not exists workspace_history_archive_workspace_idx
  on public.workspace_history_archive (workspace_id, imported_at desc);
alter table public.workspace_history_archive enable row level security;
drop policy if exists workspace_history_archive_member_read on public.workspace_history_archive;
create policy workspace_history_archive_member_read on public.workspace_history_archive for select to authenticated
  using (private.is_workspace_member(workspace_id));
revoke all on public.workspace_history_archive from public, anon, authenticated;
grant select on public.workspace_history_archive to authenticated;

alter table public.chat_messages enable row level security;
alter table public.chat_read_receipts enable row level security;
alter table public.workspace_notes enable row level security;

drop policy if exists chat_messages_member_read on public.chat_messages;
create policy chat_messages_member_read on public.chat_messages for select to authenticated
  using (private.is_workspace_member(workspace_id));
drop policy if exists chat_read_receipts_member_read on public.chat_read_receipts;
create policy chat_read_receipts_member_read on public.chat_read_receipts for select to authenticated
  using (private.is_workspace_member(workspace_id));
drop policy if exists workspace_notes_visible_read on public.workspace_notes;
create policy workspace_notes_visible_read on public.workspace_notes for select to authenticated
  using (
    deleted_at is null
    and private.is_workspace_member(workspace_id)
    and (visibility = 'shared' or owner_id = auth.uid())
  );

revoke all on public.chat_messages, public.chat_read_receipts, public.workspace_notes from public, anon, authenticated;
grant select on public.chat_messages, public.chat_read_receipts, public.workspace_notes to authenticated;

create or replace function public.send_chat_message(p_body text, p_operation_id uuid)
returns public.chat_messages
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_body text := btrim(coalesce(p_body, ''));
  v_message public.chat_messages%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_operation_id is null then raise exception using errcode = '22023', message = 'A stable operation id is required.'; end if;
  if char_length(v_body) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'Chat message must contain 1 to 5000 characters.';
  end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;

  insert into public.chat_messages (workspace_id, sender_id, client_operation_id, body)
  values (v_workspace_id, v_user_id, p_operation_id, v_body)
  on conflict (sender_id, client_operation_id) do nothing;
  select * into v_message from public.chat_messages
  where sender_id = v_user_id and client_operation_id = p_operation_id;
  if not found or v_message.workspace_id <> v_workspace_id or v_message.body <> v_body then
    raise exception using errcode = '23505', message = 'Chat operation id was already used for a different message.';
  end if;
  return v_message;
end;
$$;
revoke all on function public.send_chat_message(text, uuid) from public, anon;
grant execute on function public.send_chat_message(text, uuid) to authenticated;

create or replace function public.mark_chat_messages_read(p_message_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_marked integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if coalesce(cardinality(p_message_ids), 0) > 500 then
    raise exception using errcode = '22023', message = 'Read receipt batch is too large.';
  end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;

  insert into public.chat_read_receipts (message_id, workspace_id, reader_id)
  select m.id, m.workspace_id, v_user_id
  from public.chat_messages m
  where m.workspace_id = v_workspace_id
    and m.sender_id <> v_user_id
    and m.id = any(coalesce(p_message_ids, array[]::uuid[]))
  on conflict (message_id, reader_id) do nothing;
  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;
revoke all on function public.mark_chat_messages_read(uuid[]) from public, anon;
grant execute on function public.mark_chat_messages_read(uuid[]) to authenticated;

create or replace function public.get_chat_unread_count()
returns integer
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_count integer;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;
  select count(*)::integer into v_count
  from public.chat_messages m
  where m.workspace_id = v_workspace_id and m.sender_id <> v_user_id
    and not exists (select 1 from public.chat_read_receipts r where r.message_id = m.id and r.reader_id = v_user_id);
  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.get_chat_unread_count() from public, anon;
grant execute on function public.get_chat_unread_count() to authenticated;

create or replace function public.upsert_workspace_note(
  p_note_id uuid,
  p_title text,
  p_body text,
  p_category text,
  p_visibility text,
  p_is_pinned boolean,
  p_expected_version integer,
  p_operation_id uuid
)
returns public.workspace_notes
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_note public.workspace_notes%rowtype;
  v_prior private.workspace_note_operation_receipts%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := coalesce(p_body, '');
  v_category text := coalesce(nullif(btrim(p_category), ''), 'general');
  v_request jsonb;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_note_id is null or p_operation_id is null then
    raise exception using errcode = '22023', message = 'A note id and stable operation id are required.';
  end if;
  if char_length(v_title) not between 1 and 200 or char_length(v_body) > 10000
     or char_length(v_category) not between 1 and 80 or p_visibility not in ('private', 'shared') then
    raise exception using errcode = '22023', message = 'Note fields are invalid or exceed their limits.';
  end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;

  v_request := jsonb_build_object(
    'note_id', p_note_id, 'title', v_title, 'body', v_body, 'category', v_category,
    'visibility', p_visibility, 'is_pinned', coalesce(p_is_pinned, false), 'expected_version', p_expected_version
  );
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select * into v_prior from private.workspace_note_operation_receipts
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_prior.action <> 'upsert' or v_prior.note_id <> p_note_id or v_prior.request <> v_request then
      raise exception using errcode = '23505', message = 'Note operation id was reused for a different request.';
    end if;
    select * into v_note from public.workspace_notes where id = p_note_id and workspace_id = v_workspace_id;
    if not found then raise exception using errcode = '40001', message = 'NOTE_RESTORE_REQUIRED: note no longer exists.'; end if;
    return v_note;
  end if;

  if p_expected_version is null then
    insert into public.workspace_notes (id, workspace_id, owner_id, visibility, title, body, category, is_pinned)
    values (p_note_id, v_workspace_id, v_user_id, p_visibility, v_title, v_body, v_category, coalesce(p_is_pinned, false))
    returning * into v_note;
  else
    select * into v_note from public.workspace_notes n
    where n.id = p_note_id and n.workspace_id = v_workspace_id and n.deleted_at is null
      and (n.visibility = 'shared' or n.owner_id = v_user_id)
    for update;
    if not found then raise exception using errcode = '42501', message = 'Note is unavailable to this user.'; end if;
    if v_note.version <> p_expected_version then
      raise exception using errcode = '40001', message = 'NOTE_VERSION_CONFLICT: reload before applying note changes.';
    end if;
    if v_note.visibility = 'shared' and v_note.owner_id <> v_user_id and p_visibility <> 'shared' then
      raise exception using errcode = '42501', message = 'Only the note owner may make a shared note private.';
    end if;
    update public.workspace_notes set title = v_title, body = v_body, category = v_category,
      visibility = p_visibility, is_pinned = coalesce(p_is_pinned, false), version = version + 1,
      updated_at = clock_timestamp()
    where id = p_note_id and workspace_id = v_workspace_id
    returning * into v_note;
  end if;

  insert into private.workspace_note_operation_receipts (user_id, operation_id, note_id, action, request)
  values (v_user_id, p_operation_id, p_note_id, 'upsert', v_request);
  return v_note;
end;
$$;
revoke all on function public.upsert_workspace_note(uuid, text, text, text, text, boolean, integer, uuid) from public, anon;
grant execute on function public.upsert_workspace_note(uuid, text, text, text, text, boolean, integer, uuid) to authenticated;

create or replace function public.delete_workspace_note(p_note_id uuid, p_expected_version integer, p_operation_id uuid)
returns public.workspace_notes
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_note public.workspace_notes%rowtype;
  v_prior private.workspace_note_operation_receipts%rowtype;
  v_request jsonb;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_note_id is null or p_expected_version is null or p_operation_id is null then
    raise exception using errcode = '22023', message = 'A note id, expected version, and stable operation id are required.';
  end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;
  v_request := jsonb_build_object('note_id', p_note_id, 'expected_version', p_expected_version);
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select * into v_prior from private.workspace_note_operation_receipts
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_prior.action <> 'delete' or v_prior.note_id <> p_note_id or v_prior.request <> v_request then
      raise exception using errcode = '23505', message = 'Note operation id was reused for a different request.';
    end if;
    select * into v_note from public.workspace_notes where id = p_note_id and workspace_id = v_workspace_id;
    if not found then raise exception using errcode = '40001', message = 'NOTE_RESTORE_REQUIRED: note no longer exists.'; end if;
    return v_note;
  end if;

  select * into v_note from public.workspace_notes n
  where n.id = p_note_id and n.workspace_id = v_workspace_id and n.deleted_at is null
    and (n.visibility = 'shared' or n.owner_id = v_user_id)
  for update;
  if not found then raise exception using errcode = '42501', message = 'Note is unavailable to this user.'; end if;
  if v_note.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'NOTE_VERSION_CONFLICT: reload before deleting note.';
  end if;
  update public.workspace_notes set deleted_at = clock_timestamp(), updated_at = clock_timestamp(), version = version + 1
  where id = p_note_id and workspace_id = v_workspace_id returning * into v_note;
  insert into private.workspace_note_operation_receipts (user_id, operation_id, note_id, action, request)
  values (v_user_id, p_operation_id, p_note_id, 'delete', v_request);
  return v_note;
end;
$$;
revoke all on function public.delete_workspace_note(uuid, integer, uuid) from public, anon;
grant execute on function public.delete_workspace_note(uuid, integer, uuid) to authenticated;

create or replace function public.restore_workspace_backup(p_backup jsonb, p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_prior private.backup_restore_receipts%rowtype;
  v_item jsonb;
  v_row_count integer;
  v_result jsonb := jsonb_build_object('work_lists', 0, 'task_templates', 0, 'task_instances', 0,
    'workspace_notes', 0, 'history_archive', 0, 'preferences', 0);
  v_id uuid;
  v_template_id uuid;
  v_list_id uuid;
  v_created_at timestamptz;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  if p_operation_id is null or p_backup is null or jsonb_typeof(p_backup) <> 'object' then
    raise exception using errcode = '22023', message = 'A versioned backup and stable operation id are required.';
  end if;
  if p_backup ->> 'format' is distinct from 'smartflow-duo-backup'
     or jsonb_typeof(p_backup -> 'schema_version') <> 'number'
     or p_backup ->> 'schema_version' is distinct from '1' then
    raise exception using errcode = '22023', message = 'Backup format or schema version is unsupported.';
  end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;
  if p_backup ->> 'workspace_id' is distinct from v_workspace_id::text then
    raise exception using errcode = '42501', message = 'Backup belongs to another workspace.';
  end if;
  if pg_column_size(p_backup) > 10485760 or octet_length(p_backup::text) > 10485760 then
    raise exception using errcode = '22023', message = 'Backup exceeds the 10 MiB restore limit.';
  end if;
  if coalesce(jsonb_typeof(p_backup -> 'work_lists'), '') <> 'array'
     or coalesce(jsonb_typeof(p_backup -> 'task_templates'), '') <> 'array'
     or coalesce(jsonb_typeof(p_backup -> 'task_instances'), '') <> 'array'
     or coalesce(jsonb_typeof(p_backup -> 'workspace_notes'), '') <> 'array'
     or coalesce(jsonb_typeof(p_backup -> 'task_time_events'), '') <> 'array'
     or coalesce(jsonb_typeof(p_backup -> 'activity_events'), '') <> 'array'
     or coalesce(jsonb_typeof(p_backup -> 'history_archive'), '') <> 'array'
     or coalesce(jsonb_typeof(p_backup -> 'notification_preferences'), '') <> 'array' then
    raise exception using errcode = '22023', message = 'Backup collections have an invalid shape.';
  end if;
  if jsonb_array_length(p_backup -> 'work_lists') > 500
     or jsonb_array_length(p_backup -> 'task_templates') > 500
     or jsonb_array_length(p_backup -> 'task_instances') > 5000
     or jsonb_array_length(p_backup -> 'workspace_notes') > 500
     or jsonb_array_length(p_backup -> 'task_time_events') > 10000
     or jsonb_array_length(p_backup -> 'activity_events') > 10000
     or jsonb_array_length(p_backup -> 'history_archive') > 10000
     or jsonb_array_length(p_backup -> 'notification_preferences') > 1 then
    raise exception using errcode = '22023', message = 'Backup contains too many rows.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));
  select * into v_prior from private.backup_restore_receipts
  where user_id = v_user_id and operation_id = p_operation_id;
  if found then
    if v_prior.workspace_id <> v_workspace_id or v_prior.request is distinct from p_backup then
      raise exception using errcode = '23505', message = 'Restore operation id was reused for another backup.';
    end if;
    return v_prior.result;
  end if;

  for v_item in select value from jsonb_array_elements(p_backup -> 'work_lists') loop
    v_id := (v_item ->> 'id')::uuid;
    insert into public.work_lists (id, workspace_id, name, category, color, is_archived, created_by)
    values (v_id, v_workspace_id, btrim(v_item ->> 'name'), coalesce(nullif(btrim(v_item ->> 'category'), ''), 'work'),
      coalesce(v_item ->> 'color', 'blue'), coalesce((v_item ->> 'is_archived')::boolean, false), v_user_id)
    on conflict (id) do nothing;
    if found then v_result := jsonb_set(v_result, '{work_lists}', to_jsonb((v_result ->> 'work_lists')::integer + 1));
    elsif not exists (select 1 from public.work_lists l where l.id = v_id and l.workspace_id = v_workspace_id) then
      raise exception using errcode = '23505', message = 'A list id belongs to another workspace.';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'task_templates') loop
    v_id := (v_item ->> 'id')::uuid;
    v_list_id := nullif(v_item ->> 'work_list_id', '')::uuid;
    insert into public.task_templates (id, workspace_id, work_list_id, title, description, category, priority,
      days_of_week, active_from, active_until, scheduled_start_time, duration_minutes, reminder_minutes, is_active, created_by)
    values (v_id, v_workspace_id,
      case when exists (select 1 from public.work_lists l where l.id = v_list_id and l.workspace_id = v_workspace_id) then v_list_id else null end,
      btrim(v_item ->> 'title'), coalesce(v_item ->> 'description', ''),
      coalesce(nullif(btrim(v_item ->> 'category'), ''), 'work'), coalesce(v_item ->> 'priority', 'medium'),
      case when jsonb_typeof(v_item -> 'days_of_week') = 'array'
        then array(select value::smallint from jsonb_array_elements_text(v_item -> 'days_of_week'))
        else array[0,1,2,3,4,5,6]::smallint[] end,
      coalesce((v_item ->> 'active_from')::date, (clock_timestamp() at time zone 'Asia/Dhaka')::date),
      nullif(v_item ->> 'active_until', '')::date, coalesce((v_item ->> 'scheduled_start_time')::time, time '09:00'),
      coalesce((v_item ->> 'duration_minutes')::integer, 30), nullif(v_item ->> 'reminder_minutes', '')::integer,
      coalesce((v_item ->> 'is_active')::boolean, false), v_user_id)
    on conflict (id) do nothing;
    if found then v_result := jsonb_set(v_result, '{task_templates}', to_jsonb((v_result ->> 'task_templates')::integer + 1));
    elsif not exists (select 1 from public.task_templates t where t.id = v_id and t.workspace_id = v_workspace_id) then
      raise exception using errcode = '23505', message = 'A template id belongs to another workspace.';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'task_instances') loop
    v_id := (v_item ->> 'id')::uuid;
    v_template_id := nullif(v_item ->> 'template_id', '')::uuid;
    v_list_id := nullif(v_item ->> 'work_list_id', '')::uuid;
    if coalesce(v_item ->> 'deleted_at', '') <> '' then
      continue;
    end if;
    insert into public.task_instances (id, workspace_id, template_id, work_list_id, creation_key, planned_date, title,
      description, category, priority, scheduled_start_time, duration_minutes, reminder_minutes, status,
      actual_started_at, actual_completed_at, accumulated_seconds, running_since, created_by)
    values (v_id, v_workspace_id,
      case when exists (select 1 from public.task_templates t where t.id = v_template_id and t.workspace_id = v_workspace_id) then v_template_id else null end,
      case when exists (select 1 from public.work_lists l where l.id = v_list_id and l.workspace_id = v_workspace_id) then v_list_id else null end,
      nullif(v_item ->> 'creation_key', '')::uuid, (v_item ->> 'planned_date')::date,
      btrim(v_item ->> 'title'), coalesce(v_item ->> 'description', ''), coalesce(nullif(btrim(v_item ->> 'category'), ''), 'work'),
      coalesce(v_item ->> 'priority', 'medium'), (v_item ->> 'scheduled_start_time')::time,
      (v_item ->> 'duration_minutes')::integer, nullif(v_item ->> 'reminder_minutes', '')::integer,
      case when v_item ->> 'status' in ('pending', 'in_progress', 'completed', 'overdue') then v_item ->> 'status' else 'pending' end,
      nullif(v_item ->> 'actual_started_at', '')::timestamptz, nullif(v_item ->> 'actual_completed_at', '')::timestamptz,
      greatest(0, coalesce((v_item ->> 'accumulated_seconds')::bigint, 0)), null, v_user_id)
    on conflict (id) do nothing;
    if found then v_result := jsonb_set(v_result, '{task_instances}', to_jsonb((v_result ->> 'task_instances')::integer + 1));
    elsif not exists (select 1 from public.task_instances t where t.id = v_id and t.workspace_id = v_workspace_id) then
      raise exception using errcode = '23505', message = 'A task id belongs to another workspace.';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'workspace_notes') loop
    if v_item ->> 'visibility' = 'private' and nullif(v_item ->> 'owner_id', '')::uuid <> v_user_id then
      continue;
    end if;
    v_id := (v_item ->> 'id')::uuid;
    insert into public.workspace_notes (id, workspace_id, owner_id, visibility, title, body, category, is_pinned)
    values (v_id, v_workspace_id,
      case when v_item ->> 'visibility' = 'private' then v_user_id
        when exists (select 1 from public.workspace_members m where m.workspace_id = v_workspace_id and m.user_id = nullif(v_item ->> 'owner_id', '')::uuid) then (v_item ->> 'owner_id')::uuid
        else v_user_id end,
      case when v_item ->> 'visibility' = 'shared' then 'shared' else 'private' end,
      btrim(v_item ->> 'title'), coalesce(v_item ->> 'body', ''),
      coalesce(nullif(btrim(v_item ->> 'category'), ''), 'general'), coalesce((v_item ->> 'is_pinned')::boolean, false))
    on conflict (id) do nothing;
    if found then v_result := jsonb_set(v_result, '{workspace_notes}', to_jsonb((v_result ->> 'workspace_notes')::integer + 1));
    elsif exists (select 1 from public.workspace_notes n where n.id = v_id and n.workspace_id = v_workspace_id and n.deleted_at is null
      and (n.visibility = 'shared' or n.owner_id = v_user_id)) then
      null;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'task_time_events') loop
    v_id := (v_item ->> 'id')::uuid;
    insert into public.workspace_history_archive (workspace_id, imported_by, source_type, source_id, source_at, payload)
    values (v_workspace_id, v_user_id, 'task_time_event', v_id,
      nullif(v_item ->> 'event_at', '')::timestamptz, v_item)
    on conflict (workspace_id, imported_by, source_type, source_id) do nothing;
    if found then v_result := jsonb_set(v_result, '{history_archive}', to_jsonb((v_result ->> 'history_archive')::integer + 1)); end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'activity_events') loop
    v_id := (v_item ->> 'id')::uuid;
    insert into public.workspace_history_archive (workspace_id, imported_by, source_type, source_id, source_at, payload)
    values (v_workspace_id, v_user_id, 'activity_event', v_id,
      nullif(v_item ->> 'created_at', '')::timestamptz, v_item)
    on conflict (workspace_id, imported_by, source_type, source_id) do nothing;
    if found then v_result := jsonb_set(v_result, '{history_archive}', to_jsonb((v_result ->> 'history_archive')::integer + 1)); end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_backup -> 'history_archive') loop
    if v_item ->> 'source_type' not in ('task_time_event', 'activity_event') then continue; end if;
    v_id := (v_item ->> 'source_id')::uuid;
    insert into public.workspace_history_archive (workspace_id, imported_by, source_type, source_id, source_at, payload)
    values (v_workspace_id, v_user_id, v_item ->> 'source_type', v_id,
      nullif(v_item ->> 'source_at', '')::timestamptz, coalesce(v_item -> 'payload', v_item))
    on conflict (workspace_id, imported_by, source_type, source_id) do nothing;
    if found then v_result := jsonb_set(v_result, '{history_archive}', to_jsonb((v_result ->> 'history_archive')::integer + 1)); end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_backup -> 'notification_preferences', '[]'::jsonb)) loop
    if v_item ->> 'user_id' is distinct from v_user_id::text then continue; end if;
    insert into public.notification_preferences (user_id, workspace_id, pre_start_enabled, task_start_enabled,
      overdue_enabled, upcoming_enabled, daily_summary_enabled, daily_summary_time,
      quiet_hours_enabled, quiet_hours_start, quiet_hours_end)
    values (v_user_id, v_workspace_id, coalesce((v_item ->> 'pre_start_enabled')::boolean, true),
      coalesce((v_item ->> 'task_start_enabled')::boolean, true), coalesce((v_item ->> 'overdue_enabled')::boolean, true),
      coalesce((v_item ->> 'upcoming_enabled')::boolean, true), coalesce((v_item ->> 'daily_summary_enabled')::boolean, true),
      coalesce((v_item ->> 'daily_summary_time')::time, time '20:00'), coalesce((v_item ->> 'quiet_hours_enabled')::boolean, false),
      coalesce((v_item ->> 'quiet_hours_start')::time, time '22:00'), coalesce((v_item ->> 'quiet_hours_end')::time, time '08:00'))
    on conflict (user_id) do update set pre_start_enabled = excluded.pre_start_enabled,
      task_start_enabled = excluded.task_start_enabled, overdue_enabled = excluded.overdue_enabled,
      upcoming_enabled = excluded.upcoming_enabled, daily_summary_enabled = excluded.daily_summary_enabled,
      daily_summary_time = excluded.daily_summary_time, quiet_hours_enabled = excluded.quiet_hours_enabled,
      quiet_hours_start = excluded.quiet_hours_start, quiet_hours_end = excluded.quiet_hours_end,
      updated_at = clock_timestamp();
    v_result := jsonb_set(v_result, '{preferences}', to_jsonb(1));
  end loop;

  insert into private.backup_restore_receipts (user_id, operation_id, workspace_id, request, result)
  values (v_user_id, p_operation_id, v_workspace_id, p_backup, v_result);
  return v_result;
end;
$$;
revoke all on function public.restore_workspace_backup(jsonb, uuid) from public, anon;
grant execute on function public.restore_workspace_backup(jsonb, uuid) to authenticated;

-- An unbounded server-side aggregate keeps dashboard counts accurate even if
-- the browser's paged task cache reaches its 500-row limit.
create or replace function public.get_dashboard_summary()
returns table (
  today date,
  total integer,
  completed integer,
  pending integer,
  in_progress integer,
  overdue integer,
  completion_rate integer,
  upcoming jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_now timestamptz := clock_timestamp();
  v_today date;
  v_total integer := 0;
  v_completed integer := 0;
  v_pending integer := 0;
  v_in_progress integer := 0;
  v_overdue integer := 0;
  v_upcoming jsonb := '[]'::jsonb;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Authentication is required.'; end if;
  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.is_active and private.is_workspace_member(wm.workspace_id)
  limit 1;
  if not found then raise exception using errcode = '42501', message = 'No active SmartFlow workspace membership.'; end if;
  v_today := (v_now at time zone 'Asia/Dhaka')::date;

  select count(*)::integer,
    count(*) filter (where ti.status = 'completed')::integer,
    count(*) filter (where ti.status = 'pending' and ti.planned_end_at > v_now)::integer,
    count(*) filter (where ti.status = 'in_progress' and ti.planned_end_at > v_now)::integer
  into v_total, v_completed, v_pending, v_in_progress
  from public.task_instances ti
  where ti.workspace_id = v_workspace_id and ti.planned_date = v_today and ti.deleted_at is null;

  select count(*)::integer into v_overdue
  from public.task_instances ti
  where ti.workspace_id = v_workspace_id and ti.deleted_at is null and ti.status <> 'completed'
    and (ti.status = 'overdue' or ti.planned_end_at <= v_now);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'category', t.category, 'priority', t.priority,
    'duration_minutes', t.duration_minutes, 'status', t.status,
    'planned_start_at', t.planned_start_at, 'planned_end_at', t.planned_end_at,
    'actual_started_at', t.actual_started_at, 'accumulated_seconds', t.accumulated_seconds,
    'running_since', t.running_since
  ) order by t.planned_start_at), '[]'::jsonb)
  into v_upcoming
  from (
    select ti.id, ti.title, ti.category, ti.priority, ti.duration_minutes, ti.status,
      ti.planned_start_at, ti.planned_end_at, ti.actual_started_at, ti.accumulated_seconds, ti.running_since
    from public.task_instances ti
    where ti.workspace_id = v_workspace_id and ti.deleted_at is null
      and ti.status in ('pending', 'in_progress') and ti.planned_start_at > v_now and ti.planned_end_at > v_now
    order by ti.planned_start_at
    limit 8
  ) t;

  today := v_today;
  total := v_total;
  completed := v_completed;
  pending := v_pending;
  in_progress := v_in_progress;
  overdue := v_overdue;
  completion_rate := case when v_total = 0 then 0 else round(v_completed * 100.0 / v_total)::integer end;
  upcoming := v_upcoming;
  return next;
end;
$$;
revoke all on function public.get_dashboard_summary() from public, anon;
grant execute on function public.get_dashboard_summary() to authenticated;

-- Realtime remains optional outside hosted Supabase. RLS still applies to reads.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
      execute 'alter publication supabase_realtime add table public.chat_messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_read_receipts') then
      execute 'alter publication supabase_realtime add table public.chat_read_receipts';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspace_notes') then
      execute 'alter publication supabase_realtime add table public.workspace_notes';
    end if;
  end if;
end;
$$;

commit;
