# Domma CRM

CRM sem código da Domma Tecnologia: boards, fases, campos, formulários, regras de campo, automações, databases, relatórios e dashboard. Multiempresa desde o primeiro dia (isolamento por `org_id` + Row Level Security).

- **Produção:** https://crm.dommasistemas.com.br (Vercel, time REDBOX)
- **Banco:** Supabase `domma-crm` (região São Paulo)

## Stack

| Camada | Escolha |
|---|---|
| Front-end | Next.js 15 (App Router) + React 19 + Tailwind CSS 4 |
| Back-end / banco | Supabase: PostgreSQL, Auth, Storage, Realtime, RLS |
| Regras do processo | Funções e triggers em PL/pgSQL (valem igual para tela, webhook, API e automações) |
| Agendamentos | `pg_cron` (alertas de vencimento a cada 5 min) |
| Webhooks de saída | `pg_net` |
| Hospedagem | Vercel |

## Estrutura

```
src/
  app/
    (app)/            telas logadas: Início, board, databases, automações, tarefas, configurações, Super Admin
    api/webhook/      webhook de entrada por board (POST JSON)
    api/v1/           API REST com chave (boards, cards, mover, databases, relatórios p/ Power BI)
    login, signup, onboarding
  components/
    board/            Kanban, card, lista, relatórios, dashboard, automações, configurações, construtor de campos
    FieldInput.tsx    os 22 tipos de campo + CEP, placa, avaliação, URL, dias entre datas
  lib/                cliente Supabase, tipos, campos/fórmulas/regras, filtros
supabase/migrations/  schema, RLS, lógica, RPCs, cron e endurecimento de permissões
public/               logotipo e ícones do app (PWA)
```

## Rodando localmente

```bash
cp .env.example .env.local   # preencha com a URL e a chave publicável do Supabase
npm install
npm run dev
```

## Banco de dados

As migrações em `supabase/migrations` estão na ordem em que foram aplicadas ao projeto. Para recriar em outro projeto Supabase, aplique-as em sequência (SQL Editor ou `supabase db push`).

Pontos principais:
- `0001_schema.sql`: tabelas, funções de permissão (`board_access`, `can_view_card`...) e políticas RLS.
- `0002_logic.sql`: triggers de card (SLA, distribuição em rodízio, fase final, sequenciador, histórico), motor de automações e auditoria.
- `0003_rpc.sql`: criar/mover/editar cards com validação, templates de board, duplicar board, importação, API, webhook, Super Admin.
- `0008_hardening.sql`: funções internas fora da API e RPCs só para usuários logados.

## Deploy

O projeto da Vercel (time REDBOX) está ligado a este repositório:

- push na `main` → publica em produção (https://crm.dommasistemas.com.br);
- push em outra branch ou pull request → gera uma URL de pré-visualização.

Publicação manual, se precisar:

```bash
npx vercel deploy --prod --scope redbox6
```

As variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` ficam salvas no projeto da Vercel.

## Especificação

Baseado na *Especificação funcional Domma CRM v2.3*. Fora desta versão (Fase 2/3): editor visual de fluxos, formulários públicos e portais, e-mail no card, temporizador, calendário, Domma Chat, campanhas, conectores nativos Meta/Google, IA e cobrança.
