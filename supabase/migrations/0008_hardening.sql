-- Domma CRM · 0008 · endurecimento de permissões (advisors do Supabase)
-- funções de trigger e internas: ninguém chama pela API
revoke execute on function public._assignee_after(), public._cards_after(), public._cards_before(), public._cardtag_after(),
  public._comment_after(), public._on_auth_user(), public._records_after(), public._records_before(), public._struct_audit(),
  public._task_after(), public._map_payload(uuid, jsonb) from public, anon, authenticated;

-- RPCs da aplicação: só usuários logados
revoke execute on function
  public.admin_create_org(text,text,text,text,text,text,uuid), public.admin_orgs(), public.admin_update_org(uuid,text,text),
  public.board_access(uuid), public.can_edit_card(uuid,uuid,uuid), public.can_edit_card_id(uuid), public.can_view_card(uuid,uuid,uuid),
  public.can_view_card_id(uuid), public.create_api_key(uuid,text), public.create_board(uuid,text,text,text,text), public.create_card(uuid,jsonb,uuid,text),
  public.create_organization(text,text,text), public.db_access(uuid), public.delete_board(uuid), public.delete_cards(uuid[]), public.deleted_items(uuid),
  public.duplicate_board(uuid,text,uuid), public.duplicate_cards(uuid[]), public.import_cards(uuid,jsonb,uuid), public.invite_member(uuid,text,text),
  public.is_member(uuid), public.is_org_admin(uuid), public.is_platform_admin(), public.join_board(uuid), public.move_card(uuid,uuid,jsonb),
  public.org_role(uuid), public.record_cards(uuid), public.restore_item(text,uuid), public.update_card(uuid,jsonb,timestamptz,boolean),
  public.search_records(uuid,text,int), public.search_cards(uuid,text,int)
from public, anon;
grant execute on function
  public.admin_create_org(text,text,text,text,text,text,uuid), public.admin_orgs(), public.admin_update_org(uuid,text,text),
  public.board_access(uuid), public.can_edit_card(uuid,uuid,uuid), public.can_edit_card_id(uuid), public.can_view_card(uuid,uuid,uuid),
  public.can_view_card_id(uuid), public.create_api_key(uuid,text), public.create_board(uuid,text,text,text,text), public.create_card(uuid,jsonb,uuid,text),
  public.create_organization(text,text,text), public.db_access(uuid), public.delete_board(uuid), public.delete_cards(uuid[]), public.deleted_items(uuid),
  public.duplicate_board(uuid,text,uuid), public.duplicate_cards(uuid[]), public.import_cards(uuid,jsonb,uuid), public.invite_member(uuid,text,text),
  public.is_member(uuid), public.is_org_admin(uuid), public.is_platform_admin(), public.join_board(uuid), public.move_card(uuid,uuid,jsonb),
  public.org_role(uuid), public.record_cards(uuid), public.restore_item(text,uuid), public.update_card(uuid,jsonb,timestamptz,boolean),
  public.search_records(uuid,text,int), public.search_cards(uuid,text,int)
to authenticated;

-- api_* e webhook_ingest continuam abertos de propósito: exigem chave de API / token do board e são chamados pelas rotas /api

-- search_path fixo
alter function public.actor_id() set search_path = public;
alter function public._is_empty(jsonb) set search_path = public;
alter function public._cond_ok(jsonb, text, jsonb) set search_path = public;
alter function public._eval_conds(jsonb, text, jsonb, jsonb) set search_path = public;
alter function public._mirror_actions(jsonb) set search_path = public;
alter function public._interpolate(text, jsonb, text) set search_path = public;

-- tabelas só acessadas por funções internas: negar explicitamente
create policy pae_none on public.platform_admin_emails for select using (false);
create policy seq_none on public.seq_counters for select using (false);
