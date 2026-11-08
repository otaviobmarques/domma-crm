"use client";
import { useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Automation, Field, Phase } from "@/lib/types";
import { fmtDate } from "@/lib/fields";
import { Avatar, Badge, Button, Empty, Modal, Toggle, useToast } from "../ui";
import { ChipPicker } from "../FieldInput";
import { ConditionEditor } from "../ConditionEditor";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";

export const EVENTS = [
  { id: "card_created", label: "Card criado", icon: "✚" },
  { id: "card_entered_phase", label: "Card entrou em uma fase", icon: "→" },
  { id: "card_left_phase", label: "Card saiu de uma fase", icon: "←" },
  { id: "field_updated", label: "Campo atualizado", icon: "✎" },
  { id: "task_completed", label: "Atividade concluída", icon: "✓" },
  { id: "card_overdue", label: "Card venceu", icon: "⚑" },
  { id: "record_created", label: "Registro criado em uma database", icon: "🗂" },
  { id: "record_status_changed", label: "Status de um registro alterado", icon: "⇄" },
];
export const ACTIONS = [
  { id: "move_card", label: "Mover o card de fase" },
  { id: "update_field", label: "Atualizar um campo" },
  { id: "create_card", label: "Criar um card (em qualquer board)" },
  { id: "set_tags", label: "Atualizar etiquetas" },
  { id: "set_assignees", label: "Atualizar responsáveis" },
  { id: "set_due", label: "Atualizar data de vencimento" },
  { id: "notify", label: "Enviar notificação interna" },
  { id: "http", label: "Requisição HTTP (webhook de saída)" },
];

export function AutomationsView() {
  const b = useBoard(); const toast = useToast();
  const [edit, setEdit] = useState<Automation | "new" | null>(null);
  const [runs, setRuns] = useState<Record<string, any[]>>({});
  useEffect(() => {
    if (!b.automations.length) return;
    supabase.from("automation_runs").select("*").in("automation_id", b.automations.map((a) => a.id)).order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => { const m: Record<string, any[]> = {}; (data ?? []).forEach((r) => (m[r.automation_id] ??= []).push(r)); setRuns(m); });
  }, [b.automations]);
  async function toggle(a: Automation) { await supabase.from("automations").update({ enabled: !a.enabled }).eq("id", a.id); b.reload(["automations"]); }
  async function remove(a: Automation) { if (!confirm(`Excluir a automação "${a.name}"?`)) return; const { error } = await supabase.from("automations").update({ deleted_at: new Date().toISOString() }).eq("id", a.id); if (error) toast(errMsg(error), "err"); b.reload(["automations"]); }
  async function duplicate(a: Automation) {
    const { id, created_at, ...rest } = a; void id; void created_at;
    await supabase.from("automations").insert({ ...rest, name: `${a.name} (cópia)`, enabled: false }); b.reload(["automations"]);
  }
  return (
    <div className="mx-auto max-w-4xl space-y-3 px-4 pb-8 sm:px-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-3">Evento → condição → ações. Rodam no servidor, inclusive para cards criados por webhook, API ou importação.</p>
        {b.isAdmin && <Button variant="primary" onClick={() => setEdit("new")}>+ Nova automação</Button>}
      </div>
      {b.automations.length === 0 && <Empty icon="⚡" title="Nenhuma automação neste board">Ex.: quando o card entrar em “Proposta”, adicionar a etiqueta “Quente” e avisar o gerente.</Empty>}
      {b.automations.map((a) => {
        const r = runs[a.id] ?? []; const ev = EVENTS.find((e) => e.id === a.event);
        const errs = r.filter((x) => x.status === "error").length;
        return (
          <div key={a.id} className="rounded-[16px] border border-line bg-white p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <Toggle checked={a.enabled} onChange={() => toggle(a)} disabled={!b.isAdmin} />
              <button className="min-w-0 flex-1 text-left" onClick={() => b.isAdmin && setEdit(a)}>
                <div className="font-bold">{a.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge color="#5B3FE6">{ev?.icon} {ev?.label}{a.event_config?.phase_id ? `: ${b.phaseMap[a.event_config.phase_id]?.name ?? "?"}` : ""}{a.event_config?.field_id ? `: ${b.fieldMap[a.event_config.field_id]?.label ?? "?"}` : ""}</Badge>
                  {a.conditions.length > 0 && <Badge color="#F59E0B">◆ {a.conditions.length} condição(ões)</Badge>}
                  {a.actions.map((x, i) => <Badge key={i} color="#10B981">{ACTIONS.find((y) => y.id === x.type)?.label}</Badge>)}
                </div>
              </button>
              <div className="text-right text-xs text-ink-3"><div className="num">{r.length} execuções</div>{errs > 0 && <div className="font-bold text-red-600">{errs} com erro</div>}</div>
            </div>
            {r.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-action">Execuções</summary>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto scroll-thin">{r.slice(0, 30).map((x) => (
                <div key={x.id} className="flex items-center gap-2 text-xs"><Badge color={x.status === "success" ? "#10B981" : x.status === "error" ? "#EF4444" : "#8A84A0"}>{x.status === "success" ? "sucesso" : x.status === "error" ? "erro" : "filtrada"}</Badge>
                  <span className="num text-ink-3">{fmtDate(x.created_at, true)}</span>{x.card_id && <a className="text-action" href={`?card=${x.card_id}`}>ver card</a>}{x.detail && <span className="text-red-600">{x.detail}</span>}</div>
              ))}</div></details>}
            {b.isAdmin && <div className="mt-2 flex gap-3 text-xs"><button className="font-semibold text-ink-3 hover:text-ink" onClick={() => duplicate(a)}>Duplicar</button><button className="font-semibold text-ink-3 hover:text-red-600" onClick={() => remove(a)}>Excluir</button></div>}
          </div>
        );
      })}
      {edit && <AutomationEditor auto={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function AutomationEditor({ auto, onClose }: { auto: Automation | null; onClose: () => void }) {
  const b = useBoard(); const { members, org, session } = useApp(); const toast = useToast();
  const [a, setA] = useState<Partial<Automation>>(auto ?? { name: "", event: "card_entered_phase", event_config: {}, conditions: [], match: "and", actions: [], enabled: true });
  const [dbs, setDbs] = useState<{ id: string; name: string }[]>([]); const [dbFields, setDbFields] = useState<Field[]>([]);
  const set = (k: keyof Automation, v: any) => setA((x) => ({ ...x, [k]: v }));
  const cfg = a.event_config ?? {};
  const isRecord = a.event === "record_created" || a.event === "record_status_changed";
  useEffect(() => { supabase.from("databases").select("id,name").eq("org_id", org.id).is("deleted_at", null).then(({ data }) => setDbs(data ?? [])); }, [org.id]);
  useEffect(() => { if (isRecord && cfg.database_id) supabase.from("fields").select("*").eq("database_id", cfg.database_id).is("deleted_at", null).then(({ data }) => setDbFields((data ?? []) as Field[])); }, [isRecord, cfg.database_id]);
  const srcFields = isRecord ? dbFields : b.fields;
  async function save() {
    if (!a.name?.trim()) return toast("Dê um nome à automação.", "err");
    if (!a.actions?.length) return toast("Adicione pelo menos uma ação.", "err");
    const row = { org_id: b.board.org_id, board_id: b.board.id, name: a.name, enabled: a.enabled, event: a.event, event_config: cfg, conditions: a.conditions, match: a.match, actions: a.actions, created_by: auto?.created_by ?? session.user.id };
    const { error } = auto ? await supabase.from("automations").update(row).eq("id", auto.id) : await supabase.from("automations").insert(row);
    if (error) return toast(errMsg(error), "err");
    toast("Automação salva"); b.reload(["automations"]); onClose();
  }
  return (
    <Modal open onClose={onClose} wide title={auto ? "Editar automação" : "Nova automação"} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar automação</Button></>}>
      <div className="space-y-5">
        <div><label className="label">Nome</label><input autoFocus className="input" value={a.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Lead quente na proposta" /></div>
        <Step n={1} title="Quando (evento)" color="#5B3FE6">
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="input" value={a.event} onChange={(e) => { set("event", e.target.value); set("event_config", {}); }}>{EVENTS.map((e) => <option key={e.id} value={e.id}>{e.icon} {e.label}</option>)}</select>
            {(a.event === "card_entered_phase" || a.event === "card_left_phase") && <PhaseSelect phases={b.phases} value={cfg.phase_id ?? ""} onChange={(v) => set("event_config", { ...cfg, phase_id: v })} any="Qualquer fase" />}
            {a.event === "field_updated" && <select className="input" value={cfg.field_id ?? ""} onChange={(e) => set("event_config", { ...cfg, field_id: e.target.value })}><option value="">Qualquer campo</option>{b.fields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>}
            {isRecord && <select className="input" value={cfg.database_id ?? ""} onChange={(e) => set("event_config", { ...cfg, database_id: e.target.value })}><option value="">Database…</option>{dbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
          </div>
        </Step>
        <Step n={2} title="Se (condições — opcional)" color="#F59E0B">
          <ConditionEditor value={a.conditions ?? []} onChange={(v) => set("conditions", v)} match={a.match ?? "and"} onMatch={(m) => set("match", m)} fields={srcFields} phases={b.phases} tags={b.tags} members={members} special={!isRecord} />
        </Step>
        <Step n={3} title="Então (ações, em sequência)" color="#10B981">
          <div className="space-y-3">
            {(a.actions ?? []).map((act, i) => (
              <ActionRow key={i} act={act} isRecord={isRecord} srcFields={srcFields}
                onChange={(v) => set("actions", (a.actions ?? []).map((x, j) => (j === i ? v : x)))} onRemove={() => set("actions", (a.actions ?? []).filter((_, j) => j !== i))} />
            ))}
            <select className="input !w-auto" value="" onChange={(e) => e.target.value && set("actions", [...(a.actions ?? []), { type: e.target.value }])}>
              <option value="">+ Adicionar ação…</option>{ACTIONS.filter((x) => !isRecord || x.id === "create_card" || x.id === "notify" || x.id === "http").map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </div>
        </Step>
        <Toggle checked={a.enabled !== false} onChange={(v) => set("enabled", v)} label="Automação ligada" />
      </div>
    </Modal>
  );
}
function Step({ n, title, color, children }: { n: number; title: string; color: string; children: React.ReactNode }) {
  return <div className="relative rounded-[16px] border border-line p-4 pl-12">
    <span className="absolute left-3 top-4 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }}>{n}</span>
    <div className="mb-3 text-sm font-bold">{title}</div>{children}
  </div>;
}
function PhaseSelect({ phases, value, onChange, any }: { phases: Phase[]; value: string; onChange: (v: string) => void; any?: string }) {
  return <select className="input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">{any ?? "Fase…"}</option>{phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
}

function ActionRow({ act, onChange, onRemove, srcFields, isRecord }: { act: Record<string, any>; onChange: (v: Record<string, any>) => void; onRemove: () => void; srcFields: Field[]; isRecord: boolean }) {
  const b = useBoard(); const { members, org } = useApp();
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]); const [tPhases, setTPhases] = useState<Phase[]>([]); const [tFields, setTFields] = useState<Field[]>([]);
  const set = (k: string, v: any) => onChange({ ...act, [k]: v });
  useEffect(() => { if (act.type === "create_card") supabase.from("boards").select("id,name").eq("org_id", org.id).is("deleted_at", null).order("name").then(({ data }) => setBoards(data ?? [])); }, [act.type, org.id]);
  useEffect(() => {
    if (act.type !== "create_card" || !act.board_id) return;
    supabase.from("phases").select("*").eq("board_id", act.board_id).is("deleted_at", null).order("position").then(({ data }) => setTPhases((data ?? []) as Phase[]));
    supabase.from("fields").select("*").eq("board_id", act.board_id).is("deleted_at", null).is("phase_id", null).order("position").then(({ data }) => setTFields((data ?? []) as Field[]));
  }, [act.type, act.board_id]);
  const field = b.fieldMap[act.field_id];
  return (
    <div className="space-y-2 rounded-[12px] bg-soft p-3">
      <div className="flex items-center justify-between"><span className="text-sm font-bold">{ACTIONS.find((x) => x.id === act.type)?.label}</span><button onClick={onRemove} className="text-ink-3 hover:text-red-600">✕</button></div>
      {act.type === "move_card" && <PhaseSelect phases={b.phases} value={act.phase_id ?? ""} onChange={(v) => set("phase_id", v)} />}
      {act.type === "update_field" && <div className="grid gap-2 sm:grid-cols-2">
        <select className="input" value={act.field_id ?? ""} onChange={(e) => set("field_id", e.target.value)}><option value="">Campo…</option>{b.fields.filter((f) => !["static_text", "formula", "sequence"].includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
        {field && ["single_select"].includes(field.type)
          ? <select className="input" value={act.value ?? ""} onChange={(e) => set("value", e.target.value)}><option value="">(limpar)</option>{(field.options?.items ?? []).map((x: string) => <option key={x}>{x}</option>)}</select>
          : <input className="input" value={typeof act.value === "string" ? act.value : JSON.stringify(act.value ?? "")} onChange={(e) => set("value", e.target.value)} placeholder="Valor (aceita {{id_do_campo}} e {{title}})" />}
      </div>}
      {act.type === "create_card" && <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <select className="input" value={act.board_id ?? ""} onChange={(e) => onChange({ ...act, board_id: e.target.value, phase_id: "", mapping: [] })}><option value="">Board de destino…</option>{boards.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <PhaseSelect phases={tPhases} value={act.phase_id ?? ""} onChange={(v) => set("phase_id", v)} any="Primeira fase" />
        </div>
        {tFields.length > 0 && <div className="space-y-1.5">
          <div className="text-xs font-semibold text-ink-3">Dados de origem → campos do novo card</div>
          {tFields.map((tf) => {
            const m = (act.mapping ?? []).find((x: any) => x.target === tf.id) ?? {};
            const upd = (p: any) => set("mapping", [...(act.mapping ?? []).filter((x: any) => x.target !== tf.id), { target: tf.id, ...m, ...p }]);
            return <div key={tf.id} className="grid grid-cols-[140px_1fr] items-center gap-2 text-xs"><span className="truncate font-semibold">{tf.label}</span>
              <select className="input !py-1.5" value={m.source ?? (m.value ? "__fixed" : "")} onChange={(e) => e.target.value === "__fixed" ? upd({ source: "", value: m.value ?? "" }) : upd({ source: e.target.value, value: undefined })}>
                <option value="">(vazio)</option>{!isRecord && <option value="title">Título do card de origem</option>}{srcFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}<option value="__fixed">Texto fixo…</option></select>
              {m.source === "" && m.value !== undefined && <input className="input col-start-2 !py-1.5" value={m.value} onChange={(e) => upd({ source: "", value: e.target.value })} placeholder="Texto (aceita {{id}})" />}
            </div>;
          })}
        </div>}
      </div>}
      {act.type === "set_tags" && <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <select className="input" value={act.mode ?? "add"} onChange={(e) => set("mode", e.target.value)}><option value="add">Adicionar</option><option value="remove">Remover</option><option value="replace">Substituir por</option></select>
        <ChipPicker multiple selected={act.tag_ids ?? []} onChange={(v) => set("tag_ids", v)} options={b.tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))} />
      </div>}
      {(act.type === "set_assignees" || act.type === "notify") && <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        {act.type === "set_assignees" ? <select className="input" value={act.mode ?? "add"} onChange={(e) => set("mode", e.target.value)}><option value="add">Adicionar</option><option value="remove">Remover</option><option value="replace">Substituir por</option></select> : <span className="pt-2 text-xs font-semibold">Para</span>}
        <ChipPicker multiple selected={act.user_ids ?? []} onChange={(v) => set("user_ids", v)} options={members.map((m) => ({ id: m.user_id, label: m.profile.full_name || m.profile.email || "", icon: <Avatar size={16} name={m.profile.full_name} /> }))} />
      </div>}
      {act.type === "notify" && <><input className="input" value={act.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Título" /><textarea className="input" rows={2} value={act.message ?? ""} onChange={(e) => set("message", e.target.value)} placeholder="Mensagem (aceita {{id_do_campo}} e {{title}})" /></>}
      {act.type === "set_due" && <div className="flex items-center gap-2 text-sm">Vence em <input type="number" className="input !w-24" value={act.amount ?? 1} onChange={(e) => set("amount", Number(e.target.value))} />
        <select className="input !w-32" value={act.unit ?? "days"} onChange={(e) => set("unit", e.target.value)}><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option><option value="weeks">semanas</option><option value="months">meses</option></select> a partir de agora</div>}
      {act.type === "http" && <><input className="input num" value={act.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://… (POST com JSON do card)" />
        <p className="text-xs text-ink-3">Envia POST com {"{ event, automation, card, values }"}. Use para Make, n8n, Zapier ou o Domma Chat.</p></>}
    </div>
  );
}
