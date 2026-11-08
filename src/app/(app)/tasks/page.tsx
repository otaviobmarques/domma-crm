"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { Badge, Empty, PageLoader, Tabs, cx } from "@/components/ui";
import { duration, fmtDate } from "@/lib/fields";

export default function MyTasks() {
  const { org, session } = useApp();
  const [tab, setTab] = useState<"cards" | "activities" | "requests">("cards");
  const [cards, setCards] = useState<any[] | null>(null); const [acts, setActs] = useState<any[]>([]); const [reqs, setReqs] = useState<any[]>([]);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => {
    const uid = session.user.id;
    supabase.from("card_assignees").select("cards!inner(id, title, due_at, finished_at, deleted_at, created_at, phase_entered_at, org_id, board_id, boards(name, icon), phases(name, color))")
      .eq("user_id", uid).eq("cards.org_id", org.id).is("cards.deleted_at", null).limit(1000)
      .then(({ data }) => setCards((data ?? []).map((x: any) => x.cards)));
    supabase.from("tasks").select("*, cards!inner(id, title, board_id, org_id, boards(name))").eq("assignee", uid).eq("cards.org_id", org.id).order("due_at", { ascending: true, nullsFirst: false }).limit(500).then(({ data }) => setActs(data ?? []));
    supabase.from("cards").select("id, title, created_at, finished_at, board_id, boards(name), phases(name, color)").eq("org_id", org.id).eq("created_by", uid).is("deleted_at", null).order("created_at", { ascending: false }).limit(100).then(({ data }) => setReqs(data ?? []));
  }, [org.id, session.user.id]);
  if (!cards) return <PageLoader />;
  const list = cards.filter((c) => showDone || !c.finished_at).sort((a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));
  const now = Date.now();
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-8">
      <h1 className="text-[22px] font-bold">Minhas tarefas</h1>
      <Tabs className="mt-4" value={tab} onChange={setTab} tabs={[{ id: "cards", label: `Cards (${cards.filter((c) => !c.finished_at).length})` }, { id: "activities", label: `Atividades (${acts.filter((a) => !a.done_at).length})` }, { id: "requests", label: "Solicitações" }]} />
      {tab === "cards" && <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Mostrar finalizados</label>
        {list.length === 0 && <Empty icon="✓" title="Tudo em dia">Nenhum card atribuído a você.</Empty>}
        {list.map((c) => {
          const late = c.due_at && new Date(c.due_at).getTime() < now && !c.finished_at;
          return (
            <Link key={c.id} href={`/b/${c.board_id}?card=${c.id}`} className="flex items-center gap-3 rounded-[12px] border border-line bg-white px-4 py-3 shadow-soft hover:border-action/40">
              <span className="h-8 w-1 rounded-full" style={{ background: c.phases?.color }} />
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{c.title}</div><div className="text-xs text-ink-3">{c.boards?.icon} {c.boards?.name} · {c.phases?.name} · {duration(now - new Date(c.phase_entered_at).getTime())} na fase</div></div>
              {c.due_at && <span className={cx("num rounded-md px-2 py-1 text-xs font-semibold", late ? "bg-red-50 text-red-600" : "bg-soft text-ink-2")}>⚑ {fmtDate(c.due_at, true)}</span>}
            </Link>
          );
        })}
      </div>}
      {tab === "activities" && <div className="mt-4 space-y-2">
        {acts.length === 0 && <Empty icon="☐" title="Sem atividades">Atividades criadas nos cards e atribuídas a você aparecem aqui.</Empty>}
        {acts.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-[12px] border border-line bg-white px-4 py-3">
            <input type="checkbox" checked={!!t.done_at} onChange={async () => { await supabase.from("tasks").update({ done_at: t.done_at ? null : new Date().toISOString() }).eq("id", t.id); setActs((xs) => xs.map((x) => (x.id === t.id ? { ...x, done_at: x.done_at ? null : new Date().toISOString() } : x))); }} />
            <div className="min-w-0 flex-1"><div className={cx("font-semibold", t.done_at && "text-ink-3 line-through")}>{t.title}</div><Link href={`/b/${t.cards.board_id}?card=${t.cards.id}`} className="text-xs text-action">{t.cards.boards?.name} · {t.cards.title}</Link></div>
            {t.due_at && <span className={cx("num text-xs", !t.done_at && new Date(t.due_at).getTime() < now ? "font-bold text-red-600" : "text-ink-3")}>{fmtDate(t.due_at, true)}</span>}
          </div>
        ))}
      </div>}
      {tab === "requests" && <div className="mt-4 space-y-2">
        <p className="text-sm text-ink-3">Cards que você abriu. Na Fase 2, inclui pedidos feitos por formulário público em boards de outras áreas.</p>
        {reqs.map((c) => (
          <Link key={c.id} href={`/b/${c.board_id}?card=${c.id}`} className="flex items-center gap-3 rounded-[12px] border border-line bg-white px-4 py-3 hover:border-action/40">
            <div className="min-w-0 flex-1"><div className="truncate font-semibold">{c.title}</div><div className="text-xs text-ink-3">{c.boards?.name} · aberto em {fmtDate(c.created_at)}</div></div>
            <Badge color={c.phases?.color}>{c.phases?.name}</Badge>
          </Link>
        ))}
      </div>}
    </div>
  );
}
