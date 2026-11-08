"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { Badge, Empty, PageLoader, Toggle } from "@/components/ui";
import { EVENTS } from "@/components/board/Automations";

export default function OrgAutomations() {
  const { org, role } = useApp();
  const [list, setList] = useState<any[] | null>(null); const [q, setQ] = useState(""); const [runs, setRuns] = useState<Record<string, { ok: number; err: number }>>({});
  const load = () => supabase.from("automations").select("*, boards!inner(id, name, icon, org_id)").eq("boards.org_id", org.id).is("deleted_at", null).order("name").then(async ({ data }) => {
    setList(data ?? []);
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const { data: r } = await supabase.from("automation_runs").select("automation_id, status").eq("org_id", org.id).gte("created_at", since.toISOString()).limit(5000);
    const m: Record<string, { ok: number; err: number }> = {};
    (r ?? []).forEach((x) => { m[x.automation_id] ??= { ok: 0, err: 0 }; if (x.status === "error") m[x.automation_id].err++; else if (x.status === "success") m[x.automation_id].ok++; });
    setRuns(m);
  });
  useEffect(() => { setList(null); load(); }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (list ?? []).filter((a) => (a.name + a.boards.name).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-bold">Automações</h1><p className="text-sm text-ink-3">Todas as automações da organização. Edite cada uma na aba Automações do board.</p></div>
        <input className="input !w-64" placeholder="Buscar automações…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!list ? <PageLoader /> : shown.length === 0 ? <div className="mt-6"><Empty icon="⚡" title="Nenhuma automação">Abra um board › Automações para criar a primeira.</Empty></div> : (
        <div className="mt-6 space-y-2">
          {shown.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-[16px] border border-line bg-white p-3 shadow-soft">
              <Toggle checked={a.enabled} disabled={role !== "admin"} onChange={async () => { await supabase.from("automations").update({ enabled: !a.enabled }).eq("id", a.id); load(); }} />
              <Link href={`/b/${a.board_id}?view=automations`} className="min-w-0 flex-1">
                <div className="truncate font-bold">{a.name}</div>
                <div className="text-xs text-ink-3">{a.boards.icon} {a.boards.name} · {EVENTS.find((e) => e.id === a.event)?.label} · {a.actions.length} ação(ões)</div>
              </Link>
              <div className="num text-right text-xs"><div className="text-ink-3">{runs[a.id]?.ok ?? 0} execuções no mês</div>{(runs[a.id]?.err ?? 0) > 0 && <Badge color="#EF4444">{runs[a.id].err} erros</Badge>}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8 rounded-[16px] bg-lilac/60 p-4 text-sm text-ink-2"><b>Próxima etapa:</b> editor visual em canvas (fluxos com versões, rascunho/publicação, “aguardar”, buscas, código e IA) e ações do Domma Chat (WhatsApp). As automações acima já cobrem gatilho → condição → ações com requisição HTTP.</div>
    </div>
  );
}
