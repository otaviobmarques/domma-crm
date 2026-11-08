"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { Button, Empty, Modal, PageLoader, Tabs, cx, useToast } from "@/components/ui";
import { TEMPLATES } from "@/lib/templates";
import { PHASE_COLORS } from "@/lib/fields";
import { Icon } from "@/components/Icon";
import type { Board } from "@/lib/types";

const ICONS = ["📋", "🤝", "🚗", "💼", "📞", "🏢", "⚖️", "🎯", "🛠️", "📦", "💰", "🧾", "🏪", "📈", "🧑‍💼", "🔍"];

export default function Home() {
  const { org, profile, session, role } = useApp();
  const router = useRouter(); const toast = useToast();
  const [boards, setBoards] = useState<(Board & { count: number; member: boolean })[] | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"mine" | "others">("mine");
  const [q, setQ] = useState(""); const [tasks, setTasks] = useState(0);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const uid = session.user.id;
    const [{ data: bs }, { data: bm }, { data: fv }, { count }] = await Promise.all([
      supabase.from("boards").select("*").eq("org_id", org.id).is("deleted_at", null).order("name"),
      supabase.from("board_members").select("board_id").eq("user_id", uid),
      supabase.from("board_favorites").select("board_id").eq("user_id", uid),
      supabase.from("card_assignees").select("card_id, cards!inner(org_id, finished_at, deleted_at)", { count: "exact", head: true })
        .eq("user_id", uid).eq("cards.org_id", org.id).is("cards.finished_at", null).is("cards.deleted_at", null),
    ]);
    const mine = new Set((bm ?? []).map((x) => x.board_id));
    const counts = await Promise.all((bs ?? []).map((b) => supabase.from("cards").select("id", { count: "exact", head: true }).eq("board_id", b.id).is("deleted_at", null)));
    setBoards((bs ?? []).map((b, i) => ({ ...(b as Board), count: counts[i].count ?? 0, member: mine.has(b.id) || role === "admin" })));
    setFavs(new Set((fv ?? []).map((x) => x.board_id)));
    setTasks(count ?? 0);
  }, [org.id, session.user.id, role]);
  useEffect(() => { setBoards(null); load(); }, [load]);

  async function toggleFav(id: string) {
    if (favs.has(id)) await supabase.from("board_favorites").delete().eq("board_id", id).eq("user_id", session.user.id);
    else await supabase.from("board_favorites").insert({ board_id: id, user_id: session.user.id });
    load();
  }
  const list = useMemo(() => (boards ?? [])
    .filter((b) => (tab === "mine" ? b.member : !b.member) && b.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)) || a.name.localeCompare(b.name)), [boards, tab, q, favs]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-medium text-ink-3">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 text-[26px] font-bold">{greet}, {(profile.full_name || "").split(" ")[0] || "bem-vindo"}</h1>
          <p className="mt-1 text-[13px] text-ink-3">Você tem <Link href="/tasks" className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-action">{tasks} {tasks === 1 ? "tarefa atribuída" : "tarefas atribuídas"}</Link> em aberto.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} />Novo board</Button>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: "mine", label: "Seus boards" }, { id: "others", label: "Outros boards" }]} />
        <div className="relative w-64"><Icon name="search" size={15} className="pointer-events-none absolute left-3 top-2.5 text-ink-3" /><input className="input !pl-9" placeholder="Buscar boards" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      {!boards ? <PageLoader /> : list.length === 0 ? (
        <div className="mt-6"><Empty icon="▦" title={tab === "mine" ? "Nenhum board por aqui" : "Nenhum outro board visível"}>{tab === "mine" ? "Crie um board do zero ou a partir de um modelo." : "Boards da organização em que você ainda não participa aparecem aqui."}</Empty></div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <div key={b.id} className="group relative rounded-[14px] border border-line bg-white shadow-soft transition hover:border-[#DCD8E8] hover:shadow-card">
              <Link href={`/b/${b.id}`} className="flex items-center gap-3.5 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-line-2 text-lg" style={{ background: b.color + "0F" }}>{b.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{b.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3"><span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} /><span className="num">{b.count}</span> cards</span>
                </span>
                <Icon name="arrow" size={15} className="text-line transition group-hover:translate-x-0.5 group-hover:text-ink-3" />
              </Link>
              <button onClick={() => toggleFav(b.id)} className={cx("absolute right-3 top-3 transition", favs.has(b.id) ? "text-amber-400" : "text-transparent group-hover:text-line")} aria-label="Favoritar"><Icon name="star" size={14} className={favs.has(b.id) ? "fill-amber-400" : ""} /></button>
            </div>
          ))}
        </div>
      )}
      <NewBoardModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/b/${id}`)} orgId={org.id} toast={toast} />
    </div>
  );
}

function NewBoardModal({ open, onClose, onCreated, orgId, toast }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; orgId: string; toast: (m: string, k?: "ok" | "err") => void }) {
  const [name, setName] = useState(""); const [icon, setIcon] = useState("📋"); const [color, setColor] = useState("#5B3FE6");
  const [tpl, setTpl] = useState("blank"); const [loading, setLoading] = useState(false);
  async function create() {
    if (!name.trim()) return toast("Dê um nome ao board.", "err");
    setLoading(true);
    const { data, error } = await supabase.rpc("create_board", { p_org: orgId, p_name: name.trim(), p_icon: icon, p_color: color, p_template: tpl });
    setLoading(false);
    if (error) return toast(errMsg(error), "err");
    onCreated(data as string);
  }
  return (
    <Modal open={open} onClose={onClose} title="Novo board" wide footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={loading} onClick={create}>Criar board</Button></>}>
      <div className="space-y-4">
        <div><label className="label">Nome do processo</label><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Comercial - Franquias" onKeyDown={(e) => e.key === "Enter" && create()} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><span className="label">Ícone</span><div className="flex flex-wrap gap-1">{ICONS.map((i) => <button key={i} onClick={() => setIcon(i)} className={cx("h-9 w-9 rounded-lg text-lg", icon === i ? "bg-lilac ring-2 ring-action" : "hover:bg-soft")}>{i}</button>)}</div></div>
          <div><span className="label">Cor</span><div className="flex flex-wrap gap-1.5">{PHASE_COLORS.map((c) => <button key={c} onClick={() => setColor(c)} className={cx("h-7 w-7 rounded-full", color === c && "ring-2 ring-offset-2 ring-ink")} style={{ background: c }} aria-label={c} />)}</div></div>
        </div>
        <div><span className="label">Começar de</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => setTpl(t.id)} className={cx("rounded-[12px] border p-3 text-left", tpl === t.id ? "border-action bg-lilac/50" : "border-line hover:bg-soft")}>
                <div className="text-xl">{t.icon}</div><div className="mt-1 text-sm font-bold">{t.name}</div><div className="text-xs text-ink-3">{t.desc}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">Tudo é editável depois: fases, campos, regras e automações.</p>
        </div>
      </div>
    </Modal>
  );
}
