"use client";
import type { Condition, Field, Member, Phase, Tag } from "@/lib/types";
import { OPERATORS, typeDef } from "@/lib/fields";
import { Button } from "./ui";

export function ConditionEditor({ value, onChange, match, onMatch, fields, phases = [], tags = [], members = [], special = true }:
  { value: Condition[]; onChange: (v: Condition[]) => void; match: "and" | "or"; onMatch: (m: "and" | "or") => void;
    fields: Field[]; phases?: Phase[]; tags?: Tag[]; members?: Member[]; special?: boolean }) {
  const options = [
    ...(special ? [{ id: "title", label: "Título do card" }, { id: "phase", label: "Fase atual" }, { id: "tags", label: "Etiquetas" }, { id: "assignees", label: "Responsáveis" }] : []),
    ...fields.filter((f) => f.type !== "static_text").map((f) => ({ id: f.id, label: `${typeDef(f.type).icon} ${f.label}` })),
  ];
  const upd = (i: number, p: Partial<Condition>) => onChange(value.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="space-y-2">
      {value.map((c, i) => {
        const f = fields.find((x) => x.id === c.field);
        const needs = OPERATORS.find((o) => o.op === c.op)?.needsValue;
        let valueInput: React.ReactNode = <input className="input" value={c.value ?? ""} onChange={(e) => upd(i, { value: e.target.value })} placeholder="valor" />;
        const items: { id: string; label: string }[] | null =
          c.field === "phase" ? phases.map((p) => ({ id: p.id, label: p.name })) :
          c.field === "tags" ? tags.map((t) => ({ id: t.id, label: t.name })) :
          c.field === "assignees" ? members.map((m) => ({ id: m.user_id, label: m.profile.full_name || m.profile.email || "" })) :
          f && ["single_select", "multi_select", "checklist"].includes(f.type) ? (f.options?.items ?? []).map((x: string) => ({ id: x, label: x })) :
          f?.type === "assignee" ? members.map((m) => ({ id: m.user_id, label: m.profile.full_name || m.profile.email || "" })) :
          f?.type === "tag" ? tags.map((t) => ({ id: t.id, label: t.name })) : null;
        if (items) valueInput = <select className="input" value={c.value ?? ""} onChange={(e) => upd(i, { value: e.target.value })}><option value="">Selecione…</option>{items.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>;
        if (f && ["date", "datetime", "due_date"].includes(f.type)) valueInput = <input type="date" className="input" value={c.value ?? ""} onChange={(e) => upd(i, { value: e.target.value })} />;
        return (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-[12px] bg-soft p-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center">
            <select className="input" value={c.field} onChange={(e) => upd(i, { field: e.target.value, value: "" })}>
              <option value="">Campo…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <select className="input sm:!w-48" value={c.op} onChange={(e) => upd(i, { op: e.target.value })}>{OPERATORS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
            {needs ? valueInput : <span />}
            <button type="button" className="justify-self-end px-2 text-ink-3 hover:text-red-600" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remover condição">✕</button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="soft" onClick={() => onChange([...value, { field: "", op: "eq", value: "" }])}>+ Condição</Button>
        {value.length > 1 && <select className="input !w-auto !py-1 text-xs" value={match} onChange={(e) => onMatch(e.target.value as "and" | "or")}>
          <option value="and">Todas as condições (E)</option><option value="or">Qualquer condição (OU)</option>
        </select>}
      </div>
    </div>
  );
}
