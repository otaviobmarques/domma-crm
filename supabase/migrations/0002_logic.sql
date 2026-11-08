-- Domma CRM · 0002 · lógica do processo: cards, regras, automações
create extension if not exists pg_net;

-- ---------- utilidades ----------
create or replace function public._audit(p_org uuid, p_action text, p_type text, p_id uuid, p_board uuid, p_summary text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs(org_id, actor, action, entity_type, entity_id, board_id, summary, data)
  values (p_org, public.actor_id(), p_action, p_type, p_id, p_board, p_summary, coalesce(p_data,'{}'))
$$;

create or replace function public._is_empty(v jsonb) returns boolean language sql immutable as $$
  select v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb or v = '{}'::jsonb
$$;

create or replace function public._cond_ok(v jsonb, op text, target jsonb) returns boolean
language plpgsql immutable as $$
declare s text; t text; n numeric; m numeric;
begin
  if op = 'filled' then return not public._is_empty(v); end if;
  if op = 'empty' then return public._is_empty(v); end if;
  t := target #>> '{}';
  if public._is_empty(v) then return op in ('neq','not_contains'); end if;
  if jsonb_typeof(v) = 'array' then
    if op in ('eq','contains') then return v @> jsonb_build_array(target) or v @> jsonb_build_array(t); end if;
    if op in ('neq','not_contains') then return not (v @> jsonb_build_array(target) or v @> jsonb_build_array(t)); end if;
    return false;
  end if;
  s := v #>> '{}';
  if op = 'eq' then return lower(s) = lower(coalesce(t,'')); end if;
  if op = 'neq' then return lower(s) <> lower(coalesce(t,'')); end if;
  if op = 'contains' then return position(lower(coalesce(t,'')) in lower(s)) > 0; end if;
  if op = 'not_contains' then return position(lower(coalesce(t,'')) in lower(s)) = 0; end if;
  if op in ('gt','gte','lt','lte') then
    begin
      n := s::numeric; m := t::numeric;
      return case op when 'gt' then n > m when 'gte' then n >= m when 'lt' then n < m else n <= m end;
    exception when others then
      begin
        return case op when 'gt' then s::timestamptz > t::timestamptz when 'gte' then s::timestamptz >= t::timestamptz
                       when 'lt' then s::timestamptz < t::timestamptz else s::timestamptz <= t::timestamptz end;
      exception when others then return false; end;
    end;
  end if;
  return false;
end $$;

create or replace function public._eval_conds(conds jsonb, p_match text, vals jsonb, ctx jsonb) returns boolean
language plpgsql stable as $$
declare c jsonb; ok boolean; v jsonb; any_true boolean := false; all_true boolean := true; k text;
begin
  if conds is null or jsonb_typeof(conds) <> 'array' or jsonb_array_length(conds) = 0 then return true; end if;
  for c in select * from jsonb_array_elements(conds) loop
    k := c->>'field';
    if k in ('phase','tags','assignees','title') then v := ctx->k; else v := vals->k; end if;
    ok := coalesce(public._cond_ok(v, c->>'op', c->'value'), false);
    any_true := any_true or ok;
    all_true := all_true and ok;
  end loop;
  if coalesce(p_match,'and') = 'or' then return any_true; end if;
  return all_true;
end $$;

create or replace function public._mirror_actions(acts jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(
    case a->>'type'
      when 'show' then a || '{"type":"hide"}'
      when 'hide' then a || '{"type":"show"}'
      when 'enable' then a || '{"type":"disable"}'
      when 'disable' then a || '{"type":"enable"}'
      when 'require' then a || '{"type":"optional"}'
      when 'allow_move' then a || '{"type":"deny_move"}'
      when 'deny_move' then a || '{"type":"allow_move"}'
      else a end), '[]'::jsonb)
  from jsonb_array_elements(coalesce(acts,'[]')) a
$$;

create or replace function public._card_ctx(p_card uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'phase', to_jsonb(c.phase_id::text),
    'title', to_jsonb(c.title),
    'tags', coalesce((select jsonb_agg(tag_id::text) from card_tags where card_id = c.id), '[]'),
    'assignees', coalesce((select jsonb_agg(user_id::text) from card_assignees where card_id = c.id), '[]'))
  from cards c where c.id = p_card
$$;

create or replace function public._interpolate(tpl text, vals jsonb, p_title text) returns text
language plpgsql immutable as $$
declare k text; v jsonb; r text := tpl;
begin
  if r is null then return null; end if;
  r := replace(r, '{{title}}', coalesce(p_title,''));
  for k, v in select * from jsonb_each(coalesce(vals,'{}')) loop
    r := replace(r, '{{'||k||'}}', coalesce(case when jsonb_typeof(v) = 'string' then v #>> '{}' else v::text end, ''));
  end loop;
  return r;
end $$;

-- ---------- validação de valores ----------
create or replace function public._validate_values(p_board uuid, p_db uuid, p_data jsonb, p_exclude uuid, p_check_required boolean)
returns void language plpgsql security definer set search_path = public as $$
declare f record; v text; k text;
begin
  for f in select * from fields
    where ((p_board is not null and board_id = p_board) or (p_db is not null and database_id = p_db))
      and deleted_at is null and not hidden loop
    k := f.id::text;
    v := p_data->>k;
    if p_check_required and f.phase_id is null and f.required
       and f.type not in ('static_text','sequence','formula') and public._is_empty(p_data->k) then
      raise exception 'Campo obrigatório: %', f.label;
    end if;
    if p_data ? k and not public._is_empty(p_data->k) then
      if coalesce(f.regex,'') <> '' and jsonb_typeof(p_data->k) = 'string' and not (v ~ f.regex) then
        raise exception 'Formato inválido em "%"', f.label;
      end if;
      if f.unique_value then
        if p_board is not null and exists (
          select 1 from cards c where c.board_id = p_board and c.deleted_at is null and c.id is distinct from p_exclude
            and c.data->>k = v and (not f.unique_open_only or c.finished_at is null)) then
          raise exception 'Já existe outro registro preenchido com o mesmo valor em "%"', f.label;
        end if;
        if p_db is not null and exists (
          select 1 from records r where r.database_id = p_db and r.deleted_at is null and r.id is distinct from p_exclude
            and r.data->>k = v) then
          raise exception 'Já existe outro registro preenchido com o mesmo valor em "%"', f.label;
        end if;
      end if;
    end if;
  end loop;
end $$;

-- ---------- atribuição ao entrar na fase ----------
create or replace function public._assign_on_enter(c public.cards, p_insert boolean)
returns void language plpgsql security definer set search_path = public as $$
declare ph phases; b boards; users uuid[]; cnt int;
begin
  select * into b from boards where id = c.board_id;
  if p_insert and coalesce((b.settings->>'assign_creator')::boolean, false) and c.created_by is not null then
    insert into card_assignees(card_id, user_id) values (c.id, c.created_by) on conflict do nothing;
    return;
  end if;
  select * into ph from phases where id = c.phase_id;
  if ph.id is null or cardinality(ph.auto_assignees) = 0 then return; end if;
  if not p_insert and not ph.always_assign then
    select count(*) into cnt from card_phase_history where card_id = c.id and phase_id = c.phase_id;
    if cnt > 1 then return; end if;
  end if;
  if ph.distribution = 'sequential' then
    users := array[ph.auto_assignees[(ph.rr_index % cardinality(ph.auto_assignees)) + 1]];
    update phases set rr_index = rr_index + 1 where id = ph.id;
  else
    users := ph.auto_assignees;
  end if;
  if ph.replace_assignees then
    delete from card_assignees where card_id = c.id and not (user_id = any(users));
  end if;
  insert into card_assignees(card_id, user_id)
    select c.id, u from unnest(users) u where exists (select 1 from profiles where id = u)
    on conflict do nothing;
end $$;

-- ---------- motor de automações ----------
create or replace function public._run_action(act jsonb, a public.automations, p_card uuid, p_vals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t text := act->>'type'; c cards; nv jsonb := '{}'; m jsonb; val jsonb; u text; n int; unit text;
begin
  if p_card is not null then select * into c from cards where id = p_card; end if;
  if t = 'move_card' then
    if c.id is null then return; end if;
    update cards set phase_id = (act->>'phase_id')::uuid where id = c.id and phase_id is distinct from (act->>'phase_id')::uuid;
  elsif t = 'update_field' then
    if c.id is null then return; end if;
    val := act->'value';
    if jsonb_typeof(val) = 'string' then val := to_jsonb(public._interpolate(val #>> '{}', c.data, c.title)); end if;
    update cards set data = data || jsonb_build_object(act->>'field_id', val) where id = c.id;
  elsif t = 'create_card' then
    for m in select * from jsonb_array_elements(coalesce(act->'mapping','[]')) loop
      if coalesce(m->>'source','') <> '' then
        if m->>'source' = 'title' then nv := nv || jsonb_build_object(m->>'target', to_jsonb(c.title));
        else nv := nv || jsonb_build_object(m->>'target', p_vals->(m->>'source')); end if;
      else
        nv := nv || jsonb_build_object(m->>'target', to_jsonb(public._interpolate(coalesce(m->>'value',''), p_vals, c.title)));
      end if;
    end loop;
    insert into cards(org_id, board_id, phase_id, data, created_by, created_via)
      select b.org_id, b.id, nullif(act->>'phase_id','')::uuid, nv, coalesce(public.actor_id(), a.created_by), 'automation'
      from boards b where b.id = (act->>'board_id')::uuid and b.deleted_at is null;
  elsif t = 'set_tags' then
    if c.id is null then return; end if;
    if coalesce(act->>'mode','add') = 'replace' then delete from card_tags where card_id = c.id; end if;
    if act->>'mode' = 'remove' then
      delete from card_tags where card_id = c.id and tag_id::text in (select jsonb_array_elements_text(act->'tag_ids'));
    else
      insert into card_tags(card_id, tag_id) select c.id, x::uuid from jsonb_array_elements_text(coalesce(act->'tag_ids','[]')) x on conflict do nothing;
    end if;
  elsif t = 'set_assignees' then
    if c.id is null then return; end if;
    if coalesce(act->>'mode','add') = 'replace' then delete from card_assignees where card_id = c.id; end if;
    if act->>'mode' = 'remove' then
      delete from card_assignees where card_id = c.id and user_id::text in (select jsonb_array_elements_text(act->'user_ids'));
    else
      insert into card_assignees(card_id, user_id) select c.id, x::uuid from jsonb_array_elements_text(coalesce(act->'user_ids','[]')) x on conflict do nothing;
    end if;
  elsif t = 'set_due' then
    if c.id is null then return; end if;
    n := coalesce((act->>'amount')::int, 1);
    unit := coalesce(act->>'unit','days');
    update cards set due_at = now() + (n || ' ' || unit)::interval where id = c.id;
  elsif t = 'notify' then
    for u in select jsonb_array_elements_text(coalesce(act->'user_ids','[]')) loop
      insert into notifications(org_id, user_id, type, title, body, card_id, board_id)
      values (a.org_id, u::uuid, 'automation', coalesce(nullif(act->>'title',''), a.name),
              public._interpolate(act->>'message', coalesce(c.data, p_vals), c.title), c.id, a.board_id);
    end loop;
  elsif t = 'http' then
    perform net.http_post(
      url := act->>'url',
      body := jsonb_build_object('event', a.event, 'automation', a.name, 'card',
        case when c.id is null then null else jsonb_build_object('id', c.id, 'title', c.title, 'board_id', c.board_id,
          'phase_id', c.phase_id, 'due_at', c.due_at, 'created_at', c.created_at) end,
        'values', coalesce(c.data, p_vals)),
      headers := coalesce(act->'headers', '{}'::jsonb) || '{"Content-Type":"application/json"}'::jsonb);
  else
    raise exception 'Ação desconhecida: %', t;
  end if;
end $$;

create or replace function public._run_automations(p_event text, p_board uuid, p_card uuid, p_vals jsonb, p_cfg jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a automations; act jsonb; ctx jsonb; vals jsonb; ok boolean; org uuid;
begin
  if pg_trigger_depth() > 8 then return; end if;
  for a in select * from automations au where au.enabled and au.deleted_at is null and au.event = p_event
      and ((p_event <> 'record_created' and p_event <> 'record_status_changed' and au.board_id = p_board)
        or (p_event in ('record_created','record_status_changed') and au.event_config->>'database_id' = p_cfg->>'database_id'))
  loop
    if p_event in ('card_entered_phase','card_left_phase') and coalesce(a.event_config->>'phase_id','') <> ''
       and a.event_config->>'phase_id' <> p_cfg->>'phase_id' then continue; end if;
    if p_event = 'field_updated' and coalesce(a.event_config->>'field_id','') <> ''
       and not (coalesce(p_cfg->'fields','[]') ? (a.event_config->>'field_id')) then continue; end if;
    if p_card is not null then
      ctx := public._card_ctx(p_card);
      select data into vals from cards where id = p_card;
    else
      ctx := '{}'; vals := p_vals;
    end if;
    ok := public._eval_conds(a.conditions, a.match, vals, ctx);
    if not ok then
      insert into automation_runs(org_id, automation_id, card_id, status) values (a.org_id, a.id, p_card, 'filtered');
      continue;
    end if;
    begin
      for act in select * from jsonb_array_elements(a.actions) loop
        perform public._run_action(act, a, p_card, vals);
      end loop;
      insert into automation_runs(org_id, automation_id, card_id, status) values (a.org_id, a.id, p_card, 'success');
    exception when others then
      insert into automation_runs(org_id, automation_id, card_id, status, detail) values (a.org_id, a.id, p_card, 'error', sqlerrm);
      if a.created_by is not null then
        insert into notifications(org_id, user_id, type, title, body, card_id, board_id)
        values (a.org_id, a.created_by, 'automation_error', 'Falha na automação "' || a.name || '"', sqlerrm, p_card, a.board_id);
      end if;
    end;
  end loop;
end $$;

-- ---------- triggers de cards ----------
create or replace function public._cards_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare ph phases; tf text; f record; v_n int; o jsonb;
begin
  if tg_op = 'INSERT' then
    if new.phase_id is null then
      select id into new.phase_id from phases where board_id = new.board_id and deleted_at is null order by is_final, position limit 1;
    end if;
    if new.created_by is null then new.created_by := public.actor_id(); end if;
    for f in select * from fields where board_id = new.board_id and type = 'sequence' and deleted_at is null loop
      if public._is_empty(new.data->(f.id::text)) then
        o := f.options;
        insert into seq_counters(field_id, n) values (f.id, coalesce((o->>'start')::int, 1))
          on conflict (field_id) do update set n = seq_counters.n + 1 returning seq_counters.n into v_n;
        new.data := new.data || jsonb_build_object(f.id::text,
          coalesce(o->>'prefix','') || lpad(v_n::text, coalesce((o->>'digits')::int, 5), '0') || coalesce(o->>'suffix',''));
      end if;
    end loop;
  end if;
  if tg_op = 'INSERT' or new.phase_id is distinct from old.phase_id then
    select * into ph from phases where id = new.phase_id;
    new.phase_entered_at := now();
    if coalesce(ph.sla_value, 0) > 0 then
      new.due_at := now() + (ph.sla_value || ' ' || coalesce(ph.sla_unit, 'days'))::interval;
      new.due_alerted_at := null; new.overdue_alerted_at := null;
    end if;
    new.finished_at := case when ph.is_final then now() else null end;
  end if;
  select settings->>'title_field' into tf from boards where id = new.board_id;
  if tf is not null and jsonb_typeof(new.data->tf) in ('string','number') and coalesce(new.data->>tf,'') <> '' then
    new.title := left(new.data->>tf, 300);
  end if;
  if coalesce(new.title,'') = '' then new.title := 'Card sem título'; end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;

create or replace function public._cards_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid := public.actor_id(); changed jsonb; po text; pn text;
begin
  if tg_op = 'INSERT' then
    insert into card_phase_history(org_id, card_id, phase_id, entered_by) values (new.org_id, new.id, new.phase_id, actor);
    insert into card_events(org_id, board_id, card_id, actor, type, data)
      values (new.org_id, new.board_id, new.id, actor, 'created', jsonb_build_object('via', new.created_via));
    perform public._audit(new.org_id, 'card.created', 'card', new.id, new.board_id, new.title, jsonb_build_object('via', new.created_via));
    perform public._assign_on_enter(new, true);
    perform public._run_automations('card_created', new.board_id, new.id, new.data, '{}');
    perform public._run_automations('card_entered_phase', new.board_id, new.id, new.data, jsonb_build_object('phase_id', new.phase_id));
    return null;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    insert into card_events(org_id, board_id, card_id, actor, type) values (new.org_id, new.board_id, new.id, actor, 'deleted');
    perform public._audit(new.org_id, 'card.deleted', 'card', new.id, new.board_id, new.title);
    return null;
  end if;
  if new.deleted_at is null and old.deleted_at is not null then
    insert into card_events(org_id, board_id, card_id, actor, type) values (new.org_id, new.board_id, new.id, actor, 'restored');
    perform public._audit(new.org_id, 'card.restored', 'card', new.id, new.board_id, new.title);
    return null;
  end if;

  if new.phase_id is distinct from old.phase_id then
    update card_phase_history set left_at = now(), data_snapshot = old.data where card_id = new.id and left_at is null;
    insert into card_phase_history(org_id, card_id, phase_id, entered_by) values (new.org_id, new.id, new.phase_id, actor);
    select name into po from phases where id = old.phase_id;
    select name into pn from phases where id = new.phase_id;
    insert into card_events(org_id, board_id, card_id, actor, type, data)
      values (new.org_id, new.board_id, new.id, actor, 'moved', jsonb_build_object('from', old.phase_id, 'to', new.phase_id, 'from_name', po, 'to_name', pn));
    perform public._audit(new.org_id, 'card.moved', 'card', new.id, new.board_id, new.title || ': ' || coalesce(po,'') || ' → ' || coalesce(pn,''));
    perform public._assign_on_enter(new, false);
    perform public._run_automations('card_left_phase', new.board_id, new.id, new.data, jsonb_build_object('phase_id', old.phase_id));
    perform public._run_automations('card_entered_phase', new.board_id, new.id, new.data, jsonb_build_object('phase_id', new.phase_id));
  end if;

  if new.data is distinct from old.data then
    select coalesce(jsonb_agg(k), '[]') into changed from (
      select key k from jsonb_each(new.data) n where n.value is distinct from old.data->n.key
      union select key from jsonb_each(old.data) o where not (new.data ? o.key)) s;
    if jsonb_array_length(changed) > 0 then
      insert into card_events(org_id, board_id, card_id, actor, type, data)
      values (new.org_id, new.board_id, new.id, actor, 'fields', jsonb_build_object(
        'fields', changed,
        'old', (select jsonb_object_agg(k, old.data->k) from jsonb_array_elements_text(changed) k),
        'new', (select jsonb_object_agg(k, new.data->k) from jsonb_array_elements_text(changed) k)));
      perform public._run_automations('field_updated', new.board_id, new.id, new.data, jsonb_build_object('fields', changed));
    end if;
  end if;

  if new.due_at is distinct from old.due_at and new.phase_id is not distinct from old.phase_id then
    insert into card_events(org_id, board_id, card_id, actor, type, data)
      values (new.org_id, new.board_id, new.id, actor, 'due', jsonb_build_object('from', old.due_at, 'to', new.due_at));
  end if;
  return null;
end $$;

create trigger cards_before before insert or update on public.cards for each row execute function public._cards_before();
create trigger cards_after after insert or update on public.cards for each row execute function public._cards_after();

-- responsáveis: evento + notificação + primeiro contato
create or replace function public._assignee_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c cards; actor uuid := public.actor_id();
begin
  if tg_op = 'INSERT' then
    select * into c from cards where id = new.card_id;
    insert into card_events(org_id, board_id, card_id, actor, type, data)
      values (c.org_id, c.board_id, c.id, actor, 'assignee_added', jsonb_build_object('user_id', new.user_id));
    if new.user_id is distinct from actor then
      insert into notifications(org_id, user_id, type, title, body, card_id, board_id)
      values (c.org_id, new.user_id, 'assigned', 'Você é responsável por um card', c.title, c.id, c.board_id);
    end if;
    return null;
  else
    select * into c from cards where id = old.card_id;
    if c.id is not null then
      insert into card_events(org_id, board_id, card_id, actor, type, data)
        values (c.org_id, c.board_id, c.id, actor, 'assignee_removed', jsonb_build_object('user_id', old.user_id));
    end if;
    return null;
  end if;
end $$;
create trigger card_assignees_after after insert or delete on public.card_assignees for each row execute function public._assignee_after();

create or replace function public._cardtag_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c cards; tid uuid := coalesce(new.tag_id, old.tag_id); cid uuid := coalesce(new.card_id, old.card_id);
begin
  select * into c from cards where id = cid;
  if c.id is null then return null; end if;
  insert into card_events(org_id, board_id, card_id, actor, type, data)
    values (c.org_id, c.board_id, c.id, public.actor_id(), case when tg_op = 'INSERT' then 'tag_added' else 'tag_removed' end,
            jsonb_build_object('tag_id', tid, 'name', (select name from tags where id = tid)));
  return null;
end $$;
create trigger card_tags_after after insert or delete on public.card_tags for each row execute function public._cardtag_after();

-- comentários: menções e primeiro contato
create or replace function public._comment_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c cards; u uuid; author_name text;
begin
  select * into c from cards where id = new.card_id;
  select coalesce(full_name, email) into author_name from profiles where id = new.author;
  insert into card_events(org_id, board_id, card_id, actor, type, data)
    values (c.org_id, c.board_id, c.id, new.author, 'comment', jsonb_build_object('comment_id', new.id));
  foreach u in array new.mentions loop
    if u <> new.author then
      insert into notifications(org_id, user_id, type, title, body, card_id, board_id)
      values (c.org_id, u, 'mention', coalesce(author_name,'Alguém') || ' mencionou você', left(new.body, 200), c.id, c.board_id);
    end if;
  end loop;
  if c.first_contact_at is null then update cards set first_contact_at = now() where id = c.id; end if;
  return null;
end $$;
create trigger comments_after after insert on public.comments for each row execute function public._comment_after();

-- tarefas: evento, notificação e gatilho "atividade concluída"
create or replace function public._task_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c cards;
begin
  select * into c from cards where id = new.card_id;
  if tg_op = 'INSERT' then
    insert into card_events(org_id, board_id, card_id, actor, type, data)
      values (c.org_id, c.board_id, c.id, public.actor_id(), 'task_created', jsonb_build_object('title', new.title));
    if new.assignee is not null and new.assignee is distinct from public.actor_id() then
      insert into notifications(org_id, user_id, type, title, body, card_id, board_id)
      values (c.org_id, new.assignee, 'task', 'Nova atividade: ' || new.title, c.title, c.id, c.board_id);
    end if;
  elsif new.done_at is not null and old.done_at is null then
    insert into card_events(org_id, board_id, card_id, actor, type, data)
      values (c.org_id, c.board_id, c.id, public.actor_id(), 'task_done', jsonb_build_object('title', new.title));
    if c.first_contact_at is null then update cards set first_contact_at = now() where id = c.id; end if;
    perform public._run_automations('task_completed', c.board_id, c.id, c.data, jsonb_build_object('task_id', new.id));
  end if;
  return null;
end $$;
create trigger tasks_after after insert or update on public.tasks for each row execute function public._task_after();

-- registros de database
create or replace function public._records_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare tf text;
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := public.actor_id(); end if;
    perform public._validate_values(null, new.database_id, new.data, new.id, true);
  elsif new.data is distinct from old.data then
    perform public._validate_values(null, new.database_id, new.data, new.id, false);
  end if;
  select settings->>'title_field' into tf from databases where id = new.database_id;
  if tf is not null and coalesce(new.data->>tf,'') <> '' then new.title := left(new.data->>tf, 300); end if;
  if coalesce(new.title,'') = '' then new.title := 'Registro sem título'; end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status = 'disabled' and old.status = 'active' then new.disabled_at := now(); end if;
    if new.status = 'active' then new.disabled_at := null; end if;
  end if;
  return new;
end $$;
create or replace function public._records_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public._audit(new.org_id, 'record.created', 'record', new.id, null, new.title, jsonb_build_object('database_id', new.database_id));
    perform public._run_automations('record_created', null, null, new.data, jsonb_build_object('database_id', new.database_id));
  elsif new.status is distinct from old.status then
    perform public._audit(new.org_id, 'record.status', 'record', new.id, null, new.title || ' → ' || new.status);
    perform public._run_automations('record_status_changed', null, null, new.data, jsonb_build_object('database_id', new.database_id, 'status', new.status));
  elsif new.deleted_at is not null and old.deleted_at is null then
    perform public._audit(new.org_id, 'record.deleted', 'record', new.id, null, new.title);
  end if;
  return null;
end $$;
create trigger records_before before insert or update on public.records for each row execute function public._records_before();
create trigger records_after after insert or update on public.records for each row execute function public._records_after();

-- auditoria de estrutura
create or replace function public._struct_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare ent text := tg_argv[0]; b uuid; nm text;
begin
  if ent = 'board' then b := new.id; nm := new.name;
  elsif ent = 'phase' then b := new.board_id; nm := new.name;
  elsif ent = 'field' then b := new.board_id; nm := new.label;
  else b := null; nm := new.name; end if;
  if tg_op = 'INSERT' then
    perform public._audit(new.org_id, ent || '.created', ent, new.id, b, nm);
  elsif new.deleted_at is not null and old.deleted_at is null then
    perform public._audit(new.org_id, ent || '.deleted', ent, new.id, b, nm);
  elsif new.deleted_at is null and old.deleted_at is not null then
    perform public._audit(new.org_id, ent || '.restored', ent, new.id, b, nm);
  end if;
  return null;
end $$;
create trigger boards_audit after insert or update on public.boards for each row execute function public._struct_audit('board');
create trigger phases_audit after insert or update on public.phases for each row execute function public._struct_audit('phase');
create trigger fields_audit after insert or update on public.fields for each row execute function public._struct_audit('field');
create trigger databases_audit after insert or update on public.databases for each row execute function public._struct_audit('database');

-- ---------- perfil e convites ----------
create or replace function public._on_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv record;
begin
  insert into profiles(id, email, full_name, phone)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  for inv in select * from invitations where lower(email) = lower(new.email) and accepted_at is null loop
    insert into memberships(org_id, user_id, role) values (inv.org_id, new.id, inv.role) on conflict do nothing;
    update invitations set accepted_at = now() where id = inv.id;
  end loop;
  if exists (select 1 from platform_admin_emails where lower(email) = lower(new.email)) then
    insert into platform_admins(user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public._on_auth_user();

-- funções internas não ficam expostas pela API
revoke execute on function public._audit(uuid,text,text,uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke execute on function public._validate_values(uuid,uuid,jsonb,uuid,boolean) from public, anon, authenticated;
revoke execute on function public._assign_on_enter(public.cards,boolean) from public, anon, authenticated;
revoke execute on function public._run_action(jsonb,public.automations,uuid,jsonb) from public, anon, authenticated;
revoke execute on function public._run_automations(text,uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public._card_ctx(uuid) from public, anon, authenticated;
