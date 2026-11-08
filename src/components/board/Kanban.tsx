"use client";
import { useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Card, Phase } from "@/lib/types";
import { PHASE_COLORS, brl, duration, formatValue, isEmpty, num } from "@/lib/fields";
import { Avatar, Badge, Menu, MenuItem, cx, useToast } from "../ui";
import { Icon } from "../Icon";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";

export function totalOf(p: Phase, cards: Card[]) {
  const t = p.totalizer; if (!t?.field_id) return null;
  const vals = cards.map((c) => Number(c.data?.[t.field_id!])).filter((n) => isFinite(n));
  const v = t.op === "avg" ? (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0) : t.op === "count" ? vals.length : vals.reduce((a, b) => a + b, 0);
  return { label: t.name || (t.op === "avg" ? "Média" : "Total"), text: t.format === "currency" && t.op !== "count" ? brl(v) : num(v) };
}

const SORTS: { id: string; label: string; fn: (a: Card, b: Card) => number }[] = [
  { id: "new", label: "Mais recentes", fn: (a, b) => b.created_at.localeCompare(a.created_at) },
  { id: "old", label: "Mais antigos", fn: (a, b) => a.created_at.localeCompare(b.created_at) },
  { id: "due", label: "Vencimento mais próximo", fn: (a, b) => (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") },
  { id: "updated", label: "Última atualização", fn: (a, b) => b.updated_at.localeCompare(a.updated_at) },
  { id: "phase", label: "Mais tempo na fase", fn: (a, b) => a.phase_entered_at.localeCompare(b.phase_entered_at) },
  { id: "title", label: "Título (A–Z)", fn: (a, b) => a.title.localeCompare(b.title) },
];

export function Kanban({ cards, onOpen, onMove, selected, onSelect, onConfigurePhase, onEditForm, onCreateIn }:
  { cards: Card[]; onOpen: (id: string) => void; onMove: (c: Card, phaseId: string) => void; selected: Set<string>; onSelect: (id: string) => void;
    onConfigurePhase: (id: string) => void; onEditForm: (id: string) => void; onCreateIn: (phaseId: string) => void }) {
  const b = useBoard(); const toast = useToast();
  const key = `domma.kanban.${b.board.id}`;
  const [prefs, setPrefs] = useState<{ collapsed: string[]; sort: Record<string, string> }>({ collapsed: [], sort: {} });
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState(false); const [newName, setNewName] = useState("");
  const [sortMenu, setSortMenu] = useState<string | null>(null);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(key) || "null"); if (s) setPrefs({ collapsed: s.collapsed ?? [], sort: s.sort ?? {} }); } catch { /* vazio */ } }, [key]);
  const savePrefs = (p: typeof prefs) => { setPrefs(p); localStorage.setItem(key, JSON.stringify(p)); };
  const toggle = (id: string) => savePrefs({ ...prefs, collapsed: prefs.collapsed.includes(id) ? prefs.collapsed.filter((x) => x !== id) : [...prefs.collapsed, id] });
  const phases = b.phases.filter((p) => !p.archived);

  async function upd(p: Phase, patch: Partial<Phase>, msg?: string) {
    const { error } = await supabase.from("phases").update(patch).eq("id", p.id);
    if (error) return toast(errMsg(error), "err");
    if (msg) toast(msg); b.reload(["phases"]);
  }
  async function moveRight(p: Phase) {
    const i = phases.findIndex((x) => x.id === p.id); const next = phases[i + 1];
    if (!next) return toast("Esta já é a última fase.", "err");
    await Promise.all([supabase.from("phases").update({ position: next.position }).eq("id", p.id), supabase.from("phases").update({ position: p.position }).eq("id", next.id)]);
    if (next.position === p.position) await supabase.from("phases").update({ position: p.position + 1 }).eq("id", p.id);
    b.reload(["phases"]);
  }
  async function archive(p: Phase) {
    const n = cards.filter((c) => c.phase_id === p.id).length;
    if (!confirm(`Arquivar a fase "${p.name}"?${n ? ` Os ${n} card(s) dela deixam de aparecer no Kanban (continuam na Lista e nos relatórios).` : ""} Você pode desarquivar em Configurações › Fases.`)) return;
    upd(p, { archived: true }, "Fase arquivada");
  }
  async function addPhase() {
    if (!newName.trim()) return setAdding(false);
    const { error } = await supabase.from("phases").insert({ org_id: b.board.org_id, board_id: b.board.id, name: newName.trim(), position: (b.phases.at(-1)?.position ?? 0) + 1, color: PHASE_COLORS[b.phases.length % PHASE_COLORS.length] });
    if (error) toast(errMsg(error), "err"); else { setNewName(""); setAdding(false); b.reload(["phases"]); }
  }
  async function removePhase(p: Phase) {
    if (cards.some((c) => c.phase_id === p.id)) return toast("Mova os cards desta fase antes de removê-la.", "err");
    if (!confirm(`Remover a fase "${p.name}"? Ela pode ser restaurada no histórico do board.`)) return;
    upd(p, { deleted_at: new Date().toISOString() } as Partial<Phase>, "Fase removida");
  }
  const dropProps = (pid: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(pid); },
    onDragLeave: () => setOver((o) => (o === pid ? null : o)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/card"); const c = cards.find((x) => x.id === id); if (c) onMove(c, pid); },
  });

  return (
    <div className="flex h-full gap-3 overflow-x-auto px-4 pb-4 scroll-thin sm:px-6">
      {phases.map((p) => {
        const sort = SORTS.find((s) => s.id === prefs.sort[p.id]) ?? SORTS[0];
        const list = cards.filter((c) => c.phase_id === p.id).sort(sort.fn);
        const tot = totalOf(p, list);
        if (prefs.collapsed.includes(p.id)) return (
          <button key={p.id} onClick={() => toggle(p.id)} {...dropProps(p.id)} className="flex w-11 shrink-0 flex-col items-center gap-2 rounded-[10px] border-t-[3px] bg-line-2 py-3 hover:bg-[#ECEAF2]" style={{ borderTopColor: p.color }}>
            <span className="num text-xs font-semibold text-ink-2">{list.length}</span>
            <span className="text-xs font-semibold text-ink-2 [writing-mode:vertical-rl]">{p.name}</span>
          </button>
        );
        return (
          <div key={p.id} {...dropProps(p.id)} className={cx("flex w-[272px] shrink-0 flex-col rounded-[10px] transition", over === p.id ? "bg-lilac" : "bg-line-2")}>
            <div className="rounded-t-[10px] border-b-[3px] bg-white px-3 py-2.5" style={{ borderBottomColor: p.color }}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={p.name}>{p.name}</span>
                <span className="num text-xs text-ink-3">{list.length}</span>
                {p.create_enabled && b.canEdit && <button onClick={() => onCreateIn(p.id)} title="Criar card nesta fase" className="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-line-2 hover:text-action"><Icon name="plus" size={15} /></button>}
                <Menu trigger={<button className="flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-line-2 hover:text-ink" aria-label="Opções da fase"><Icon name="more" size={16} className="rotate-90" /></button>}>
                  {(close) => <>
                    {b.isAdmin && <MenuItem onClick={() => { close(); moveRight(p); }}><Icon name="arrow" size={15} className="text-ink-3" />Mover para direita</MenuItem>}
                    <MenuItem onClick={() => { close(); setSortMenu(p.id); }}><Icon name="list" size={15} className="text-ink-3" />Ordenar cards por...</MenuItem>
                    {b.isAdmin && <MenuItem onClick={() => { close(); upd(p, { is_final: !p.is_final }, p.is_final ? "Fase deixou de ser final" : "Fase marcada como final"); }}><Icon name="check" size={15} className="text-ink-3" />{p.is_final ? "Remover fase final" : "Tornar Fase Final"}</MenuItem>}
                    {b.isAdmin && <MenuItem onClick={() => { close(); archive(p); }}><Icon name="layers" size={15} className="text-ink-3" />Arquivar fase <Badge color="#3B82F6">Beta</Badge></MenuItem>}
                    {b.isAdmin && <MenuItem onClick={() => { close(); onConfigurePhase(p.id); }}><Icon name="settings" size={15} className="text-ink-3" />Configurações</MenuItem>}
                    {b.isAdmin && <MenuItem onClick={() => { close(); upd(p, { create_enabled: !p.create_enabled }, p.create_enabled ? "Criação de cards desabilitada" : "Criação de cards habilitada nesta fase"); }}><Icon name="plus" size={15} className="text-ink-3" />{p.create_enabled ? "Desabilitar criação de cards" : "Habilitar criação de cards"}</MenuItem>}
                    {b.isAdmin && <MenuItem onClick={() => { close(); onEditForm(p.id); }}><Icon name="list" size={15} className="text-ink-3" />Editar formulário</MenuItem>}
                    <MenuItem onClick={() => { close(); toggle(p.id); }}><Icon name="chevron" size={15} className="-rotate-90 text-ink-3" />Recolher fase</MenuItem>
                    {b.isAdmin && <MenuItem danger onClick={() => { close(); removePhase(p); }}><Icon name="x" size={15} />Remover</MenuItem>}
                  </>}
                </Menu>
              </div>
              {(tot || p.sla_value || prefs.sort[p.id]) && <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                <span>{p.sla_value ? `SLA ${p.sla_value} ${p.sla_unit === "minutes" ? "min" : p.sla_unit === "hours" ? "h" : "dias"}` : prefs.sort[p.id] ? sort.label : ""}</span>
                {tot && <span>{tot.label} <b className="num font-semibold text-ink">{tot.text}</b></span>}
              </div>}
              {sortMenu === p.id && <div className="mt-2 space-y-0.5 rounded-[8px] border border-line bg-white p-1">
                {SORTS.map((s) => <button key={s.id} onClick={() => { savePrefs({ ...prefs, sort: { ...prefs.sort, [p.id]: s.id } }); setSortMenu(null); }} className={cx("block w-full rounded-md px-2 py-1 text-left text-xs hover:bg-line-2", sort.id === s.id && "font-semibold text-action")}>{s.label}</button>)}
              </div>}
            </div>
            <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5 scroll-thin" style={{ maxHeight: "calc(100vh - 230px)" }}>
              {list.length === 0 && <div className="rounded-[10px] border border-dashed border-[#DCD8E8] px-4 py-6 text-center text-xs text-ink-3 whitespace-pre-line">{p.description || "Arraste cards para cá"}</div>}
              {list.slice(0, 300).map((c) => <CardTile key={c.id} card={c} phase={p} onOpen={() => onOpen(c.id)} selected={selected.has(c.id)} onSelect={() => onSelect(c.id)} />)}
              {list.length > 300 && <div className="p-2 text-center text-xs text-ink-3">+{list.length - 300} cards (use a Lista ou filtros)</div>}
            </div>
          </div>
        );
      })}
      {b.isAdmin && (adding ? (
        <div className="w-[272px] shrink-0 rounded-[10px] bg-white p-3 shadow-card">
          <input autoFocus className="input" placeholder="Nome da fase" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPhase(); if (e.key === "Escape") setAdding(false); }} onBlur={addPhase} />
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex h-11 w-[200px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[#DCD8E8] text-[13px] font-semibold text-ink-3 hover:bg-white hover:text-ink" title="Nova fase"><Icon name="plus" size={15} />Nova fase</button>
      ))}
    </div>
  );
}

function CardTile({ card: c, phase, onOpen, selected, onSelect }: { card: Card; phase: Phase; onOpen: () => void; selected: boolean; onSelect: () => void }) {
  const b = useBoard(); const { memberMap } = useApp();
  const now = Date.now();
  const due = c.due_at ? new Date(c.due_at).getTime() : null;
  const overdue = due !== null && due < now && !c.finished_at;
  const soon = due !== null && !overdue && due - now < 24 * 3600 * 1000 && !c.finished_at;
  const subIds = b.board.settings.subtitle_fields ?? b.initialFields.filter((f) => f.id !== b.board.settings.title_field && !["static_text", "attachment", "long_text"].includes(f.type)).slice(0, 6).map((f) => f.id);
  const subtitle = subIds.map((id) => b.fieldMap[id]).filter(Boolean)
    .map((f) => ({ f, v: formatValue(f, c.data?.[f.id], b.fmt) })).filter((x) => x.v);
  const tags = (c.card_tags ?? []).map((t) => b.tagMap[t.tag_id]).filter(Boolean);
  return (
    <div draggable={b.canEdit} onDragStart={(e) => { e.dataTransfer.setData("text/card", c.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onOpen}
      className={cx("group relative cursor-pointer rounded-[10px] border bg-white p-3 shadow-soft transition hover:shadow-card", selected ? "border-action ring-2 ring-action/15" : "border-transparent", phase.is_final && "opacity-60 grayscale-[.4]")}>
      <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={onSelect} className={cx("absolute right-2.5 top-2.5", !selected && "opacity-0 group-hover:opacity-100")} aria-label="Selecionar card" />
      {tags.length > 0 && <div className="mb-2 flex flex-wrap gap-1 pr-5">{tags.map((t) => <span key={t.id} className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: t.color }}>{t.name}</span>)}</div>}
      <div className="pr-5 text-[14px] font-semibold leading-snug">{c.title}</div>
      {subtitle.map(({ f, v }) => (
        <div key={f.id} className="mt-1.5 leading-tight">
          <div className="text-[11px] lowercase text-ink-3">{f.label}</div>
          <div className="line-clamp-4 break-words text-[12px] text-ink">{v}</div>
        </div>
      ))}
      {due !== null && (
        <div className="mt-1.5 leading-tight">
          <div className="text-[11px] text-ink-3">data de vencimento</div>
          <span className={cx("num inline-block rounded-[4px] px-1 text-[12px]", overdue ? "bg-red-500 font-semibold text-white" : soon ? "bg-amber-100 text-amber-800" : "text-ink")}>{new Date(due).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex -space-x-1.5">{(c.card_assignees ?? []).slice(0, 3).map((a) => <Avatar key={a.user_id} size={22} name={memberMap[a.user_id]?.full_name || memberMap[a.user_id]?.email} />)}</div>
        {!b.board.settings.hide_clocks && <span className="num flex items-center gap-2 text-[11px] font-semibold text-ink-2" title="No board · Na fase · Desde a última atualização">
          <span className="flex items-center gap-0.5"><Icon name="history" size={12} className="text-ink-3" />{duration(now - new Date(c.created_at).getTime())}</span>
          <span className="flex items-center gap-0.5"><Icon name="history" size={12} className="text-ink-3" />{duration(now - new Date(c.phase_entered_at).getTime())}</span>
          <span className="flex items-center gap-0.5"><Icon name="upload" size={12} className="text-ink-3" />{duration(now - new Date(c.updated_at).getTime())}</span>
        </span>}
      </div>
      {c.created_via !== "manual" && !isEmpty(c.created_via) && <div className="mt-2 text-[11px] text-ink-3">via {c.created_via === "automation" ? "automação" : c.created_via === "import" ? "importação" : c.created_via}</div>}
    </div>
  );
}
