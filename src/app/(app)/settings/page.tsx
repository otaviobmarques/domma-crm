"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { Avatar, Badge, Button, Modal, PageLoader, Tabs, Toggle, useToast } from "@/components/ui";
import { roleLabel } from "@/components/board/BoardSettings";
import { downloadFile, fmtDate, toCSV } from "@/lib/fields";

type Tab = "user" | "org" | "team" | "logs" | "usage" | "api";
export default function Page() { return <Suspense fallback={<PageLoader />}><Settings /></Suspense>; }

function Settings() {
  const { role } = useApp(); const sp = useSearchParams(); const router = useRouter();
  const tab = (sp.get("tab") as Tab) || "user";
  const tabs: { id: Tab; label: string }[] = [{ id: "user", label: "Usuário" }, { id: "org", label: "Organização" }, { id: "team", label: "Equipe" }, ...(role === "admin" ? [{ id: "logs" as Tab, label: "Logs" }, { id: "usage" as Tab, label: "Consumo" }] : []), { id: "api", label: "API" }];
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <h1 className="text-[22px] font-bold">Configurações</h1>
      <Tabs className="mt-4" value={tab} onChange={(t) => router.replace(`/settings?tab=${t}`)} tabs={tabs} />
      <div className="pt-6">
        {tab === "user" && <UserTab />}
        {tab === "org" && <OrgTab />}
        {tab === "team" && <TeamTab />}
        {tab === "logs" && <LogsTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "api" && <ApiDocs />}
      </div>
    </div>
  );
}

function UserTab() {
  const { profile, org, reloadProfile, session } = useApp(); const toast = useToast();
  const [name, setName] = useState(profile.full_name ?? ""); const [phone, setPhone] = useState(profile.phone ?? "");
  const [pw, setPw] = useState(""); const [keys, setKeys] = useState<any[]>([]); const [newKey, setNewKey] = useState<string | null>(null);
  const loadKeys = useCallback(() => supabase.from("api_keys").select("*").eq("org_id", org.id).is("revoked_at", null).order("created_at", { ascending: false }).then(({ data }) => setKeys(data ?? [])), [org.id]);
  useEffect(() => { loadKeys(); }, [loadKeys]);
  async function save() {
    const { error } = await supabase.from("profiles").update({ full_name: name, phone }).eq("id", session.user.id);
    if (error) return toast(errMsg(error), "err"); toast("Perfil salvo"); reloadProfile();
  }
  async function changePw() {
    if (pw.length < 8) return toast("A senha precisa de pelo menos 8 caracteres.", "err");
    const { error } = await supabase.auth.updateUser({ password: pw }); if (error) return toast(errMsg(error), "err"); setPw(""); toast("Senha alterada");
  }
  async function createKey() {
    const label = prompt("Nome da chave (ex.: Power BI, Make):"); if (!label) return;
    const { data, error } = await supabase.rpc("create_api_key", { p_org: org.id, p_name: label });
    if (error) return toast(errMsg(error), "err"); setNewKey(data as string); loadKeys();
  }
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-3">
        <h2 className="font-bold">Perfil</h2>
        <div className="flex items-center gap-3"><Avatar name={name || profile.email} size={48} /><div className="text-sm text-ink-3">{profile.email}</div></div>
        <div><label className="label">Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Telefone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <Button variant="primary" onClick={save}>Salvar perfil</Button>
        <h2 className="pt-4 font-bold">Trocar senha</h2>
        <div className="flex gap-2"><input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Nova senha" autoComplete="new-password" /><Button onClick={changePw}>Alterar</Button></div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-bold">Chaves de API · {org.name}</h2><Button size="sm" variant="primary" onClick={createKey}>+ Gerar chave</Button></div>
        <p className="text-xs text-ink-3">As chaves agem com as suas permissões. Use no header <span className="num">Authorization: Bearer &lt;chave&gt;</span>.</p>
        {keys.map((k) => (
          <div key={k.id} className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-2 text-sm">
            <span className="flex-1"><b>{k.name}</b><span className="num ml-2 text-xs text-ink-3">{k.prefix}…</span><div className="text-xs text-ink-3">criada {fmtDate(k.created_at)}{k.last_used_at && ` · usada ${fmtDate(k.last_used_at, true)}`}</div></span>
            <Button size="sm" variant="danger" onClick={async () => { if (confirm("Revogar esta chave?")) { await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id); loadKeys(); } }}>Revogar</Button>
          </div>
        ))}
        {keys.length === 0 && <div className="text-xs text-ink-3">Nenhuma chave ativa.</div>}
      </div>
      <Modal open={!!newKey} onClose={() => setNewKey(null)} title="Chave gerada" footer={<Button variant="primary" onClick={() => setNewKey(null)}>Já copiei</Button>}>
        <p className="mb-2 text-sm text-ink-2">Copie agora: por segurança ela não será exibida de novo.</p>
        <div className="flex gap-2"><input readOnly className="input num text-xs" value={newKey ?? ""} /><Button onClick={() => { navigator.clipboard.writeText(newKey ?? ""); toast("Copiada"); }}>Copiar</Button></div>
      </Modal>
    </div>
  );
}

function OrgTab() {
  const { org, role, reloadOrgs } = useApp(); const toast = useToast();
  const [name, setName] = useState(org.name); const [cnpj, setCnpj] = useState(org.cnpj ?? ""); const [s, setS] = useState<Record<string, any>>(org.settings ?? {});
  const admin = role === "admin";
  async function save() {
    const { error } = await supabase.from("organizations").update({ name, cnpj: cnpj || null, settings: s }).eq("id", org.id);
    if (error) return toast(errMsg(error), "err"); toast("Organização salva"); reloadOrgs();
  }
  const perm = (k: string, label: string, def = false) => <Toggle disabled={!admin} checked={s[k] ?? def} onChange={(v) => setS({ ...s, [k]: v })} label={label} />;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label">Nome</label><input disabled={!admin} className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">CNPJ</label><input disabled={!admin} className="input" value={cnpj} onChange={(e) => setCnpj(e.target.value)} /></div>
      </div>
      <div className="text-xs text-ink-3">ID da organização: <span className="num font-bold">{org.id}</span> · Plano {org.plan} · {org.status}</div>
      <div className="space-y-3 rounded-[16px] border border-line p-4">
        <div className="font-bold">Permissões</div>
        {perm("admins_only_invite", "Só administradores convidam usuários", true)}
        {perm("admins_only_boards", "Só administradores criam boards")}
        {perm("admins_only_databases", "Só administradores criam databases")}
        {perm("hide_members", "Só administradores veem a lista de membros")}
      </div>
      {admin && <Button variant="primary" onClick={save}>Salvar</Button>}
    </div>
  );
}

function TeamTab() {
  const { org, role, members, reloadMembers, session } = useApp(); const toast = useToast();
  const [email, setEmail] = useState(""); const [r, setR] = useState("member"); const [invites, setInvites] = useState<any[]>([]);
  const admin = role === "admin";
  const loadInv = useCallback(() => { if (admin) supabase.from("invitations").select("*").eq("org_id", org.id).is("accepted_at", null).then(({ data }) => setInvites(data ?? [])); }, [admin, org.id]);
  useEffect(() => { loadInv(); }, [loadInv]);
  async function invite() {
    if (!email.includes("@")) return toast("Informe um e-mail válido.", "err");
    const { data, error } = await supabase.rpc("invite_member", { p_org: org.id, p_email: email, p_role: r });
    if (error) return toast(errMsg(error), "err");
    toast(data === "added" ? "Usuário adicionado à organização" : "Convite registrado: ao criar a conta com este e-mail, a pessoa entra automaticamente.");
    setEmail(""); reloadMembers(); loadInv();
  }
  async function setRole(uid: string, role: string) { const { error } = await supabase.from("memberships").update({ role }).eq("org_id", org.id).eq("user_id", uid); if (error) toast(errMsg(error), "err"); reloadMembers(); }
  async function remove(uid: string) { if (!confirm("Remover este usuário da organização?")) return; await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", uid); reloadMembers(); }
  const hide = org.settings?.hide_members && !admin;
  return (
    <div className="space-y-6">
      {admin && <div className="rounded-[16px] border border-line p-4">
        <div className="mb-2 font-bold">Convidar</div>
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1" type="email" placeholder="email@empresa.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="input !w-48" value={r} onChange={(e) => setR(e.target.value)}><option value="member">Membro</option><option value="admin">Admin</option><option value="limited">Visão limitada</option><option value="guest">Convidado (não paga)</option></select>
          <Button variant="primary" onClick={invite}>Convidar</Button>
        </div>
        {invites.length > 0 && <div className="mt-3 space-y-1 text-sm">{invites.map((i) => <div key={i.id} className="flex items-center gap-2"><Badge color="#F59E0B">pendente</Badge>{i.email} · {roleLabel(i.role)}<button className="ml-auto text-xs text-ink-3 hover:text-red-600" onClick={async () => { await supabase.from("invitations").delete().eq("id", i.id); loadInv(); }}>cancelar</button></div>)}</div>}
      </div>}
      {hide ? <div className="text-sm text-ink-3">A lista de membros está visível apenas para administradores.</div> : (
        <div className="overflow-hidden rounded-[16px] border border-line">
          <table className="w-full text-sm"><thead className="bg-soft text-left text-xs"><tr><th className="px-3 py-2">Membro</th><th>Telefone</th><th>Nível</th><th /></tr></thead>
            <tbody>{members.map((m) => (
              <tr key={m.user_id} className="border-t border-line">
                <td className="px-3 py-2"><div className="flex items-center gap-2"><Avatar name={m.profile.full_name || m.profile.email} size={28} /><div><div className="font-semibold">{m.profile.full_name}</div><div className="text-xs text-ink-3">{m.profile.email}</div></div></div></td>
                <td className="text-xs">{m.profile.phone}</td>
                <td>{admin && m.user_id !== session.user.id ? <select className="input !w-auto !py-1" value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}><option value="admin">Admin</option><option value="member">Membro</option><option value="limited">Visão limitada</option><option value="guest">Convidado</option></select> : roleLabel(m.role)}</td>
                <td className="pr-3 text-right">{admin && m.user_id !== session.user.id && <button className="text-xs text-ink-3 hover:text-red-600" onClick={() => remove(m.user_id)}>remover</button>}</td>
              </tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  );
}

const ACTIONS: Record<string, string> = { "card.created": "Criou card", "card.moved": "Moveu card", "card.deleted": "Excluiu card", "card.restored": "Restaurou card", "record.created": "Criou registro", "record.deleted": "Excluiu registro", "record.status": "Status do registro", "board.created": "Criou board", "board.deleted": "Excluiu board", "phase.created": "Criou fase", "phase.deleted": "Excluiu fase", "field.created": "Criou campo", "field.deleted": "Excluiu campo", "member.added": "Adicionou membro", "member.invited": "Convidou membro", "org.created": "Criou organização", "database.created": "Criou database" };
function LogsTab() {
  const { org, memberMap, members } = useApp();
  const [logs, setLogs] = useState<any[] | null>(null); const [q, setQ] = useState(""); const [actor, setActor] = useState(""); const [action, setAction] = useState(""); const [period, setPeriod] = useState("7");
  const [boards, setBoards] = useState<Record<string, string>>({}); const [board, setBoard] = useState("");
  useEffect(() => { supabase.from("boards").select("id,name").eq("org_id", org.id).then(({ data }) => setBoards(Object.fromEntries((data ?? []).map((b) => [b.id, b.name])))); }, [org.id]);
  useEffect(() => {
    let qb = supabase.from("audit_logs").select("*").eq("org_id", org.id).order("created_at", { ascending: false }).limit(1000);
    if (period !== "all") { const d = new Date(); if (period === "month") d.setDate(1); else d.setDate(d.getDate() - Number(period)); if (period === "0" || period === "month") d.setHours(0, 0, 0, 0); qb = qb.gte("created_at", d.toISOString()); }
    if (actor) qb = qb.eq("actor", actor); if (action) qb = qb.eq("action", action); if (board) qb = qb.eq("board_id", board);
    qb.then(({ data }) => setLogs(data ?? []));
  }, [org.id, period, actor, action, board]);
  const shown = (logs ?? []).filter((l) => !q || (l.summary ?? "").toLowerCase().includes(q.toLowerCase()));
  const name = (id: string | null) => (id ? memberMap[id]?.full_name || memberMap[id]?.email || "Usuário" : "Sistema");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input className="input !w-56" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="0">Hoje</option><option value="7">7 dias</option><option value="30">30 dias</option><option value="month">Este mês</option><option value="all">Tudo</option></select>
        <select className="input !w-auto" value={actor} onChange={(e) => setActor(e.target.value)}><option value="">Todos os responsáveis</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.full_name || m.profile.email}</option>)}</select>
        <select className="input !w-auto" value={action} onChange={(e) => setAction(e.target.value)}><option value="">Todas as ações</option>{Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="input !w-auto" value={board} onChange={(e) => setBoard(e.target.value)}><option value="">Todos os boards</option>{Object.entries(boards).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <Button onClick={() => downloadFile("logs.csv", toCSV([["Data", "Quem", "Ação", "Board", "Detalhe"], ...shown.map((l) => [fmtDate(l.created_at, true), name(l.actor), ACTIONS[l.action] ?? l.action, boards[l.board_id] ?? "", l.summary])]))}>Exportar</Button>
      </div>
      {!logs ? <PageLoader /> : <div className="overflow-hidden rounded-[16px] border border-line"><table className="w-full text-sm">
        <thead className="bg-soft text-left text-xs"><tr><th className="px-3 py-2">Data</th><th>Quem</th><th>Ação</th><th>Board</th><th>Detalhe</th><th>Status</th></tr></thead>
        <tbody>{shown.map((l) => <tr key={l.id} className="border-t border-line"><td className="num whitespace-nowrap px-3 py-2 text-xs">{fmtDate(l.created_at, true)}</td><td className="text-xs">{name(l.actor)}</td><td className="text-xs font-semibold">{ACTIONS[l.action] ?? l.action}</td><td className="text-xs">{boards[l.board_id] ?? ""}</td><td className="max-w-[320px] truncate text-xs">{l.summary}</td><td><Badge color="#10B981">ok</Badge></td></tr>)}
          {shown.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-ink-3">Nenhum registro no período.</td></tr>}</tbody>
      </table></div>}
    </div>
  );
}

function UsageTab() {
  const { org, members } = useApp(); const [u, setU] = useState<any>(null);
  useEffect(() => {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    Promise.all([
      supabase.from("automation_runs").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("created_at", since.toISOString()).eq("status", "success"),
      supabase.from("automation_runs").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("created_at", since.toISOString()).eq("status", "error"),
      supabase.from("cards").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("deleted_at", null),
      supabase.from("records").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("deleted_at", null),
      supabase.from("boards").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("deleted_at", null),
      supabase.from("webhook_requests").select("id", { count: "exact", head: true }).eq("org_id", org.id).gte("created_at", since.toISOString()),
    ]).then(([a, e, c, r, b, w]) => setU({ runs: a.count, errs: e.count, cards: c.count, records: r.count, boards: b.count, webhooks: w.count }));
  }, [org.id]);
  if (!u) return <PageLoader />;
  const limit = org.plan === "profissional" ? 20000 : 2000;
  const paid = members.filter((m) => m.role !== "guest").length;
  const Box = ({ l, v, s }: { l: string; v: any; s?: string }) => <div className="rounded-[16px] border border-line p-4"><div className="text-xs font-semibold text-ink-3">{l}</div><div className="num mt-1 text-[22px] font-bold">{(v ?? 0).toLocaleString("pt-BR")}</div>{s && <div className="text-xs text-ink-3">{s}</div>}</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Box l="Execuções de automação no mês" v={u.runs} s={`${u.errs} com erro · limite do plano ${limit.toLocaleString("pt-BR")}`} />
        <Box l="Usuários pagantes" v={paid} s="Convidados não contam" />
        <Box l="Webhooks recebidos no mês" v={u.webhooks} />
        <Box l="Boards" v={u.boards} /><Box l="Cards" v={u.cards} /><Box l="Registros" v={u.records} />
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-soft"><div className="h-full bg-action" style={{ width: `${Math.min(100, ((u.runs ?? 0) / limit) * 100)}%` }} /></div>
      <p className="text-xs text-ink-3">Ao atingir o limite, o sistema avisa e continua funcionando por um período de tolerância.</p>
    </div>
  );
}

function ApiDocs() {
  const base = typeof window !== "undefined" ? `${location.origin}/api/v1` : "/api/v1";
  const rows = [
    ["GET", "/boards", "Lista boards, fases e campos (com IDs e chaves integradas)"],
    ["GET", "/boards/:id/cards?phase=&limit=&offset=", "Lista cards do board"],
    ["POST", "/boards/:id/cards", "Cria card. Corpo: { values: { campo_id ou chave_integrada: valor }, phase_id? }"],
    ["PATCH", "/cards/:id", "Atualiza campos. Corpo: { values: {...} }"],
    ["POST", "/cards/:id/move", "Move de fase (respeita obrigatórios e regras). Corpo: { phase_id }"],
    ["GET", "/databases/:id/records", "Lista registros da database"],
    ["GET", "/reports/:id", "Relatório salvo em JSON plano (Power BI). Aceita ?key="],
    ["POST", "/api/webhook/:token", "Webhook de entrada por board (sem chave; URL em Configurações do board › Integrações)"],
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">Autentique com <span className="num">Authorization: Bearer &lt;chave&gt;</span> (gere em Usuário). Base: <span className="num font-bold">{base}</span></p>
      <div className="overflow-hidden rounded-[16px] border border-line"><table className="w-full text-sm"><tbody>{rows.map(([m, p, d]) => <tr key={p} className="border-t border-line first:border-0"><td className="px-3 py-2"><Badge color={m === "GET" ? "#3B82F6" : m === "POST" ? "#10B981" : "#F59E0B"}>{m}</Badge></td><td className="num text-xs">{p}</td><td className="text-xs text-ink-2">{d}</td></tr>)}</tbody></table></div>
      <pre className="num overflow-x-auto rounded-[12px] bg-ink p-3 text-xs text-white">{`curl ${base}/boards -H "Authorization: Bearer dcrm_..."\n\ncurl -X POST ${base}/boards/BOARD_ID/cards \\\n  -H "Authorization: Bearer dcrm_..." -H "Content-Type: application/json" \\\n  -d '{"values":{"nome":"Maria","telefone":"11999990000"}}'`}</pre>
    </div>
  );
}
