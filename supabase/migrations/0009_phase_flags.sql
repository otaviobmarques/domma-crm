-- Domma CRM · 0009 · arquivar fase e criação de cards direto na fase
alter table public.phases add column if not exists archived boolean not null default false;
alter table public.phases add column if not exists create_enabled boolean not null default false;
