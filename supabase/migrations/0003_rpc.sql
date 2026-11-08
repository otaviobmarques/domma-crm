-- Domma CRM · 0003 · RPCs da aplicação, API, webhook, Super Admin, alertas
-- ---------- organização ----------
create or replace function public.create_organization(p_name text, p_segment text default null, p_cnpj text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  insert into organizations(name, segment, cnpj, created_by) values (p_name, p_segment, p_cnpj, auth.uid()) returning id into o;
  insert into memberships(org_id, user_id, role) values (o, auth.uid(), 'admin');
  perform public._audit(o, 'org.created', 'organization', o, null, p_name);
  return o;
end $$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role text default 'member')
returns text language plpgsql security definer set search_path = public as $$
declare u uuid; s jsonb;
begin
  select settings into s from organizations where id = p_org;
  if not public.is_org_admin(p_org) and (coalesce((s->>'admins_only_invite')::boolean, true) or not public.is_member(p_org)) then
    raise exception 'Só administradores podem convidar';
  end if;
  if p_role not in ('admin','member','limited','guest') then raise exception 'Papel inválido'; end if;
  select id into u from profiles where lower(email) = lower(trim(p_email));
  if u is not null then
    insert into memberships(org_id, user_id, role) values (p_org, u, p_role) on conflict (org_id, user_id) do update set role = excluded.role;
    perform public._audit(p_org, 'member.added', 'user', u, null, p_email);
    return 'added';
  end if;
  insert into invitations(org_id, email, role, invited_by) values (p_org, lower(trim(p_email)), p_role, auth.uid());
  perform public._audit(p_org, 'member.invited', 'invitation', null, null, p_email);
  return 'invited';
end $$;

-- ---------- boards ----------
create or replace function public._seed_board(p_board uuid, p_template text)
returns void language plpgsql security definer set search_path = public as $$
declare b boards; p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; f_nome uuid; f uuid;
begin
  select * into b from boards where id = p_board;
  if coalesce(p_template,'blank') = 'franquias' then
    insert into phases(org_id, board_id, name, color, position, description, sla_value, sla_unit) values
      (b.org_id, b.id, 'Caixa de entrada', '#7B61FF', 0, 'Fase que recebe todos os cards novos', 15, 'minutes') returning id into p1;
    insert into phases(org_id, board_id, name, color, position, sla_value, sla_unit) values (b.org_id, b.id, 'Primeiro contato', '#3B82F6', 1, 1, 'days') returning id into p2;
    insert into phases(org_id, board_id, name, color, position, sla_value, sla_unit) values (b.org_id, b.id, 'Reunião de apresentação', '#F59E0B', 2, 3, 'days') returning id into p3;
    insert into phases(org_id, board_id, name, color, position, totalizer) values (b.org_id, b.id, 'Proposta', '#EC4899', 3, null) returning id into p4;
    insert into phases(org_id, board_id, name, color, position, is_final) values (b.org_id, b.id, 'Contrato assinado', '#10B981', 4, true) returning id into p5;
    insert into phases(org_id, board_id, name, color, position, is_final) values (b.org_id, b.id, 'Perdido', '#6B7280', 5, true) returning id into p6;
    insert into fields(org_id, board_id, type, label, required, position, unique_value, integrated_key) values (b.org_id, b.id, 'short_text', 'Nome', true, 0, false, 'nome') returning id into f_nome;
    insert into fields(org_id, board_id, type, label, required, position, unique_value, unique_open_only, integrated_key, options) values (b.org_id, b.id, 'phone', 'Telefone', true, 1, true, true, 'telefone', '{"whatsapp":true}');
    insert into fields(org_id, board_id, type, label, position, integrated_key) values (b.org_id, b.id, 'email', 'E-mail', 2, 'email');
    insert into fields(org_id, board_id, type, label, position, integrated_key) values (b.org_id, b.id, 'short_text', 'Cidade', 3, 'cidade');
    insert into fields(org_id, board_id, type, label, position, options) values (b.org_id, b.id, 'single_select', 'Franquia', 4, '{"items":["Auto Visão","Royal","Master Laudo"]}');
    insert into fields(org_id, board_id, type, label, position, options) values (b.org_id, b.id, 'single_select', 'Origem', 5, '{"items":["Meta Ads","Google Ads","Indicação","Site","Outro"]}');
    insert into fields(org_id, board_id, type, label, position, options) values (b.org_id, b.id, 'single_select', 'Prazo para abertura', 6, '{"items":["Imediatamente","Até 3 meses","Até 6 meses","Mais de 6 meses"]}');
    insert into fields(org_id, board_id, type, label, position, options) values (b.org_id, b.id, 'sequence', 'Código', 7, '{"prefix":"LEAD","digits":5}');
    insert into fields(org_id, board_id, phase_id, type, label, required, position) values (b.org_id, b.id, p2, 'single_select', 'Resultado do contato', true, 0) returning id into f;
    update fields set options = '{"items":["Atendeu","Não atendeu","Número errado"]}' where id = f;
    insert into fields(org_id, board_id, phase_id, type, label, position) values (b.org_id, b.id, p3, 'datetime', 'Data da reunião', 0);
    insert into fields(org_id, board_id, phase_id, type, label, position) values (b.org_id, b.id, p3, 'attachment', 'Planilha de custo', 1);
    insert into fields(org_id, board_id, phase_id, type, label, required, position) values (b.org_id, b.id, p4, 'currency', 'Valor da franquia', true, 0) returning id into f;
    update phases set totalizer = jsonb_build_object('name','Total em propostas','field_id', f, 'op','sum','format','currency') where id = p4;
    insert into fields(org_id, board_id, phase_id, type, label, position) values (b.org_id, b.id, p6, 'single_select', 'Motivo da perda', 0)
      returning id into f;
    update fields set options = '{"items":["Sem capital","Sem interesse","Escolheu concorrente","Sem retorno"]}' where id = f;
    insert into tags(org_id, board_id, name, color) values (b.org_id, b.id, 'Quente', '#EF4444'), (b.org_id, b.id, 'Morno', '#F59E0B'), (b.org_id, b.id, 'Frio', '#3B82F6');
    update boards set settings = settings || jsonb_build_object('title_field', f_nome) where id = b.id;
  elsif p_template = 'vistoria' then
    insert into phases(org_id, board_id, name, color, position, description) values (b.org_id, b.id, 'Solicitação', '#7B61FF', 0, 'Pedidos de vistoria recebidos') returning id into p1;
    insert into phases(org_id, board_id, name, color, position, sla_value, sla_unit) values (b.org_id, b.id, 'Agendada', '#3B82F6', 1, 1, 'days') returning id into p2;
    insert into phases(org_id, board_id, name, color, position, sla_value, sla_unit) values (b.org_id, b.id, 'Em execução', '#F59E0B', 2, 4, 'hours') returning id into p3;
    insert into phases(org_id, board_id, name, color, position) values (b.org_id, b.id, 'Laudo emitido', '#EC4899', 3) returning id into p4;
    insert into phases(org_id, board_id, name, color, position, is_final) values (b.org_id, b.id, 'Concluída', '#10B981', 4, true) returning id into p5;
    insert into fields(org_id, board_id, type, label, required, position, regex, integrated_key) values (b.org_id, b.id, 'plate', 'Placa', true, 0, null, 'placa') returning id into f_nome;
    insert into fields(org_id, board_id, type, label, position) values (b.org_id, b.id, 'short_text', 'Chassi', 1);
    insert into fields(org_id, board_id, type, label, required, position) values (b.org_id, b.id, 'short_text', 'Cliente', true, 2);
    insert into fields(org_id, board_id, type, label, position, options) values (b.org_id, b.id, 'phone', 'Telefone', 3, '{"whatsapp":true}');
    insert into fields(org_id, board_id, type, label, position, options) values (b.org_id, b.id, 'single_select', 'Tipo de vistoria', 4, '{"items":["Transferência","Cautelar","Prévia","ECV"]}');
    insert into fields(org_id, board_id, type, label, position) values (b.org_id, b.id, 'currency', 'Valor', 5);
    insert into fields(org_id, board_id, type, label, position, options) values (b.org_id, b.id, 'sequence', 'Nº OS', 6, '{"prefix":"OS","digits":6}');
    insert into fields(org_id, board_id, phase_id, type, label, required, position) values (b.org_id, b.id, p2, 'datetime', 'Data agendada', true, 0);
    insert into fields(org_id, board_id, phase_id, type, label, required, position) values (b.org_id, b.id, p4, 'attachment', 'Laudo (PDF)', true, 0);
    update boards set settings = settings || jsonb_build_object('title_field', f_nome) where id = b.id;
  else
    insert into phases(org_id, board_id, name, color, position, description) values (b.org_id, b.id, 'Caixa de entrada', '#7B61FF', 0, 'Fase que recebe todos os cards novos');
    insert into phases(org_id, board_id, name, color, position) values (b.org_id, b.id, 'Fazendo', '#3B82F6', 1);
    insert into phases(org_id, board_id, name, color, position, is_final) values (b.org_id, b.id, 'Feito', '#10B981', 2, true);
    insert into fields(org_id, board_id, type, label, required, position, integrated_key) values (b.org_id, b.id, 'short_text', 'Título', true, 0, 'titulo') returning id into f_nome;
    update boards set settings = settings || jsonb_build_object('title_field', f_nome) where id = b.id;
  end if;
end $$;
revoke execute on function public._seed_board(uuid, text) from public, anon, authenticated;

create or replace function public.create_board(p_org uuid, p_name text, p_icon text default '📋', p_color text default '#5B3FE6', p_template text default 'blank')
returns uuid language plpgsql security definer set search_path = public as $$
declare r text := public.org_role(p_org); s jsonb; bid uuid;
begin
  select settings into s from organizations where id = p_org;
  if r is null or r not in ('admin','member') then raise exception 'Sem permissão para criar boards'; end if;
  if r <> 'admin' and coalesce((s->>'admins_only_boards')::boolean, false) then raise exception 'Só administradores criam boards nesta organização'; end if;
  insert into boards(org_id, name, icon, color, created_by) values (p_org, p_name, coalesce(p_icon,'📋'), coalesce(p_color,'#5B3FE6'), auth.uid()) returning id into bid;
  insert into board_members(board_id, user_id, role) values (bid, auth.uid(), 'admin');
  perform public._seed_board(bid, p_template);
  return bid;
end $$;

create or replace function public.join_board(p_board uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.board_access(p_board) <> 'viewer' then raise exception 'Não é possível participar deste board'; end if;
  insert into board_members(board_id, user_id, role) values (p_board, auth.uid(), 'member') on conflict do nothing;
end $$;

create or replace function public.delete_board(p_board uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.board_access(p_board) <> 'admin' then raise exception 'Só administradores do board'; end if;
  update boards set deleted_at = now() where id = p_board;
end $$;

create or replace function public.duplicate_board(p_board uuid, p_name text, p_org uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare b boards; nb uuid; org uuid; m jsonb := '{}'; r record; nid uuid; txt text; k text; v text;
begin
  if public.board_access(p_board) <> 'admin' then raise exception 'Só administradores do board podem duplicar'; end if;
  select * into b from boards where id = p_board;
  org := coalesce(p_org, b.org_id);
  if public.org_role(org) not in ('admin','member') then raise exception 'Sem acesso à organização de destino'; end if;
  insert into boards(org_id, name, icon, color, description, visibility, settings, created_by)
    values (org, p_name, b.icon, b.color, b.description, b.visibility, b.settings, auth.uid()) returning id into nb;
  insert into board_members(board_id, user_id, role) values (nb, auth.uid(), 'admin');
  m := m || jsonb_build_object(p_board::text, nb::text);
  for r in select * from phases where board_id = p_board and deleted_at is null order by position loop
    insert into phases(org_id, board_id, name, color, description, position, is_final, sla_value, sla_unit, distribution, replace_assignees, always_assign, totalizer, allowed_moves, auto_assignees)
      values (org, nb, r.name, r.color, r.description, r.position, r.is_final, r.sla_value, r.sla_unit, r.distribution, r.replace_assignees, r.always_assign, r.totalizer, r.allowed_moves,
              case when org = b.org_id then r.auto_assignees else '{}' end) returning id into nid;
    m := m || jsonb_build_object(r.id::text, nid::text);
  end loop;
  for r in select * from fields where board_id = p_board and deleted_at is null loop
    insert into fields(org_id, board_id, phase_id, type, label, description, help, required, editable, unique_value, unique_open_only, integrated_key, regex, options, position, hidden)
      values (org, nb, nullif(m->>(r.phase_id::text),'')::uuid, r.type, r.label, r.description, r.help, r.required, r.editable, r.unique_value, r.unique_open_only, r.integrated_key, r.regex, r.options, r.position, r.hidden)
      returning id into nid;
    m := m || jsonb_build_object(r.id::text, nid::text);
  end loop;
  for r in select * from tags where board_id = p_board and deleted_at is null loop
    insert into tags(org_id, board_id, name, color) values (org, nb, r.name, r.color) returning id into nid;
    m := m || jsonb_build_object(r.id::text, nid::text);
  end loop;
  -- remapeia ids em jsonb/arrays
  for r in select * from field_rules where board_id = p_board loop
    txt := jsonb_build_object('c', r.conditions, 't', r.true_actions, 'f', r.false_actions)::text;
    for k, v in select * from jsonb_each_text(m) loop txt := replace(txt, k, v); end loop;
    insert into field_rules(org_id, board_id, phase_id, name, conditions, match, true_actions, false_actions, mirror, enabled, position)
      values (org, nb, nullif(m->>(r.phase_id::text),'')::uuid, r.name, (txt::jsonb)->'c', r.match, (txt::jsonb)->'t', (txt::jsonb)->'f', r.mirror, r.enabled, r.position);
  end loop;
  for r in select * from automations where board_id = p_board and deleted_at is null loop
    txt := jsonb_build_object('e', r.event_config, 'c', r.conditions, 'a', r.actions)::text;
    for k, v in select * from jsonb_each_text(m) loop txt := replace(txt, k, v); end loop;
    insert into automations(org_id, board_id, name, enabled, event, event_config, conditions, match, actions, created_by)
      values (org, nb, r.name, false, r.event, (txt::jsonb)->'e', (txt::jsonb)->'c', r.match, (txt::jsonb)->'a', auth.uid());
  end loop;
  txt := b.settings::text;
  for k, v in select * from jsonb_each_text(m) loop txt := replace(txt, k, v); end loop;
  update boards set settings = txt::jsonb where id = nb;
  for r in select id, allowed_moves from phases where board_id = nb and allowed_moves is not null loop
    update phases set allowed_moves = (select array_agg(coalesce(nullif(m->>x::text,''), x::text)::uuid) from unnest(r.allowed_moves) x) where id = r.id;
  end loop;
  return nb;
end $$;

-- ---------- cards ----------
create or replace function public.create_card(p_board uuid, p_data jsonb, p_phase uuid default null, p_via text default 'manual')
returns uuid language plpgsql security definer set search_path = public as $$
declare b boards; acc text := public.board_access(p_board); nid uuid;
begin
  if acc is null or acc not in ('admin','member','limited') then raise exception 'Sem permissão para criar cards neste board'; end if;
  select * into b from boards where id = p_board and deleted_at is null;
  if b.id is null then raise exception 'Board não encontrado'; end if;
  perform public._validate_values(p_board, null, coalesce(p_data,'{}'), null, p_via <> 'import');
  insert into cards(org_id, board_id, phase_id, data, created_via, created_by)
    values (b.org_id, p_board, p_phase, coalesce(p_data,'{}'), coalesce(p_via,'manual'), public.actor_id()) returning id into nid;
  return nid;
end $$;

create or replace function public.update_card(p_card uuid, p_patch jsonb default '{}', p_due timestamptz default null, p_set_due boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare c cards;
begin
  select * into c from cards where id = p_card and deleted_at is null;
  if c.id is null or not public.can_edit_card(c.board_id, c.id, c.created_by) then raise exception 'Sem permissão para editar este card'; end if;
  if p_patch is not null and p_patch <> '{}'::jsonb then
    perform public._validate_values(c.board_id, null, p_patch, c.id, false);
  end if;
  update cards set data = data || coalesce(p_patch,'{}'),
                   due_at = case when p_set_due then p_due else due_at end
   where id = p_card;
end $$;

create or replace function public.move_card(p_card uuid, p_phase uuid, p_patch jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare c cards; cur phases; tgt phases; f record; merged jsonb; r field_rules; ctx jsonb; acts jsonb; a jsonb;
        v_hidden text[] := '{}'; required_extra text[] := '{}'; cond boolean;
begin
  select * into c from cards where id = p_card and deleted_at is null;
  if c.id is null or not public.can_edit_card(c.board_id, c.id, c.created_by) then raise exception 'Sem permissão para mover este card'; end if;
  if c.phase_id = p_phase then
    if p_patch is not null and p_patch <> '{}'::jsonb then perform public.update_card(p_card, p_patch); end if;
    return;
  end if;
  select * into cur from phases where id = c.phase_id;
  select * into tgt from phases where id = p_phase and board_id = c.board_id and deleted_at is null;
  if tgt.id is null then raise exception 'Fase de destino inválida'; end if;
  if cur.allowed_moves is not null and not (p_phase = any(cur.allowed_moves)) then
    raise exception 'Movimento não permitido de "%" para "%"', cur.name, tgt.name;
  end if;
  merged := c.data || coalesce(p_patch,'{}');
  if p_patch is not null and p_patch <> '{}'::jsonb then
    perform public._validate_values(c.board_id, null, p_patch, c.id, false);
  end if;
  ctx := public._card_ctx(c.id);
  for r in select * from field_rules where board_id = c.board_id and enabled and (phase_id is null or phase_id = cur.id) order by position loop
    cond := public._eval_conds(r.conditions, r.match, merged, ctx);
    acts := case when cond then r.true_actions when r.mirror then public._mirror_actions(r.true_actions) else r.false_actions end;
    for a in select * from jsonb_array_elements(coalesce(acts,'[]')) loop
      if a->>'type' = 'deny_move' and (a->>'phase_id' = p_phase::text or coalesce(a->>'phase_id','') = '') then
        raise exception 'Movimento bloqueado pela regra "%"', r.name;
      elsif a->>'type' = 'hide' then v_hidden := v_hidden || (a->>'field_id');
      elsif a->>'type' = 'require' then required_extra := required_extra || (a->>'field_id');
      end if;
    end loop;
  end loop;
  for f in select * from fields where board_id = c.board_id and deleted_at is null and not hidden
           and type not in ('static_text','sequence','formula')
           and ((phase_id = cur.id and (required or id::text = any(required_extra)))
             or (tgt.is_final and phase_id = tgt.id and required)) loop
    if not (f.id::text = any(v_hidden)) and public._is_empty(merged->(f.id::text)) then
      raise exception 'Preencha o campo obrigatório "%"', f.label;
    end if;
  end loop;
  update cards set phase_id = p_phase, data = merged where id = c.id;
end $$;

create or replace function public.delete_cards(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare c cards; acc text; n int := 0;
begin
  for c in select * from cards where id = any(p_ids) and deleted_at is null loop
    acc := public.board_access(c.board_id);
    if not public.can_edit_card(c.board_id, c.id, c.created_by) then raise exception 'Sem permissão para excluir "%"', c.title; end if;
    if acc <> 'admin' and coalesce((select (settings->>'block_delete')::boolean from boards where id = c.board_id), false) then
      raise exception 'Neste board só administradores excluem cards';
    end if;
    update cards set deleted_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.restore_item(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if p_type = 'card' then select board_id into b from cards where id = p_id;
  elsif p_type = 'phase' then select board_id into b from phases where id = p_id;
  elsif p_type = 'field' then select board_id into b from fields where id = p_id;
  elsif p_type = 'tag' then select board_id into b from tags where id = p_id;
  else raise exception 'Tipo inválido'; end if;
  if public.board_access(b) <> 'admin' then raise exception 'Só administradores do board restauram itens'; end if;
  execute format('update %I set deleted_at = null where id = $1', case p_type when 'card' then 'cards' when 'phase' then 'phases' when 'field' then 'fields' else 'tags' end) using p_id;
end $$;

create or replace function public.deleted_items(p_board uuid)
returns table(kind text, id uuid, name text, deleted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'card', c.id, c.title, c.deleted_at from cards c where c.board_id = p_board and c.deleted_at is not null
    union all select 'phase', p.id, p.name, p.deleted_at from phases p where p.board_id = p_board and p.deleted_at is not null
    union all select 'field', f.id, f.label, f.deleted_at from fields f where f.board_id = p_board and f.deleted_at is not null
    union all select 'tag', t.id, t.name, t.deleted_at from tags t where t.board_id = p_board and t.deleted_at is not null
  ) x where public.board_access(p_board) = 'admin' order by 4 desc limit 200
$$;

create or replace function public.duplicate_cards(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare c cards; n int := 0; seqs text[];
begin
  for c in select * from cards where id = any(p_ids) and deleted_at is null loop
    if not public.can_view_card(c.board_id, c.id, c.created_by) or public.board_access(c.board_id) not in ('admin','member','limited') then
      raise exception 'Sem permissão'; end if;
    select coalesce(array_agg(id::text), '{}') into seqs from fields where board_id = c.board_id and (type = 'sequence' or unique_value);
    insert into cards(org_id, board_id, phase_id, data, created_by, created_via)
      values (c.org_id, c.board_id, c.phase_id, c.data - seqs, public.actor_id(), 'duplicate');
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.import_cards(p_board uuid, p_rows jsonb, p_dedupe_field uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare rw jsonb; ok int := 0; skipped int := 0; errs jsonb := '[]'; i int := 0;
begin
  if public.board_access(p_board) not in ('admin','member') then raise exception 'Sem permissão para importar'; end if;
  for rw in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if p_dedupe_field is not null and coalesce(rw->>p_dedupe_field::text,'') <> '' and exists (
      select 1 from cards where board_id = p_board and deleted_at is null and data->>p_dedupe_field::text = rw->>p_dedupe_field::text) then
      skipped := skipped + 1; continue;
    end if;
    begin
      perform public.create_card(p_board, rw, null, 'import');
      ok := ok + 1;
    exception when others then
      errs := errs || jsonb_build_object('row', i, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', ok, 'skipped', skipped, 'errors', errs);
end $$;

-- ficha única: cards que apontam para um registro
create or replace function public.record_cards(p_record uuid)
returns table(id uuid, title text, board_id uuid, board_name text, phase_name text, phase_color text, created_at timestamptz, finished_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.title, c.board_id, b.name, p.name, p.color, c.created_at, c.finished_at
  from cards c join boards b on b.id = c.board_id left join phases p on p.id = c.phase_id
  join fields f on f.board_id = c.board_id and f.type = 'connected_database' and f.deleted_at is null
  where c.deleted_at is null and c.data -> (f.id::text) @> jsonb_build_array(p_record::text)
    and public.can_view_card(c.board_id, c.id, c.created_by)
  order by c.created_at desc
$$;

-- ---------- chaves de API e API REST ----------
create or replace function public.create_api_key(p_org uuid, p_name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare k text := 'dcrm_' || encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_member(p_org) then raise exception 'Sem acesso'; end if;
  insert into api_keys(org_id, user_id, name, prefix, key_hash)
    values (p_org, auth.uid(), p_name, left(k, 12), encode(extensions.digest(k, 'sha256'), 'hex'));
  return k;
end $$;

create or replace function public._api_auth(p_key text) returns api_keys
language plpgsql security definer set search_path = public, extensions as $$
declare k api_keys;
begin
  select * into k from api_keys where key_hash = encode(extensions.digest(coalesce(p_key,''), 'sha256'), 'hex') and revoked_at is null;
  if k.id is null then raise exception 'Chave de API inválida' using errcode = '28000'; end if;
  perform set_config('app.actor', k.user_id::text, true);
  update api_keys set last_used_at = now() where id = k.id;
  return k;
end $$;
revoke execute on function public._api_auth(text) from public, anon, authenticated;

create or replace function public._map_payload(p_board uuid, p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f record; res jsonb := '{}'; v jsonb;
begin
  for f in select id, integrated_key, label from fields where board_id = p_board and deleted_at is null and phase_id is null loop
    v := null;
    if p_payload ? f.id::text then v := p_payload->(f.id::text);
    elsif coalesce(f.integrated_key,'') <> '' then v := p_payload #> string_to_array(f.integrated_key, '.');
    end if;
    if v is not null and v <> 'null'::jsonb then res := res || jsonb_build_object(f.id::text, v); end if;
  end loop;
  return res;
end $$;

create or replace function public.api_boards(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k api_keys := public._api_auth(p_key);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name,
    'phases', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'is_final', p.is_final) order by p.position), '[]') from phases p where p.board_id = b.id and p.deleted_at is null),
    'fields', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'label', f.label, 'type', f.type, 'phase_id', f.phase_id, 'integrated_key', f.integrated_key, 'required', f.required) order by f.position), '[]') from fields f where f.board_id = b.id and f.deleted_at is null)))
    from boards b where b.org_id = k.org_id and b.deleted_at is null and public.board_access(b.id) is not null), '[]');
end $$;

create or replace function public.api_cards(p_key text, p_board uuid, p_phase uuid default null, p_limit int default 100, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k api_keys := public._api_auth(p_key);
begin
  if public.board_access(p_board) is null then raise exception 'Sem acesso ao board'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select c.id, c.title, c.phase_id, c.data as "values", c.due_at, c.created_at, c.updated_at, c.finished_at
    from cards c where c.board_id = p_board and c.deleted_at is null and (p_phase is null or c.phase_id = p_phase)
      and public.can_view_card(c.board_id, c.id, c.created_by)
    order by c.created_at desc limit least(p_limit, 500) offset p_offset) x), '[]');
end $$;

create or replace function public.api_create_card(p_key text, p_board uuid, p_values jsonb, p_phase uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k api_keys := public._api_auth(p_key); nid uuid;
begin
  nid := public.create_card(p_board, public._map_payload(p_board, p_values), p_phase, 'api');
  return (select jsonb_build_object('id', id, 'title', title, 'phase_id', phase_id) from cards where id = nid);
end $$;

create or replace function public.api_update_card(p_key text, p_card uuid, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k api_keys := public._api_auth(p_key); b uuid;
begin
  select board_id into b from cards where id = p_card;
  perform public.update_card(p_card, public._map_payload(b, p_values));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_move_card(p_key text, p_card uuid, p_phase uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k api_keys := public._api_auth(p_key);
begin
  perform public.move_card(p_card, p_phase, '{}');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_records(p_key text, p_database uuid, p_limit int default 100, p_offset int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k api_keys := public._api_auth(p_key);
begin
  if public.db_access(p_database) is null then raise exception 'Sem acesso à database'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select r.id, r.title, r.status, r.data as "values", r.created_at, r.updated_at from records r
    where r.database_id = p_database and r.deleted_at is null order by r.created_at desc limit least(p_limit, 1000) offset p_offset) x), '[]');
end $$;

-- relatório salvo para Power BI: linhas planas com rótulos
create or replace function public.api_report(p_key text, p_report uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k api_keys := public._api_auth(p_key); rep reports;
begin
  select * into rep from reports where id = p_report;
  if rep.id is null or public.board_access(rep.board_id) is null then raise exception 'Relatório não encontrado'; end if;
  return coalesce((select jsonb_agg(
      jsonb_build_object('id', c.id, 'titulo', c.title, 'fase', p.name, 'criado_em', c.created_at, 'vencimento', c.due_at, 'finalizado_em', c.finished_at)
      || coalesce((select jsonb_object_agg(f.label, c.data->(f.id::text)) from fields f where f.board_id = c.board_id and f.deleted_at is null
                    and (rep.config->'columns' is null or rep.config->'columns' ? f.id::text)), '{}'))
    from cards c left join phases p on p.id = c.phase_id
    where c.board_id = rep.board_id and c.deleted_at is null and public.can_view_card(c.board_id, c.id, c.created_by)), '[]');
end $$;

-- ---------- webhook de entrada ----------
create or replace function public.webhook_ingest(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b boards; nid uuid; mapped jsonb;
begin
  select * into b from boards where webhook_token = p_token and deleted_at is null;
  if b.id is null then raise exception 'Webhook inválido' using errcode = '28000'; end if;
  perform set_config('app.actor', b.created_by::text, true);
  begin
    mapped := public._map_payload(b.id, coalesce(p_payload,'{}'));
    perform public._validate_values(b.id, null, mapped, null, false);
    insert into cards(org_id, board_id, data, created_by, created_via) values (b.org_id, b.id, mapped, b.created_by, 'webhook') returning id into nid;
    insert into webhook_requests(org_id, board_id, payload, status, card_id) values (b.org_id, b.id, p_payload, 'success', nid);
    return jsonb_build_object('ok', true, 'card_id', nid);
  exception when others then
    insert into webhook_requests(org_id, board_id, payload, status, error) values (b.org_id, b.id, p_payload, 'error', sqlerrm);
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end $$;

-- ---------- Super Admin ----------
create or replace function public.admin_orgs()
returns table(id uuid, name text, cnpj text, segment text, plan text, status text, parent_id uuid, users bigint, cards bigint,
              automations_month bigint, created_at timestamptz, last_activity timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, o.cnpj, o.segment, o.plan, o.status, o.parent_id,
    (select count(*) from memberships m where m.org_id = o.id and m.role <> 'guest'),
    (select count(*) from cards c where c.org_id = o.id and c.deleted_at is null),
    (select count(*) from automation_runs r where r.org_id = o.id and r.created_at >= date_trunc('month', now())),
    o.created_at,
    (select max(created_at) from audit_logs a where a.org_id = o.id)
  from organizations o where public.is_platform_admin() order by o.created_at desc
$$;

create or replace function public.admin_create_org(p_name text, p_cnpj text, p_segment text, p_plan text, p_admin_email text, p_template text default 'blank', p_parent uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o uuid; u uuid; bid uuid;
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à equipe Domma'; end if;
  insert into organizations(name, cnpj, segment, plan, status, parent_id, created_by) values (p_name, p_cnpj, p_segment, coalesce(p_plan,'essencial'), 'trial', p_parent, auth.uid()) returning id into o;
  select id into u from profiles where lower(email) = lower(trim(p_admin_email));
  if u is not null then insert into memberships(org_id, user_id, role) values (o, u, 'admin');
  else insert into invitations(org_id, email, role, invited_by) values (o, lower(trim(p_admin_email)), 'admin', auth.uid()); end if;
  if coalesce(p_template,'') <> '' and p_template <> 'none' then
    insert into boards(org_id, name, icon, created_by) values (o, case p_template when 'franquias' then 'Venda de franquias' when 'vistoria' then 'Vistorias' else 'Meu primeiro board' end,
      case p_template when 'franquias' then '🤝' when 'vistoria' then '🚗' else '📋' end, coalesce(u, auth.uid())) returning id into bid;
    if u is not null then insert into board_members(board_id, user_id, role) values (bid, u, 'admin'); end if;
    perform public._seed_board(bid, p_template);
  end if;
  insert into audit_logs(org_id, actor, action, entity_type, entity_id, summary) values (o, auth.uid(), 'org.created_by_admin', 'organization', o, p_name);
  return o;
end $$;

create or replace function public.admin_update_org(p_org uuid, p_status text, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à equipe Domma'; end if;
  update organizations set status = coalesce(p_status, status), plan = coalesce(p_plan, plan) where id = p_org;
  insert into audit_logs(org_id, actor, action, entity_type, entity_id, summary) values (p_org, auth.uid(), 'org.updated_by_admin', 'organization', p_org, coalesce(p_status,'') || ' ' || coalesce(p_plan,''));
end $$;

-- ---------- alertas de vencimento (pg_cron) ----------
create or replace function public._due_alerts() returns void
language plpgsql security definer set search_path = public as $$
declare c record; u uuid;
begin
  for c in select cd.*, b.settings bs from cards cd join boards b on b.id = cd.board_id
    where cd.deleted_at is null and cd.finished_at is null and cd.due_at is not null and cd.due_alerted_at is null
      and cd.due_at > now() and b.settings ? 'due_alert_value'
      and cd.due_at - ((b.settings->>'due_alert_value') || ' ' || coalesce(b.settings->>'due_alert_unit','hours'))::interval <= now() loop
    for u in select user_id from card_assignees where card_id = c.id loop
      insert into notifications(org_id, user_id, type, title, body, card_id, board_id) values (c.org_id, u, 'due_soon', 'Card perto de vencer', c.title, c.id, c.board_id);
    end loop;
    update cards set due_alerted_at = now() where id = c.id;
  end loop;
  for c in select * from cards where deleted_at is null and finished_at is null and due_at is not null and due_at <= now() and overdue_alerted_at is null loop
    for u in select user_id from card_assignees where card_id = c.id loop
      insert into notifications(org_id, user_id, type, title, body, card_id, board_id) values (c.org_id, u, 'overdue', 'Card vencido', c.title, c.id, c.board_id);
    end loop;
    update cards set overdue_alerted_at = now() where id = c.id;
    perform public._run_automations('card_overdue', c.board_id, c.id, c.data, '{}');
  end loop;
end $$;
revoke execute on function public._due_alerts() from public, anon, authenticated;

-- ---------- storage de anexos ----------
insert into storage.buckets (id, name, public, file_size_limit) values ('attachments', 'attachments', false, 26214400) on conflict do nothing;
create policy att_obj_sel on storage.objects for select using (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy att_obj_ins on storage.objects for insert with check (bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy att_obj_del on storage.objects for delete using (bucket_id = 'attachments' and owner = auth.uid());

-- ---------- tempo real ----------
alter publication supabase_realtime add table public.cards, public.card_assignees, public.card_tags, public.card_events,
  public.comments, public.tasks, public.notifications, public.records, public.phases, public.fields;

-- ---------- Super Admin inicial ----------
insert into public.platform_admin_emails(email) values ('otaviobmarques@gmail.com') on conflict do nothing;
