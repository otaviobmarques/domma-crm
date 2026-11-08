"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { Badge, Button, Empty, Modal, PageLoader, useToast } from "@/components/ui";
import { TEMPLATES } from "@/lib/templates";
import { fmtDate } from "@/lib/fields";

const STATUS: Record<string, { l: string; c: string }> = { trial: { l: "Teste", c: "#3B82F6" }, active: { l: "Ativa", c: "#10B981" }, overdue: { l: "Inadimplente", c: "#F59E0B" }, suspended: { l: "Suspensa", c: "#EF4444" }, canceled: { l: "Cancelada", c: "#6B7280" } };
const PLANS = ["essencial", "profissional", "rede", "customizado"];

export default function Admin() {
  const { isPlatformAdmin, reloadOrgs } = useApp(); const toast = useToast();
  const [orgs, setOrgs] = useState<any[] | null>(null); const [q, setQ] = useState(""); const [st, setSt] = useState(""); const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", cnpj: "", segment: "Automotivo", plan: "essencial", admin_email: "", template: "franquias", parent: "" }); const [busy, setBusy] = useState(false);
  const load = useCallback(() => supabase.rpc("admin_orgs").then(({ data }) => setOrgs(data ?? [])), []);
  useEffect(() => { if (isPlatformAdmin) load(); }, [isPlatformAdmin, load]);
  if (!isPlatformAdmin) return <div className="p-8"><Empty icon="◆" title="Área restrita à equipe Domma" /></div>;
  if (!orgs) return <PageLoader />;
  async function create() {
    if (!f.name || !f.admin_email) return toast("Nome e e-mail do admin são obrigatórios.", "err");
    setBusy(true);
    const { error } = await supabase.rpc("admin_create_org", { p_name: f.name, p_cnpj: f.cnpj || null, p_segment: f.segment, p_plan: f.plan, p_admin_email: f.admin_email, p_template: f.template, p_parent: f.parent || null });
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    toast("Organização criada. O admin entra ao criar a conta com esse e-mail (ou já foi adicionado, se tinha conta)."); setOpen(false); load(); reloadOrgs();
  }
  async function update(id: string, status: string | null, plan: string | null) { const { error } = await supabase.rpc("admin_update_org", { p_org: id, p_status: status, p_plan: plan }); if (error) toast(errMsg(error), "err"); load(); }
  const shown = orgs.filter((o) => (!st || o.status === st) && (o.name + (o.cnpj ?? "")).toLowerCase().includes(q.toLowerCase()));
  const count = (s: string) => orgs.filter((o) => o.status === s).length;
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-bold">Super Admin <span className="text-brand">Domma</span></h1><p className="text-sm text-ink-3">Organizações da plataforma, indicadores e criação de clientes.</p></div>
        <Button variant="primary" onClick={() => setOpen(true)}>+ Nova organização</Button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[["Organizações", orgs.length], ["Ativas", count("active")], ["Em teste", count("trial")], ["Inadimplentes", count("overdue")], ["Usuários", orgs.reduce((s, o) => s + Number(o.users), 0)]].map(([l, v]) => (
          <div key={l as string} className="rounded-[16px] border border-line p-4"><div className="text-xs font-semibold text-ink-3">{l}</div><div className="num text-[22px] font-bold">{v}</div></div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <input className="input !w-64" placeholder="Buscar por nome ou CNPJ…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto" value={st} onChange={(e) => setSt(e.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select>
      </div>
      <div className="mt-3 overflow-x-auto rounded-[16px] border border-line scroll-thin">
        <table className="w-full text-sm"><thead className="bg-soft text-left text-xs"><tr><th className="px-3 py-2">Organização</th><th>CNPJ</th><th>Plano</th><th>Status</th><th>Usuários</th><th>Cards</th><th>Automações/mês</th><th>Criada</th><th>Última atividade</th></tr></thead>
          <tbody>{shown.map((o) => (
            <tr key={o.id} className="border-t border-line">
              <td className="px-3 py-2"><div className="font-semibold">{o.name}</div><div className="text-xs text-ink-3">{o.segment}{o.parent_id && ` · unidade de ${orgs.find((x) => x.id === o.parent_id)?.name ?? "rede"}`}</div></td>
              <td className="num text-xs">{o.cnpj}</td>
              <td><select className="input !w-auto !py-1 text-xs" value={o.plan} onChange={(e) => update(o.id, null, e.target.value)}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select></td>
              <td><select className="input !w-auto !py-1 text-xs font-semibold" style={{ color: STATUS[o.status]?.c }} value={o.status} onChange={(e) => { if (e.target.value === "canceled" && !confirm("Cancelar esta organização? Os dados ficam disponíveis para exportação por 30 dias.")) return; update(o.id, e.target.value, null); }}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select></td>
              <td className="num">{o.users}</td><td className="num">{o.cards}</td><td className="num">{o.automations_month}</td>
              <td className="num text-xs">{fmtDate(o.created_at)}</td><td className="num text-xs">{fmtDate(o.last_activity, true)}</td>
            </tr>
          ))}</tbody></table>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-ink-3">{Object.entries(STATUS).map(([k, v]) => <Badge key={k} color={v.c}>{v.l}: {count(k)}</Badge>)}</div>
      <Modal open={open} onClose={() => setOpen(false)} wide title="Nova organização" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" loading={busy} onClick={create}>Criar organização</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Nome</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label">CNPJ</label><input className="input" value={f.cnpj} onChange={(e) => setF({ ...f, cnpj: e.target.value })} /></div>
          <div><label className="label">Segmento</label><input className="input" value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value })} /></div>
          <div><label className="label">Plano</label><select className="input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{PLANS.map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><label className="label">E-mail do admin do cliente</label><input className="input" type="email" value={f.admin_email} onChange={(e) => setF({ ...f, admin_email: e.target.value })} /></div>
          <div><label className="label">Modelo inicial de board</label><select className="input" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Nenhum</option></select></div>
          <div className="sm:col-span-2"><label className="label">Organização-mãe (rede de franquias)</label><select className="input" value={f.parent} onChange={(e) => setF({ ...f, parent: e.target.value })}><option value="">Nenhuma</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
        </div>
      </Modal>
    </div>
  );
}
