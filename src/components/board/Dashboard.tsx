"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, fetchAll } from "@/lib/supabase";
import { duration } from "@/lib/fields";
import { Avatar, Button, PageLoader, cx } from "../ui";
import { ChipPicker } from "../FieldInput";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";

type Hist = { card_id: string; phase_id: string; entered_at: string; left_at: string | null };
const DAY = 86400000;

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "red" | "green" }) {
  return <div className="rounded-[16px] border border-line bg-white p-4 shadow-soft">
    <div className="text-xs font-semibold text-ink-3">{label}</div>
    <div className={cx("num mt-1 text-[22px] font-bold", tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : "text-ink")}>{value}</div>
    {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
  </div>;
}
function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-[16px] border border-line bg-white p-4 shadow-soft", className)}><h3 className="mb-3 text-sm font-bold">{title}</h3>{children}</div>;
}
function HBar({ label, value, max, text, color = "#5B3FE6" }: { label: React.ReactNode; value: number; max: number; text: string; color?: string }) {
  return <div className="flex items-center gap-2 text-xs">
    <div className="w-36 shrink-0 truncate font-semibold">{label}</div>
    <div className="h-5 flex-1 overflow-hidden rounded-md bg-soft"><div className="h-full rounded-md" style={{ width: `${max ? Math.max((value / max) * 100, value ? 2 : 0) : 0}%`, background: color }} /></div>
    <div className="num w-24 shrink-0 text-right font-bold">{text}</div>
  </div>;
}

export function Dashboard() {
  const b = useBoard(); const { memberMap } = useApp();
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [days, setDays] = useState(30); const [unit, setUnit] = useState<"day" | "week" | "month">("day");
  const [tags, setTags] = useState<string[]>([]); const [ass, setAss] = useState<string[]>([]);
  const [distField, setDistField] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetchAll<Hist>((from, to) => supabase.from("card_phase_history").select("card_id, phase_id, entered_at, left_at, cards!inner(board_id)").eq("cards.board_id", b.board.id).range(from, to) as any).then(setHist);
  }, [b.board.id, b.cards.length]);
  const selectFields = b.fields.filter((f) => ["single_select", "multi_select"].includes(f.type));
  useEffect(() => { if (!distField && selectFields[0]) setDistField(selectFields[0].id); }, [selectFields, distField]);

  const d = useMemo(() => {
    if (!hist) return null;
    const now = Date.now(); const since = days ? now - days * DAY : 0;
    const cards = b.cards.filter((c) => (!tags.length || c.card_tags?.some((t) => tags.includes(t.tag_id))) && (!ass.length || c.card_assignees?.some((a) => ass.includes(a.user_id))));
    const ids = new Set(cards.map((c) => c.id));
    const created = cards.filter((c) => new Date(c.created_at).getTime() >= since);
    const finished = cards.filter((c) => c.finished_at && new Date(c.finished_at).getTime() >= since);
    const onTime = finished.filter((c) => !c.due_at || new Date(c.finished_at!) <= new Date(c.due_at));
    const open = cards.filter((c) => !c.finished_at);
    const overdue = open.filter((c) => c.due_at && new Date(c.due_at).getTime() < now);
    const avgDone = finished.length ? finished.reduce((s, c) => s + (new Date(c.finished_at!).getTime() - new Date(c.created_at).getTime()), 0) / finished.length : 0;
    const fc = created.filter((c) => c.first_contact_at).map((c) => new Date(c.first_contact_at!).getTime() - new Date(c.created_at).getTime()).sort((a, x) => a - x);
    const medianFirst = fc.length ? fc[Math.floor(fc.length / 2)] : 0;
    // série
    const bucket = (t: number) => { const x = new Date(t); if (unit === "month") return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; if (unit === "week") { const s = new Date(x); s.setDate(x.getDate() - x.getDay()); return s.toISOString().slice(0, 10); } return x.toISOString().slice(0, 10); };
    const series = new Map<string, { n: number; f: number }>();
    const start = since || Math.min(...cards.map((c) => new Date(c.created_at).getTime()), now);
    for (let t = start; t <= now; t += unit === "day" ? DAY : unit === "week" ? 7 * DAY : 28 * DAY) series.set(bucket(t), { n: 0, f: 0 });
    created.forEach((c) => { const k = bucket(new Date(c.created_at).getTime()); const s = series.get(k) ?? { n: 0, f: 0 }; s.n++; series.set(k, s); });
    finished.forEach((c) => { const k = bucket(new Date(c.finished_at!).getTime()); const s = series.get(k) ?? { n: 0, f: 0 }; s.f++; series.set(k, s); });
    const ser = [...series.entries()].sort(([a], [x]) => a.localeCompare(x)).slice(-60);
    // funil (coorte criada no período)
    const cohort = new Set(created.map((c) => c.id));
    const reached = new Map<string, Set<string>>();
    hist.filter((h) => cohort.has(h.card_id)).forEach((h) => { if (!reached.has(h.phase_id)) reached.set(h.phase_id, new Set()); reached.get(h.phase_id)!.add(h.card_id); });
    const funnel = b.phases.map((p) => ({ p, n: reached.get(p.id)?.size ?? 0 }));
    // tempo por fase
    const perPhase = b.phases.map((p) => {
      const hs = hist.filter((h) => ids.has(h.card_id) && h.phase_id === p.id && new Date(h.entered_at).getTime() >= since);
      const closed = hs.filter((h) => h.left_at);
      const avg = closed.length ? closed.reduce((s, h) => s + (new Date(h.left_at!).getTime() - new Date(h.entered_at).getTime()), 0) / closed.length : 0;
      return { p, avg, n: closed.length };
    });
    // concluídos por fase final
    const byFinal = b.phases.filter((p) => p.is_final).map((p) => ({ p, n: finished.filter((c) => c.phase_id === p.id).length }));
    // ranking
    const rank = new Map<string, { total: number; done: number; first: number[] }>();
    created.forEach((c) => (c.card_assignees ?? []).forEach((a) => {
      const r = rank.get(a.user_id) ?? { total: 0, done: 0, first: [] }; r.total++; if (c.finished_at) r.done++;
      if (c.first_contact_at) r.first.push(new Date(c.first_contact_at).getTime() - new Date(c.created_at).getTime()); rank.set(a.user_id, r);
    }));
    const ranking = [...rank.entries()].map(([uid, r]) => ({ uid, ...r, avgFirst: r.first.length ? r.first.reduce((a, x) => a + x, 0) / r.first.length : null })).sort((a, x) => x.done - a.done || x.total - a.total);
    // distribuição
    const dist = new Map<string, number>();
    if (distField) created.forEach((c) => { const v = c.data?.[distField]; (Array.isArray(v) ? v : v ? [v] : ["(vazio)"]).forEach((x: string) => dist.set(x, (dist.get(x) ?? 0) + 1)); });
    return { created, finished, onTime, open, overdue, avgDone, medianFirst, fcN: fc.length, ser, funnel, perPhase, byFinal, ranking, dist: [...dist.entries()].sort((a, x) => x[1] - a[1]) };
  }, [hist, b.cards, b.phases, days, unit, tags, ass, distField]);

  if (!d) return <PageLoader />;
  const maxSer = Math.max(1, ...d.ser.map(([, v]) => Math.max(v.n, v.f)));
  const top = d.funnel[0]?.n || 0;
  return (
    <div ref={ref} className="space-y-4 overflow-y-auto bg-white px-4 pb-8 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Últimos 12 meses</option><option value={0}>Todo o período</option></select>
        <select className="input !w-auto" value={unit} onChange={(e) => setUnit(e.target.value as any)}><option value="day">Por dia</option><option value="week">Por semana</option><option value="month">Por mês</option></select>
        <div className="w-56"><ChipPicker placeholder="Todas as etiquetas" multiple selected={tags} onChange={setTags} options={b.tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))} /></div>
        <div className="w-56"><ChipPicker placeholder="Todos os responsáveis" multiple selected={ass} onChange={setAss} options={Object.entries(memberMap).map(([id, p]) => ({ id, label: p.full_name || p.email || "" }))} /></div>
        <span className="flex-1" />
        <Button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())}>⛶ Tela cheia</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Novos cards" value={d.created.length} />
        <Kpi label="Concluídos" value={d.finished.length} hint={d.finished.length ? `${Math.round((d.onTime.length / d.finished.length) * 100)}% no prazo` : undefined} tone="green" />
        <Kpi label="Em aberto" value={d.open.length} />
        <Kpi label="Vencidos" value={d.overdue.length} tone={d.overdue.length ? "red" : undefined} />
        <Kpi label="Tempo médio de conclusão" value={d.finished.length ? duration(d.avgDone) : "—"} />
        <Kpi label="1º contato (mediana)" value={d.fcN ? duration(d.medianFirst) : "—"} hint="Velocidade de atendimento" />
      </div>
      <Panel title="Novos × concluídos">
        <div className="flex h-40 items-end gap-0.5 overflow-x-auto">
          {d.ser.map(([k, v]) => (
            <div key={k} className="group flex min-w-[10px] flex-1 flex-col items-center justify-end gap-0.5" title={`${k}: ${v.n} novos, ${v.f} concluídos`}>
              <div className="flex w-full items-end justify-center gap-px" style={{ height: 140 }}>
                <div className="w-1/2 rounded-t bg-brand" style={{ height: `${(v.n / maxSer) * 100}%` }} />
                <div className="w-1/2 rounded-t bg-emerald-400" style={{ height: `${(v.f / maxSer) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-ink-3"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand" />Novos</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />Concluídos</span></div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Funil e conversão entre fases (cards criados no período)">
          <div className="space-y-1.5">{d.funnel.map(({ p, n }, i) => (
            <HBar key={p.id} label={p.name} value={n} max={top} color={p.color} text={`${n} · ${top ? Math.round((n / top) * 100) : 0}%${i > 0 && d.funnel[i - 1].n ? ` (${Math.round((n / d.funnel[i - 1].n) * 100)}%)` : ""}`} />
          ))}</div>
          <div className="mt-2 text-[11px] text-ink-3">% sobre a primeira fase · (entre parênteses) conversão da fase anterior.</div>
        </Panel>
        <Panel title="Tempo médio por fase">
          <div className="space-y-1.5">{(() => { const mx = Math.max(1, ...d.perPhase.map((x) => x.avg)); return d.perPhase.filter((x) => !x.p.is_final).map(({ p, avg, n }) => <HBar key={p.id} label={p.name} value={avg} max={mx} color={p.color} text={n ? duration(avg) : "—"} />); })()}</div>
        </Panel>
        <Panel title="Ranking de responsáveis">
          <table className="w-full text-xs"><thead className="text-left text-ink-3"><tr><th className="py-1">Responsável</th><th>Cards</th><th>Concluídos</th><th>Conversão</th><th>1º contato</th></tr></thead>
            <tbody>{d.ranking.map((r) => (
              <tr key={r.uid} className="border-t border-line"><td className="flex items-center gap-2 py-1.5"><Avatar size={20} name={memberMap[r.uid]?.full_name || memberMap[r.uid]?.email} />{memberMap[r.uid]?.full_name || memberMap[r.uid]?.email || "—"}</td>
                <td className="num">{r.total}</td><td className="num">{r.done}</td><td className="num">{Math.round((r.done / r.total) * 100)}%</td><td className="num">{r.avgFirst !== null ? duration(r.avgFirst) : "—"}</td></tr>
            ))}{d.ranking.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-3">Sem cards atribuídos no período.</td></tr>}</tbody></table>
        </Panel>
        <Panel title="Concluídos por fase final">
          <div className="space-y-1.5">{(() => { const mx = Math.max(1, ...d.byFinal.map((x) => x.n)); return d.byFinal.map(({ p, n }) => <HBar key={p.id} label={p.name} value={n} max={mx} color={p.color} text={String(n)} />); })()}</div>
        </Panel>
        {selectFields.length > 0 && <Panel title="Distribuição por campo" className="lg:col-span-2">
          <select className="input mb-3 !w-auto" value={distField} onChange={(e) => setDistField(e.target.value)}>{selectFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
          <div className="grid gap-1.5 md:grid-cols-2">{(() => { const mx = Math.max(1, ...d.dist.map(([, n]) => n)); return d.dist.map(([k, n]) => <HBar key={k} label={k} value={n} max={mx} text={`${n} · ${d.created.length ? Math.round((n / d.created.length) * 100) : 0}%`} />); })()}</div>
        </Panel>}
      </div>
    </div>
  );
}
