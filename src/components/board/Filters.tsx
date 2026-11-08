"use client";
import { useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import { emptyFilter, type CardFilter } from "@/lib/filter";
import { Avatar, Button, useToast } from "../ui";
import { ChipPicker } from "../FieldInput";
import { ConditionEditor } from "../ConditionEditor";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";

export function FilterPanel({ value: f, onChange }: { value: CardFilter; onChange: (f: CardFilter) => void }) {
  const b = useBoard(); const { members } = useApp();
  const set = (k: keyof CardFilter, v: any) => onChange({ ...f, [k]: v });
  return (
    <div className="space-y-3 rounded-[16px] border border-line p-3">
      <div><span className="label">Fases</span><ChipPicker multiple selected={f.phases ?? []} onChange={(v) => set("phases", v)} options={b.phases.map((p) => ({ id: p.id, label: p.name, color: p.color }))} /></div>
      <div><span className="label">Etiquetas</span><ChipPicker multiple selected={f.tags ?? []} onChange={(v) => set("tags", v)} options={b.tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))} /></div>
      <div><span className="label">Responsáveis</span><ChipPicker multiple selected={f.assignees ?? []} onChange={(v) => set("assignees", v)} options={[{ id: "__none", label: "Sem responsável" }, ...members.map((m) => ({ id: m.user_id, label: m.profile.full_name || m.profile.email || "", icon: <Avatar size={16} name={m.profile.full_name} /> }))]} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><span className="label">Vencimento</span><select className="input" value={f.due ?? ""} onChange={(e) => set("due", e.target.value)}><option value="">Qualquer</option><option value="overdue">Vencidos</option><option value="today">Vencem hoje</option><option value="week">Próximos 7 dias</option><option value="none">Sem vencimento</option></select></div>
        <div><span className="label">Situação</span><select className="input" value={f.status ?? ""} onChange={(e) => set("status", e.target.value)}><option value="">Todos</option><option value="open">Em aberto</option><option value="done">Finalizados</option></select></div>
        <div><span className="label">Criado de</span><input type="date" className="input" value={f.created_from ?? ""} onChange={(e) => set("created_from", e.target.value)} /></div>
        <div><span className="label">até</span><input type="date" className="input" value={f.created_to ?? ""} onChange={(e) => set("created_to", e.target.value)} /></div>
      </div>
      <div><span className="label">Campos</span><ConditionEditor value={f.conditions ?? []} onChange={(v) => set("conditions", v)} match={f.match ?? "and"} onMatch={(m) => set("match", m)} fields={b.fields} special={false} members={members} tags={b.tags} /></div>
      <Button size="sm" variant="ghost" onClick={() => onChange({ ...emptyFilter, q: f.q })}>Limpar filtros</Button>
    </div>
  );
}

export function SavedFilters({ value, onApply }: { value: CardFilter; onApply: (f: CardFilter) => void }) {
  const b = useBoard(); const { session } = useApp(); const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const load = () => supabase.from("reports").select("*").eq("board_id", b.board.id).eq("kind", "filter").order("name").then(({ data }) => setList(data ?? []));
  useEffect(() => { load(); }, [b.board.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    const name = prompt("Nome do filtro:"); if (!name) return;
    const { error } = await supabase.from("reports").insert({ org_id: b.board.org_id, board_id: b.board.id, kind: "filter", name, config: { filter: value }, created_by: session.user.id });
    if (error) toast(errMsg(error), "err"); else { toast("Filtro salvo"); load(); }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map((x) => <span key={x.id} className="inline-flex items-center gap-1 rounded-md bg-soft px-2 py-1 text-xs font-semibold">
        <button onClick={() => onApply({ ...emptyFilter, ...x.config.filter })}>⭑ {x.name}</button>
        <button className="text-ink-3" onClick={async () => { await supabase.from("reports").delete().eq("id", x.id); load(); }}>×</button></span>)}
      <Button size="sm" variant="ghost" onClick={save}>Salvar filtro atual</Button>
    </div>
  );
}
