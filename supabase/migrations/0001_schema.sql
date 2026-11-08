-- Domma CRM · 0001 · schema, helpers e RLS
create extension if not exists pgcrypto with schema extensions;

-- ============ Núcleo: pessoas e organizações ============
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  segment text,
  plan text not null default 'essencial',
  status text not null default 'trial' check (status in ('trial','active','overdue','suspended','canceled')),
  parent_id uuid references public.organizations(id),
  settings jsonb not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('admin','member','limited','guest')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships(user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  email text not null,
  role text not null default 'member',
  invited_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index on public.invitations(lower(email));

create table public.platform_admins (user_id uuid primary key references public.profiles on delete cascade);
create table public.platform_admin_emails (email text primary key);

-- ============ Boards, fases, campos ============
create table public.boards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  icon text not null default '📋',
  color text not null default '#5B3FE6',
  description text,
  visibility text not null default 'org' check (visibility in ('org','private')),
  settings jsonb not null default '{}',
  webhook_token text not null unique default encode(extensions.gen_random_bytes(16),'hex'),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.boards(org_id);

create table public.board_members (
  board_id uuid not null references public.boards on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  primary key (board_id, user_id)
);
create table public.board_favorites (
  board_id uuid not null references public.boards on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  primary key (board_id, user_id)
);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  board_id uuid not null references public.boards on delete cascade,
  name text not null,
  color text not null default '#5B3FE6',
  description text check (char_length(description) <= 10000),
  position int not null default 0,
  is_final boolean not null default false,
  sla_value int,
  sla_unit text check (sla_unit in ('minutes','hours','days')),
  auto_assignees uuid[] not null default '{}',
  distribution text not null default 'all' check (distribution in ('all','sequential')),
  replace_assignees boolean not null default false,
  always_assign boolean not null default false,
  rr_index int not null default 0,
  totalizer jsonb,
  allowed_moves uuid[],
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.phases(board_id);

create table public.databases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  icon text not null default '🗂️',
  color text not null default '#7B61FF',
  settings jsonb not null default '{}',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.databases(org_id);

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  board_id uuid references public.boards on delete cascade,
  database_id uuid references public.databases on delete cascade,
  phase_id uuid references public.phases on delete cascade,
  type text not null,
  label text not null,
  description text,
  help text,
  required boolean not null default false,
  editable boolean not null default true,
  unique_value boolean not null default false,
  unique_open_only boolean not null default false,
  integrated_key text,
  regex text,
  options jsonb not null default '{}',
  position int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (board_id is not null or database_id is not null)
);
create index on public.fields(board_id);
create index on public.fields(database_id);

create table public.field_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  board_id uuid references public.boards on delete cascade,
  database_id uuid references public.databases on delete cascade,
  phase_id uuid references public.phases on delete cascade,
  name text not null,
  conditions jsonb not null default '[]',
  match text not null default 'and' check (match in ('and','or')),
  true_actions jsonb not null default '[]',
  false_actions jsonb not null default '[]',
  mirror boolean not null default true,
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  board_id uuid not null references public.boards on delete cascade,
  name text not null,
  color text not null default '#5B3FE6',
  deleted_at timestamptz
);

-- ============ Cards ============
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  board_id uuid not null references public.boards on delete cascade,
  phase_id uuid references public.phases,
  title text,
  data jsonb not null default '{}',
  due_at timestamptz,
  created_by uuid references public.profiles(id),
  created_via text not null default 'manual',
  phase_entered_at timestamptz not null default now(),
  finished_at timestamptz,
  first_contact_at timestamptz,
  due_alerted_at timestamptz,
  overdue_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.cards(board_id, phase_id);
create index on public.cards using gin (data jsonb_path_ops);
create index on public.cards(org_id);

create table public.card_assignees (
  card_id uuid not null references public.cards on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
create index on public.card_assignees(user_id);
create table public.card_tags (
  card_id uuid not null references public.cards on delete cascade,
  tag_id uuid not null references public.tags on delete cascade,
  primary key (card_id, tag_id)
);
create table public.card_phase_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  card_id uuid not null references public.cards on delete cascade,
  phase_id uuid references public.phases on delete set null,
  entered_at timestamptz not null default now(),
  left_at timestamptz,
  entered_by uuid,
  data_snapshot jsonb
);
create index on public.card_phase_history(card_id);
create table public.card_events (
  id bigserial primary key,
  org_id uuid not null,
  board_id uuid,
  card_id uuid references public.cards on delete cascade,
  actor uuid,
  type text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.card_events(card_id);
create index on public.card_events(board_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  card_id uuid not null references public.cards on delete cascade,
  author uuid not null references public.profiles(id),
  body text not null,
  mentions uuid[] not null default '{}',
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.comments(card_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  card_id uuid not null references public.cards on delete cascade,
  title text not null,
  assignee uuid references public.profiles(id),
  due_at timestamptz,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index on public.tasks(card_id);

create table public.card_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  card_id uuid not null references public.cards on delete cascade,
  path text not null,
  name text not null,
  size bigint,
  mime text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

-- ============ Databases (registros) ============
create table public.records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  database_id uuid not null references public.databases on delete cascade,
  title text,
  data jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','disabled')),
  disabled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.records(database_id);
create index on public.records using gin (data jsonb_path_ops);

create table public.seq_counters (field_id uuid primary key references public.fields on delete cascade, n int not null);

-- ============ Automações, relatórios, integrações, logs ============
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  board_id uuid not null references public.boards on delete cascade,
  name text not null,
  enabled boolean not null default true,
  event text not null,
  event_config jsonb not null default '{}',
  conditions jsonb not null default '[]',
  match text not null default 'and',
  actions jsonb not null default '[]',
  created_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.automations(board_id);
create table public.automation_runs (
  id bigserial primary key,
  org_id uuid not null,
  automation_id uuid references public.automations on delete cascade,
  card_id uuid,
  status text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index on public.automation_runs(automation_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  board_id uuid not null references public.boards on delete cascade,
  kind text not null default 'report' check (kind in ('report','filter')),
  name text not null,
  config jsonb not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table public.webhook_requests (
  id bigserial primary key,
  org_id uuid not null,
  board_id uuid references public.boards on delete cascade,
  payload jsonb,
  status text not null,
  card_id uuid,
  error text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigserial primary key,
  org_id uuid not null,
  actor uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  board_id uuid,
  summary text,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs(org_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  user_id uuid not null references public.profiles on delete cascade,
  type text not null,
  title text not null,
  body text,
  card_id uuid,
  board_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, created_at desc);

-- ============ Helpers de permissão ============
create or replace function public.actor_id() returns uuid
language sql stable as $$
  select coalesce(nullif(current_setting('app.actor', true), '')::uuid, auth.uid())
$$;

create or replace function public.org_role(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from memberships where org_id = p_org and user_id = public.actor_id()
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = public.actor_id())
$$;

create or replace function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = public.actor_id() and role = 'admin')
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = public.actor_id())
$$;

-- admin | member | limited | guest | viewer | null
create or replace function public.board_access(p_board uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare b record; r text; bm text; uid uuid := public.actor_id();
begin
  if uid is null then return null; end if;
  select org_id, visibility into b from boards where id = p_board;
  if not found then return null; end if;
  select role into r from memberships where org_id = b.org_id and user_id = uid;
  if r is null then return null; end if;
  if r = 'admin' then return 'admin'; end if;
  select role into bm from board_members where board_id = p_board and user_id = uid;
  if bm = 'admin' then return 'admin'; end if;
  if bm is not null then return r; end if;
  if r = 'member' and b.visibility = 'org' then return 'viewer'; end if;
  return null;
end $$;

create or replace function public.can_view_card(p_board uuid, p_card uuid, p_creator uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare acc text := public.board_access(p_board); s jsonb;
begin
  if acc is null then return false; end if;
  if acc = 'admin' then return true; end if;
  select settings into s from boards where id = p_board;
  if acc in ('member','viewer') and not coalesce((s->>'only_assignees')::boolean, false) then return true; end if;
  if p_creator = public.actor_id() then return true; end if;
  if exists (select 1 from card_assignees where card_id = p_card and user_id = public.actor_id()) then return true; end if;
  if acc = 'guest' and coalesce((s->>'guest_see_all')::boolean, false) then return true; end if;
  return false;
end $$;

create or replace function public.can_edit_card(p_board uuid, p_card uuid, p_creator uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare acc text := public.board_access(p_board); s jsonb;
begin
  if acc is null or acc in ('viewer','guest') then return false; end if;
  if acc = 'admin' then return true; end if;
  select settings into s from boards where id = p_board;
  if acc = 'member' and not coalesce((s->>'only_assignees')::boolean, false) then return true; end if;
  if p_creator = public.actor_id() then return true; end if;
  return exists (select 1 from card_assignees where card_id = p_card and user_id = public.actor_id());
end $$;

create or replace function public.can_view_card_id(p_card uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_view_card(board_id, id, created_by) from cards where id = p_card), false)
$$;
create or replace function public.can_edit_card_id(p_card uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.can_edit_card(board_id, id, created_by) from cards where id = p_card), false)
$$;

-- database access: admin | member | null
create or replace function public.db_access(p_db uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare d record; r text;
begin
  select org_id, created_by into d from databases where id = p_db;
  if not found then return null; end if;
  r := public.org_role(d.org_id);
  if r = 'admin' or (r = 'member' and d.created_by = public.actor_id()) then return 'admin'; end if;
  if r = 'member' then return 'member'; end if;
  return null;
end $$;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_admin_emails enable row level security;
alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.board_favorites enable row level security;
alter table public.phases enable row level security;
alter table public.databases enable row level security;
alter table public.fields enable row level security;
alter table public.field_rules enable row level security;
alter table public.tags enable row level security;
alter table public.cards enable row level security;
alter table public.card_assignees enable row level security;
alter table public.card_tags enable row level security;
alter table public.card_phase_history enable row level security;
alter table public.card_events enable row level security;
alter table public.comments enable row level security;
alter table public.tasks enable row level security;
alter table public.card_attachments enable row level security;
alter table public.records enable row level security;
alter table public.seq_counters enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.reports enable row level security;
alter table public.api_keys enable row level security;
alter table public.webhook_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create policy profiles_sel on public.profiles for select using (
  id = auth.uid() or public.is_platform_admin() or exists (
    select 1 from memberships m1 join memberships m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id));
create policy profiles_upd on public.profiles for update using (id = auth.uid());

create policy org_sel on public.organizations for select using (public.is_member(id) or public.is_platform_admin());
create policy org_upd on public.organizations for update using (public.is_org_admin(id) or public.is_platform_admin());

create policy mem_sel on public.memberships for select using (public.is_member(org_id) or public.is_platform_admin());
create policy mem_upd on public.memberships for update using (public.is_org_admin(org_id));
create policy mem_del on public.memberships for delete using (public.is_org_admin(org_id) or user_id = auth.uid());

create policy inv_sel on public.invitations for select using (public.is_org_admin(org_id) or public.is_platform_admin());
create policy inv_del on public.invitations for delete using (public.is_org_admin(org_id));

create policy pa_sel on public.platform_admins for select using (user_id = auth.uid());

create policy boards_sel on public.boards for select using (public.board_access(id) is not null);
create policy boards_upd on public.boards for update using (public.board_access(id) = 'admin') with check (public.board_access(id) = 'admin');

create policy bm_sel on public.board_members for select using (public.board_access(board_id) is not null);
create policy bm_ins on public.board_members for insert with check (public.board_access(board_id) = 'admin');
create policy bm_upd on public.board_members for update using (public.board_access(board_id) = 'admin');
create policy bm_del on public.board_members for delete using (public.board_access(board_id) = 'admin' or user_id = auth.uid());

create policy fav_all on public.board_favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.board_access(board_id) is not null);

create policy phases_sel on public.phases for select using (public.board_access(board_id) is not null);
create policy phases_ins on public.phases for insert with check (public.board_access(board_id) = 'admin');
create policy phases_upd on public.phases for update using (public.board_access(board_id) = 'admin');
create policy phases_del on public.phases for delete using (public.board_access(board_id) = 'admin');

create policy tags_sel on public.tags for select using (public.board_access(board_id) is not null);
create policy tags_ins on public.tags for insert with check (public.board_access(board_id) in ('admin','member'));
create policy tags_upd on public.tags for update using (public.board_access(board_id) = 'admin');

create policy fields_sel on public.fields for select using (
  (board_id is not null and public.board_access(board_id) is not null) or
  (database_id is not null and public.db_access(database_id) is not null));
create policy fields_ins on public.fields for insert with check (
  (board_id is not null and public.board_access(board_id) = 'admin') or
  (database_id is not null and public.db_access(database_id) = 'admin'));
create policy fields_upd on public.fields for update using (
  (board_id is not null and public.board_access(board_id) = 'admin') or
  (database_id is not null and public.db_access(database_id) = 'admin'));

create policy rules_sel on public.field_rules for select using (
  (board_id is not null and public.board_access(board_id) is not null) or
  (database_id is not null and public.db_access(database_id) is not null));
create policy rules_write on public.field_rules for all using (
  (board_id is not null and public.board_access(board_id) = 'admin') or
  (database_id is not null and public.db_access(database_id) = 'admin'))
  with check (
  (board_id is not null and public.board_access(board_id) = 'admin') or
  (database_id is not null and public.db_access(database_id) = 'admin'));

create policy cards_sel on public.cards for select using (public.can_view_card(board_id, id, created_by));

create policy ca_sel on public.card_assignees for select using (public.can_view_card_id(card_id));
create policy ca_ins on public.card_assignees for insert with check (public.can_edit_card_id(card_id));
create policy ca_del on public.card_assignees for delete using (public.can_edit_card_id(card_id));
create policy ct_sel on public.card_tags for select using (public.can_view_card_id(card_id));
create policy ct_ins on public.card_tags for insert with check (public.can_edit_card_id(card_id));
create policy ct_del on public.card_tags for delete using (public.can_edit_card_id(card_id));

create policy cph_sel on public.card_phase_history for select using (public.can_view_card_id(card_id));
create policy ce_sel on public.card_events for select using (public.can_view_card_id(card_id));

create policy com_sel on public.comments for select using (public.can_view_card_id(card_id));
create policy com_ins on public.comments for insert with check (author = auth.uid() and public.can_view_card_id(card_id));
create policy com_upd on public.comments for update using (author = auth.uid());

create policy tasks_sel on public.tasks for select using (public.can_view_card_id(card_id));
create policy tasks_ins on public.tasks for insert with check (public.can_edit_card_id(card_id));
create policy tasks_upd on public.tasks for update using (public.can_edit_card_id(card_id) or assignee = auth.uid());
create policy tasks_del on public.tasks for delete using (public.can_edit_card_id(card_id));

create policy att_sel on public.card_attachments for select using (public.can_view_card_id(card_id));
create policy att_ins on public.card_attachments for insert with check (public.can_edit_card_id(card_id));
create policy att_del on public.card_attachments for delete using (public.can_edit_card_id(card_id));

create policy db_sel on public.databases for select using (public.db_access(id) is not null);
create policy db_ins on public.databases for insert with check (
  public.org_role(org_id) = 'admin' or (public.org_role(org_id) = 'member' and
  not coalesce(((select settings from organizations where id = org_id)->>'admins_only_databases')::boolean, false)));
create policy db_upd on public.databases for update using (public.db_access(id) = 'admin');

create policy rec_sel on public.records for select using (
  public.db_access(database_id) is not null and (
    public.db_access(database_id) = 'admin' or created_by = auth.uid() or
    not coalesce(((select settings from databases where id = database_id)->>'limited_view')::boolean, false)));
create policy rec_ins on public.records for insert with check (public.db_access(database_id) is not null);
create policy rec_upd on public.records for update using (
  public.db_access(database_id) = 'admin' or created_by = auth.uid() or
  (public.db_access(database_id) = 'member' and not coalesce(((select settings from databases where id = database_id)->>'limited_view')::boolean, false)));

create policy auto_sel on public.automations for select using (public.board_access(board_id) is not null);
create policy auto_write on public.automations for all using (public.board_access(board_id) = 'admin') with check (public.board_access(board_id) = 'admin');
create policy runs_sel on public.automation_runs for select using (public.is_org_admin(org_id) or exists (
  select 1 from automations a where a.id = automation_id and public.board_access(a.board_id) = 'admin'));

create policy rep_sel on public.reports for select using (public.board_access(board_id) is not null);
create policy rep_ins on public.reports for insert with check (public.board_access(board_id) in ('admin','member','limited'));
create policy rep_upd on public.reports for update using (created_by = auth.uid() or public.board_access(board_id) = 'admin');
create policy rep_del on public.reports for delete using (created_by = auth.uid() or public.board_access(board_id) = 'admin');

create policy keys_sel on public.api_keys for select using (user_id = auth.uid());
create policy keys_upd on public.api_keys for update using (user_id = auth.uid());

create policy wh_sel on public.webhook_requests for select using (public.board_access(board_id) = 'admin');

create policy audit_sel on public.audit_logs for select using (public.is_org_admin(org_id) or public.is_platform_admin());

create policy notif_sel on public.notifications for select using (user_id = auth.uid());
create policy notif_upd on public.notifications for update using (user_id = auth.uid());
create policy notif_del on public.notifications for delete using (user_id = auth.uid());
