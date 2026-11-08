-- busca em qualquer campo (o Goalfy só busca título/subtítulo em campos conectados)
create or replace function public.search_records(p_db uuid, p_q text, p_limit int default 20)
returns setof public.records language sql stable security invoker set search_path = public as $$
  select * from records where database_id = p_db and deleted_at is null and status = 'active'
    and (coalesce(p_q,'') = '' or title ilike '%' || p_q || '%' or data::text ilike '%' || p_q || '%')
  order by updated_at desc limit p_limit
$$;
create or replace function public.search_cards(p_board uuid, p_q text, p_limit int default 20)
returns setof public.cards language sql stable security invoker set search_path = public as $$
  select * from cards where board_id = p_board and deleted_at is null
    and (coalesce(p_q,'') = '' or title ilike '%' || p_q || '%' or data::text ilike '%' || p_q || '%')
  order by updated_at desc limit p_limit
$$;
