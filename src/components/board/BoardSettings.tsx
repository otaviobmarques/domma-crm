"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import type { BoardSettings as BS, FieldRule, Phase, RuleAction } from "@/lib/types";
import { NUMERIC_TYPES, PHASE_COLORS, RULE_ACTIONS, TEXTLIKE_TYPES, fmtDate } from "@/lib/fields";
import { Avatar, Badge, Button, Modal, Toggle, cx, useToast } from "../ui";
import { Icon } from "../Icon";
import { AutomationsView } from "./Automations";
import { ChipPicker } from "../FieldInput";
import { ConditionEditor } from "../ConditionEditor";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";
import { FieldBuilder } from "./FieldBuilder";

export type SettingsTab = "board" | "phases" | "automations" | "members" | "rules" | "fields" | "tags" | "integrations" | "history";

const MAIN_TABS: { id: SettingsTab; label: string; title: string; sub: string }[] = [
  { id: "board", label: "Board", title: "Configurações do Board", sub: "Defina como os cards serão exibidos, selecione as permissões, autorizações do board e mais!" },
  { id: "phases", label: "Fases", title: "Fases", sub: "Ordem, cores, responsáveis automáticos, SLA, totalizador e movimentos permitidos de cada fase." },
  { id: "automations", label: "Automações", title: "Automações", sub: "Evento, condição e ações que rodam sozinhos neste board." },
  { id: "members", label: "Membros", title: "Membros", sub: "Quem participa deste board e com qual papel." },
  { id: "rules", label: "Regras de Campo", title: "Regras de Campo", sub: "Mostre, esconda ou exija campos e permita ou negue mudanças de fase conforme os dados." },
];
const MORE_TABS: { id: SettingsTab; label: string; title: string; sub: string }[] = [
  { id: "fields", label: "Formulários", title: "Formulários e campos", sub: "Formulário inicial e formulários de cada fase." },
  { id: "tags", label: "Etiquetas", title: "Etiquetas", sub: "Etiquetas coloridas usadas nos cards deste board." },
  { id: "integrations", label: "Integrações", title: "Integrações", sub: "Webhook de entrada e IDs para a API." },
  { id: "history", label: "Histórico", title: "Histórico", sub: "Alterações do board e itens excluídos, com restauração." },
];

export function BoardSettings({ open, onClose, tab, setTab, phaseId }: { open: boolean; onClose: () => void; tab: SettingsTab; setTab: (t: SettingsTab) => void; phaseId?: string | null }) {
  const b = useBoard();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".fixed.z-50") && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!open) return null;
  const cur = [...MAIN_TABS, ...MORE_TABS].find((t) => t.id === tab)!;
  const item = (t: { id: SettingsTab; label: string }) => (
    <button key={t.id} onClick={() => setTab(t.id)} className={cx("block w-full rounded-[8px] px-3 py-2 text-left text-[13px] font-medium transition", tab === t.id ? "bg-[#E9E7F0] font-semibold text-ink" : "text-ink-2 hover:bg-[#EFEEF4]")}>{t.label}</button>
  );
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-line text-base" style={{ background: b.board.color + "10" }}>{b.board.icon}</span>
        <span className="text-[16px] font-semibold">{b.board.name}</span>
        <span className="flex-1" />
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-line-2 hover:text-ink" aria-label="Fechar configurações"><Icon name="x" size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[200px] shrink-0 overflow-y-auto bg-[#F6F5F9] px-4 py-6 md:block">
          <div className="mb-3 px-1 text-[13px] font-semibold text-ink">Configurações:</div>
          <div className="space-y-0.5">{MAIN_TABS.map(item)}</div>
          <div className="mb-2 mt-6 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Mais</div>
          <div className="space-y-0.5">{MORE_TABS.map(item)}</div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 scroll-thin md:px-7">
          <select className="input mb-4 md:hidden" value={tab} onChange={(e) => setTab(e.target.value as SettingsTab)}>{[...MAIN_TABS, ...MORE_TABS].map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          <h2 className="text-[17px] font-semibold">{cur.title}</h2>
          <p className="mb-6 mt-0.5 text-[13px] text-ink-2">{cur.sub}</p>
          {tab === "board" && <BoardTab />}
          {tab === "phases" && <PhasesTab focus={phaseId} />}
          {tab === "automations" && <div className="-mx-4 sm:-mx-6"><AutomationsView /></div>}
          {tab === "fields" && <FieldBuilder scope={{ org_id: b.board.org_id, board_id: b.board.id }} fields={b.fields} phases={b.phases} reload={() => b.reload(["fields"])} initialForm={phaseId ?? undefined}
            cardIds={b.board.settings.subtitle_fields ?? []}
            onToggleCard={async (id, on) => {
              const cur = b.board.settings.subtitle_fields ?? [];
              const next = on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id);
              await supabase.from("boards").update({ settings: { ...b.board.settings, subtitle_fields: next } }).eq("id", b.board.id);
              b.reload(["board"]);
            }} />}
          {tab === "rules" && <RulesTab />}
          {tab === "tags" && <TagsTab />}
          {tab === "members" && <MembersTab />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "history" && <HistoryTab />}
        </main>
      </div>
    </div>
  );
}

/** Bloco cinza das configurações (título, descrição, conteúdo). */
function Section({ title, desc, right, children }: { title: string; desc?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="rounded-[10px] bg-[#F6F5F9] px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 text-[13px] font-semibold">{title}{right}</div>
          {desc && <div className="mt-0.5 text-xs text-ink-2">{desc}</div>}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
function MiniToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!checked)} className={cx("h-4 w-7 shrink-0 rounded-full p-[2px] transition", checked ? "bg-action" : "bg-[#B9B5C6]")} aria-pressed={checked}>
    <span className={cx("block h-3 w-3 rounded-full bg-white transition", checked && "translate-x-3")} />
  </button>;
}

function BoardTab() {
  const b = useBoard(); const toast = useToast(); const router = useRouter(); const { orgs } = useApp();
  const [s, setS] = useState<BS>(b.board.settings); const [name, setName] = useState(b.board.name); const [desc, setDesc] = useState(b.board.description ?? "");
  const [vis, setVis] = useState(b.board.visibility); const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(false); const [dupName, setDupName] = useState(`${b.board.name} (cópia)`); const [dupOrg, setDupOrg] = useState(b.board.org_id);
  const set = (k: keyof BS, v: any) => setS((x) => ({ ...x, [k]: v }));
  const titleOptions = b.initialFields.filter((f) => TEXTLIKE_TYPES.includes(f.type));
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("boards").update({ name, description: desc || null, visibility: vis, settings: s, updated_at: new Date().toISOString() }).eq("id", b.board.id);
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    toast("Configurações salvas"); b.reload(["board", "cards"]);
  }
  async function del() {
    if (prompt(`Ação irreversível. Digite o nome do board para excluir: ${b.board.name}`) !== b.board.name) return;
    const { error } = await supabase.rpc("delete_board", { p_board: b.board.id });
    if (error) return toast(errMsg(error), "err");
    router.push("/");
  }
  async function duplicate() {
    const { data, error } = await supabase.rpc("duplicate_board", { p_board: b.board.id, p_name: dupName, p_org: dupOrg });
    if (error) return toast(errMsg(error), "err");
    toast("Board duplicado (automações copiadas ficam desligadas)"); router.push(`/b/${data}`);
  }
  return (
    <div className="max-w-5xl space-y-5 pb-10">
      <div>
        <label className="label">Nome do Board</label>
        <div className="flex gap-2">
          <input className="input !h-10 !bg-[#F6F5F9]" value={name} onChange={(e) => setName(e.target.value)} />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border text-lg" style={{ borderColor: b.board.color, background: b.board.color + "10" }} title="Ícone do board">{b.board.icon}</span>
        </div>
      </div>

      <Section title="Configurações do Board" desc="Defina como os cards serão exibidos, selecione as permissões e autorizações do board e mais!">
        <div className="grid gap-5 md:grid-cols-[200px_1fr] md:items-end">
          <div className="rounded-[10px] bg-white p-3 shadow-soft">
            <div className="text-[13px] font-semibold">{b.fieldMap[s.title_field ?? ""]?.label ?? "Título"}</div>
            {(s.subtitle_fields ?? []).map((id) => b.fieldMap[id] && <div key={id} className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-2"><span className="w-3 text-center text-ink-3">·</span>{b.fieldMap[id].label}</div>)}
            <div className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-ink-2"><Avatar size={18} name="?" />{!s.hide_clocks && <><span className="num">◷ 16h</span><span className="num">◷ 16h</span><span className="num">↻ 16h</span></>}</div>
          </div>
          <div className="space-y-4">
            <div><label className="label">Título</label><select className="input !h-10" value={s.title_field ?? ""} onChange={(e) => set("title_field", e.target.value || undefined)}><option value="">—</option>{titleOptions.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
            <div><label className="label">Subtítulo</label><ChipPicker multiple selected={s.subtitle_fields ?? []} onChange={(v) => set("subtitle_fields", v)} options={b.fields.filter((f) => f.type !== "static_text").map((f) => ({ id: f.id, label: f.label, color: "#7B61FF" }))} /></div>
          </div>
        </div>
      </Section>

      <Section title="Ocultar relógios dos cards" right={<MiniToggle checked={!!s.hide_clocks} onChange={(v) => set("hide_clocks", v)} />} desc="Oculta os tempos do card no board, na fase e desde a última atualização." />

      <Section title="Alertas de vencimento" desc="Defina o tempo de antecedência para os responsáveis receberem um alerta de vencimento dos cards.">
        <div className="flex gap-2">
          <input type="number" min={0} className="input !w-28" value={s.due_alert_value ?? ""} onChange={(e) => set("due_alert_value", e.target.value ? Number(e.target.value) : undefined)} placeholder="Tempo" />
          <select className="input !w-40" value={s.due_alert_unit ?? "hours"} onChange={(e) => set("due_alert_unit", e.target.value)}><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select>
        </div>
      </Section>

      <Section title="Responsável pelo card criado" right={<MiniToggle checked={!!s.assign_creator} onChange={(v) => set("assign_creator", v)} />} desc="Atribui o card a quem o criou, ignorando a distribuição da fase." />

      <Section title="Permissões personalizadas" desc="Controle o que cada nível de acesso pode fazer neste board.">
        <div className="space-y-3">
          {([["block_delete", "Bloquear exclusão de cards para Membro e Visão limitada"], ["guest_see_all", "Permitir que Convidado veja todos os cards"], ["only_assignees", "Só responsáveis veem e editam cards (administradores continuam vendo tudo)"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-3 text-[13px]"><MiniToggle checked={!!s[k]} onChange={(v) => set(k, v)} />{l}</label>
          ))}
        </div>
      </Section>

      <Section title="Visibilidade e descrição" desc="Quem pode ver o board e o texto exibido abaixo do nome.">
        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          <select className="input" value={vis} onChange={(e) => setVis(e.target.value as any)}><option value="org">Toda a organização pode ver</option><option value="private">Só membros do board</option></select>
          <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (opcional)" />
        </div>
      </Section>

      <Section title="Busca otimizada" right={<MiniToggle checked onChange={() => {}} />} desc="Índice de busca para boards grandes. No Domma CRM fica sempre ligado." />

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 border-t border-line bg-white/95 px-1 py-3 backdrop-blur">
        <Button variant="primary" loading={busy} onClick={save}>Salvar alterações</Button>
        <span className="flex-1" />
        <Button onClick={() => setDup(true)}>Duplicar board</Button>
        <Button variant="danger" onClick={del}>Excluir board</Button>
      </div>
      <Modal open={dup} onClose={() => setDup(false)} title="Duplicar board" footer={<><Button onClick={() => setDup(false)}>Cancelar</Button><Button variant="primary" onClick={duplicate}>Duplicar</Button></>}>
        <div className="space-y-3">
          <div><label className="label">Nome da cópia</label><input className="input" value={dupName} onChange={(e) => setDupName(e.target.value)} /></div>
          <div><label className="label">Criar na organização</label><select className="input" value={dupOrg} onChange={(e) => setDupOrg(e.target.value)}>{orgs.filter((o) => o.role !== "guest" && o.role !== "limited").map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <p className="text-xs text-ink-3">Copia fases, campos, etiquetas, regras e automações (desligadas). Útil para replicar processos entre franquias.</p>
        </div>
      </Modal>
    </div>
  );
}

function PhasesTab({ focus }: { focus?: string | null }) {
  const b = useBoard(); const [edit, setEdit] = useState<Phase | null>(null); const [drag, setDrag] = useState<string | null>(null);
  useEffect(() => { if (focus) setEdit(b.phases.find((p) => p.id === focus) ?? null); }, [focus, b.phases]);
  async function reorder(target: string) {
    if (!drag || drag === target) return;
    const ids = b.phases.map((p) => p.id).filter((id) => id !== drag); ids.splice(ids.indexOf(target), 0, drag);
    await Promise.all(ids.map((id, i) => supabase.from("phases").update({ position: i }).eq("id", id)));
    setDrag(null); b.reload(["phases"]);
  }
  async function add() {
    await supabase.from("phases").insert({ org_id: b.board.org_id, board_id: b.board.id, name: "Nova fase", position: (b.phases.at(-1)?.position ?? 0) + 1, color: PHASE_COLORS[b.phases.length % PHASE_COLORS.length] });
    b.reload(["phases"]);
  }
  return (
    <div className="space-y-2">
      {b.phases.map((p) => (
        <div key={p.id} draggable onDragStart={() => setDrag(p.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(p.id)}
          className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5" style={{ borderLeft: `4px solid ${p.color}` }}>
          <span className="cursor-grab text-ink-3">⠿</span>
          <button className="flex-1 text-left" onClick={() => setEdit(p)}>
            <div className="text-sm font-bold">{p.name} {p.is_final && <Badge color="#10B981">final</Badge>} {p.archived && <Badge color="#8A84A0">arquivada</Badge>} {p.create_enabled && <Badge color="#5B3FE6">cria cards</Badge>}</div>
            <div className="text-xs text-ink-3">
              {p.sla_value ? `SLA ${p.sla_value} ${p.sla_unit === "minutes" ? "min" : p.sla_unit === "hours" ? "h" : "dias"} · ` : ""}
              {p.auto_assignees.length ? `${p.auto_assignees.length} responsável(is) · ${p.distribution === "sequential" ? "rodízio" : "todos"} · ` : ""}
              {p.allowed_moves ? `${p.allowed_moves.length} movimento(s) permitido(s)` : "todos os movimentos"}
              {p.totalizer?.field_id ? " · totalizador" : ""}
            </div>
          </button>
          {p.archived && <Button size="sm" variant="soft" onClick={async () => { await supabase.from("phases").update({ archived: false }).eq("id", p.id); b.reload(["phases"]); }}>Desarquivar</Button>}
          <Button size="sm" onClick={() => setEdit(p)}>Configurar</Button>
        </div>
      ))}
      <Button variant="soft" onClick={add}>+ Nova fase</Button>
      {edit && <PhaseEditor phase={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PhaseEditor({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  const b = useBoard(); const { members } = useApp(); const toast = useToast();
  const [p, setP] = useState<Phase>(phase); const [busy, setBusy] = useState(false);
  const set = (k: keyof Phase, v: any) => setP((x) => ({ ...x, [k]: v }));
  const numeric = b.fields.filter((f) => NUMERIC_TYPES.includes(f.type));
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("phases").update({
      name: p.name, color: p.color, description: p.description, is_final: p.is_final, sla_value: p.sla_value || null, sla_unit: p.sla_value ? p.sla_unit ?? "days" : null,
      auto_assignees: p.auto_assignees, distribution: p.distribution, replace_assignees: p.replace_assignees, always_assign: p.always_assign,
      totalizer: p.totalizer?.field_id ? p.totalizer : null, allowed_moves: p.allowed_moves,
    }).eq("id", p.id);
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    toast("Fase salva"); b.reload(["phases"]); onClose();
  }
  const others = b.phases.filter((x) => x.id !== p.id);
  return (
    <Modal open onClose={onClose} wide title={`Fase · ${phase.name}`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar fase</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div><label className="label">Nome</label><input className="input" value={p.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><span className="label">Cor</span><div className="flex flex-wrap gap-1.5 pt-1">{PHASE_COLORS.map((c) => <button key={c} onClick={() => set("color", c)} className={cx("h-6 w-6 rounded-full", p.color === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} aria-label={c} />)}</div></div>
        </div>
        <div><label className="label">Descrição (exibida na coluna vazia)</label><textarea className="input" rows={2} maxLength={10000} value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="rounded-[12px] bg-soft p-3">
          <div className="mb-2 text-sm font-bold">Responsáveis automáticos</div>
          <ChipPicker multiple selected={p.auto_assignees} onChange={(v) => set("auto_assignees", v)} options={members.filter((m) => m.role !== "guest").map((m) => ({ id: m.user_id, label: m.profile.full_name || m.profile.email || "", icon: <Avatar size={16} name={m.profile.full_name} /> }))} />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div><label className="label">Distribuição</label><select className="input" value={p.distribution} onChange={(e) => set("distribution", e.target.value)}><option value="all">Padrão: todos em cada card</option><option value="sequential">Sequencial: rodízio</option></select></div>
            <div className="pt-5"><Toggle checked={p.replace_assignees} onChange={(v) => set("replace_assignees", v)} label="Substituir responsáveis" /></div>
            <div className="pt-5"><Toggle checked={p.always_assign} onChange={(v) => set("always_assign", v)} label="Atribuir sempre" hint="A cada entrada na fase." /></div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><span className="label">SLA da fase</span><div className="flex gap-2"><input type="number" min={0} className="input !w-24" value={p.sla_value ?? ""} onChange={(e) => set("sla_value", e.target.value ? Number(e.target.value) : null)} placeholder="—" />
            <select className="input" value={p.sla_unit ?? "days"} onChange={(e) => set("sla_unit", e.target.value)}><option value="minutes">minutos</option><option value="hours">horas</option><option value="days">dias</option></select></div>
            <span className="mt-1 block text-xs text-ink-3">Ao entrar, o card recebe nova data de vencimento.</span></div>
          <div className="pt-5"><Toggle checked={p.is_final} onChange={(v) => set("is_final", v)} label="Fase final" hint="Marca o fim do processo; cards ficam em cinza." /></div>
        </div>
        <div><span className="label">Totalizador</span>
          <div className="grid gap-2 sm:grid-cols-4">
            <input className="input" placeholder="Nome" value={p.totalizer?.name ?? ""} onChange={(e) => set("totalizer", { ...p.totalizer, name: e.target.value })} />
            <select className="input" value={p.totalizer?.field_id ?? ""} onChange={(e) => set("totalizer", { ...p.totalizer, field_id: e.target.value })}><option value="">Sem totalizador</option>{numeric.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
            <select className="input" value={p.totalizer?.op ?? "sum"} onChange={(e) => set("totalizer", { ...p.totalizer, op: e.target.value as any })}><option value="sum">Soma</option><option value="avg">Média</option></select>
            <select className="input" value={p.totalizer?.format ?? "currency"} onChange={(e) => set("totalizer", { ...p.totalizer, format: e.target.value as any })}><option value="currency">Moeda</option><option value="number">Valor</option></select>
          </div>
        </div>
        <div><span className="label">Movimentos permitidos a partir desta fase</span>
          <Toggle checked={p.allowed_moves === null} onChange={(v) => set("allowed_moves", v ? null : others.map((o) => o.id))} label="Permitir mover para qualquer fase" />
          {p.allowed_moves !== null && <div className="mt-2 grid gap-1 sm:grid-cols-2">{others.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.allowed_moves!.includes(o.id)} onChange={(e) => set("allowed_moves", e.target.checked ? [...p.allowed_moves!, o.id] : p.allowed_moves!.filter((x) => x !== o.id))} /><span className="h-2 w-2 rounded-full" style={{ background: o.color }} />{o.name}</label>
          ))}</div>}
        </div>
      </div>
    </Modal>
  );
}

function RulesTab() {
  const b = useBoard(); const [edit, setEdit] = useState<FieldRule | "new" | null>(null); const toast = useToast();
  async function toggle(r: FieldRule) { await supabase.from("field_rules").update({ enabled: !r.enabled }).eq("id", r.id); b.reload(["rules"]); }
  async function remove(r: FieldRule) { if (!confirm(`Excluir a regra "${r.name}"?`)) return; const { error } = await supabase.from("field_rules").delete().eq("id", r.id); if (error) toast(errMsg(error), "err"); b.reload(["rules"]); }
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-3">Mostre, esconda, habilite ou torne campos obrigatórios e permita ou negue a mudança de fase conforme os dados.</p>
      {b.rules.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2.5">
          <Toggle checked={r.enabled} onChange={() => toggle(r)} />
          <button className="flex-1 text-left" onClick={() => setEdit(r)}><div className="text-sm font-bold">{r.name}</div><div className="text-xs text-ink-3">{r.phase_id ? `Fase: ${b.phaseMap[r.phase_id]?.name}` : "Board inteiro"} · {r.conditions.length} condição(ões) · {r.true_actions.length} ação(ões){r.mirror && " · espelhadas"}</div></button>
          <button className="text-ink-3 hover:text-red-600" onClick={() => remove(r)}>🗑</button>
        </div>
      ))}
      <Button variant="soft" onClick={() => setEdit("new")}>+ Nova regra</Button>
      {edit && <RuleEditor rule={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RuleEditor({ rule, onClose }: { rule: FieldRule | null; onClose: () => void }) {
  const b = useBoard(); const { members } = useApp(); const toast = useToast();
  const [r, setR] = useState<Partial<FieldRule>>(rule ?? { name: "", phase_id: null, conditions: [], match: "and", true_actions: [], false_actions: [], mirror: true, enabled: true });
  const set = (k: keyof FieldRule, v: any) => setR((x) => ({ ...x, [k]: v }));
  async function save() {
    if (!r.name?.trim()) return toast("Dê um nome à regra.", "err");
    const row = { org_id: b.board.org_id, board_id: b.board.id, name: r.name, phase_id: r.phase_id || null, conditions: r.conditions, match: r.match, true_actions: r.true_actions, false_actions: r.mirror ? [] : r.false_actions, mirror: r.mirror, enabled: r.enabled, position: rule?.position ?? b.rules.length };
    const { error } = rule ? await supabase.from("field_rules").update(row).eq("id", rule.id) : await supabase.from("field_rules").insert(row);
    if (error) return toast(errMsg(error), "err");
    toast("Regra salva"); b.reload(["rules"]); onClose();
  }
  return (
    <Modal open onClose={onClose} wide title={rule ? "Editar regra" : "Nova regra de campo"} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={save}>Salvar regra</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Nome</label><input className="input" value={r.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Reunião imediata" /></div>
          <div><label className="label">Contexto</label><select className="input" value={r.phase_id ?? ""} onChange={(e) => set("phase_id", e.target.value || null)}><option value="">Board (todos os formulários)</option>{b.phases.map((p) => <option key={p.id} value={p.id}>Fase: {p.name}</option>)}</select></div>
        </div>
        <div><div className="label">Condições</div><ConditionEditor value={r.conditions ?? []} onChange={(v) => set("conditions", v)} match={r.match ?? "and"} onMatch={(m) => set("match", m)} fields={b.fields} phases={b.phases} tags={b.tags} members={members} /></div>
        <div><div className="label">Se verdadeira</div><ActionsEditor value={r.true_actions ?? []} onChange={(v) => set("true_actions", v)} /></div>
        <Toggle checked={!!r.mirror} onChange={(v) => set("mirror", v)} label="Ações espelhadas" hint="Gera o inverso das ações verdadeiras no caso falso (ex.: exibir ↔ esconder)." />
        {!r.mirror && <div><div className="label">Se falsa</div><ActionsEditor value={r.false_actions ?? []} onChange={(v) => set("false_actions", v)} /></div>}
      </div>
    </Modal>
  );
}
function ActionsEditor({ value, onChange }: { value: RuleAction[]; onChange: (v: RuleAction[]) => void }) {
  const b = useBoard();
  return (
    <div className="space-y-2">
      {value.map((a, i) => {
        const def = RULE_ACTIONS.find((x) => x.type === a.type);
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <select className="input" value={a.type} onChange={(e) => onChange(value.map((x, j) => (j === i ? { type: e.target.value } : x)))}>{RULE_ACTIONS.map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}</select>
            {def?.target === "phase"
              ? <select className="input" value={a.phase_id ?? ""} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, phase_id: e.target.value } : x)))}><option value="">Qualquer fase</option>{b.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              : <select className="input" value={a.field_id ?? ""} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, field_id: e.target.value } : x)))}><option value="">Campo…</option>{b.fields.map((f) => <option key={f.id} value={f.id}>{f.label}{f.phase_id ? ` (${b.phaseMap[f.phase_id]?.name})` : ""}</option>)}</select>}
            <button className="px-2 text-ink-3" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
          </div>
        );
      })}
      <Button size="sm" variant="soft" onClick={() => onChange([...value, { type: "show" }])}>+ Ação</Button>
    </div>
  );
}

function TagsTab() {
  const b = useBoard(); const toast = useToast(); const [name, setName] = useState(""); const [color, setColor] = useState(PHASE_COLORS[0]);
  async function add() { if (!name.trim()) return; const { error } = await supabase.from("tags").insert({ org_id: b.board.org_id, board_id: b.board.id, name: name.trim(), color }); if (error) toast(errMsg(error), "err"); setName(""); b.reload(["tags"]); }
  async function upd(id: string, patch: any) { await supabase.from("tags").update(patch).eq("id", id); b.reload(["tags"]); }
  return (
    <div className="space-y-3">
      {b.tags.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <input className="input !w-auto flex-1" defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && upd(t.id, { name: e.target.value })} />
          <div className="flex gap-1">{PHASE_COLORS.slice(0, 8).map((c) => <button key={c} onClick={() => upd(t.id, { color: c })} className={cx("h-5 w-5 rounded-full", t.color === c && "ring-2 ring-ink ring-offset-1")} style={{ background: c }} />)}</div>
          <button className="text-ink-3 hover:text-red-600" onClick={() => upd(t.id, { deleted_at: new Date().toISOString() })}>🗑</button>
        </div>
      ))}
      <div className="flex items-center gap-2 border-t border-line pt-3">
        <input className="input flex-1" placeholder="Nova etiqueta" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <div className="flex gap-1">{PHASE_COLORS.slice(0, 8).map((c) => <button key={c} onClick={() => setColor(c)} className={cx("h-5 w-5 rounded-full", color === c && "ring-2 ring-ink ring-offset-1")} style={{ background: c }} />)}</div>
        <Button variant="primary" onClick={add}>Adicionar</Button>
      </div>
    </div>
  );
}

function MembersTab() {
  const b = useBoard(); const { members, memberMap } = useApp(); const toast = useToast(); const [add, setAdd] = useState("");
  const inBoard = new Set(b.boardMembers.map((m) => m.user_id));
  async function addMember() { if (!add) return; const { error } = await supabase.from("board_members").insert({ board_id: b.board.id, user_id: add, role: "member" }); if (error) toast(errMsg(error), "err"); setAdd(""); b.reload(["members"]); }
  async function setRole(uid: string, role: string) { await supabase.from("board_members").update({ role }).eq("board_id", b.board.id).eq("user_id", uid); b.reload(["members"]); }
  async function remove(uid: string) { await supabase.from("board_members").delete().eq("board_id", b.board.id).eq("user_id", uid); b.reload(["members"]); }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-3">Administradores da organização acessam todos os boards. Membros com papel “Visão limitada” só veem cards em que são responsáveis ou criadores.</p>
      {b.boardMembers.map((m) => {
        const p = memberMap[m.user_id]; const orgRole = members.find((x) => x.user_id === m.user_id)?.role;
        return (
          <div key={m.user_id} className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2">
            <Avatar name={p?.full_name || p?.email} size={30} />
            <div className="flex-1"><div className="text-sm font-semibold">{p?.full_name || p?.email}</div><div className="text-xs text-ink-3">{p?.email} · organização: {roleLabel(orgRole)}</div></div>
            <select className="input !w-auto" value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}><option value="member">Membro</option><option value="admin">Admin do board</option></select>
            <button className="text-ink-3 hover:text-red-600" onClick={() => remove(m.user_id)}>✕</button>
          </div>
        );
      })}
      <div className="flex gap-2 border-t border-line pt-3">
        <select className="input flex-1" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">Adicionar membro da organização…</option>{members.filter((m) => !inBoard.has(m.user_id)).map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.full_name || m.profile.email} ({roleLabel(m.role)})</option>)}</select>
        <Button variant="primary" onClick={addMember}>Adicionar</Button>
      </div>
    </div>
  );
}
export const roleLabel = (r?: string) => ({ admin: "Admin", member: "Membro", limited: "Visão limitada", guest: "Convidado" } as Record<string, string>)[r ?? ""] ?? "—";

function IntegrationsTab() {
  const b = useBoard(); const toast = useToast(); const [reqs, setReqs] = useState<any[]>([]);
  const url = typeof window !== "undefined" ? `${location.origin}/api/webhook/${b.board.webhook_token}` : "";
  useEffect(() => { supabase.from("webhook_requests").select("*").eq("board_id", b.board.id).order("created_at", { ascending: false }).limit(20).then(({ data }) => setReqs(data ?? [])); }, [b.board.id]);
  const integrated = b.initialFields.filter((f) => f.integrated_key);
  const sample = Object.fromEntries(integrated.map((f) => [f.integrated_key!, f.type === "currency" || f.type === "number" ? 0 : "..."]));
  return (
    <div className="space-y-5">
      <div>
        <div className="label">Webhook de entrada</div>
        <div className="flex gap-2"><input readOnly className="input num text-xs" value={url} /><Button onClick={() => { navigator.clipboard.writeText(url); toast("URL copiada"); }}>Copiar</Button></div>
        <p className="mt-1 text-xs text-ink-3">Envie um POST com JSON. Os campos “integrados” leem as chaves do JSON (objetos aninhados com ponto, ex.: <span className="num">cliente.nome</span>). Serve para Meta Lead Ads via Make/Zapier, formulários do Google Ads, sites e a extensão do navegador.</p>
        <pre className="num mt-2 overflow-x-auto rounded-[12px] bg-ink p-3 text-xs text-white">{`curl -X POST ${url} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(sample)}'`}</pre>
        {integrated.length === 0 && <p className="mt-1 text-xs font-semibold text-amber-700">Nenhum campo do formulário inicial tem chave “Integrado”. Configure em Campos e formulários.</p>}
      </div>
      <div>
        <div className="label">Últimas requisições recebidas</div>
        <div className="space-y-1">{reqs.map((r) => (
          <details key={r.id} className="rounded-[10px] border border-line px-3 py-2 text-xs">
            <summary className="flex cursor-pointer gap-2"><Badge color={r.status === "success" ? "#10B981" : "#EF4444"}>{r.status}</Badge><span className="num">{fmtDate(r.created_at, true)}</span>{r.error && <span className="text-red-600">{r.error}</span>}</summary>
            <pre className="num mt-2 overflow-x-auto">{JSON.stringify(r.payload, null, 2)}</pre>
          </details>
        ))}{reqs.length === 0 && <div className="text-xs text-ink-3">Nenhuma requisição ainda.</div>}</div>
      </div>
      <div className="rounded-[12px] bg-soft p-3 text-xs text-ink-2">
        <b>API REST:</b> gere uma chave em Configurações › Usuário. ID deste board: <span className="num font-bold">{b.board.id}</span>. IDs das fases: {b.phases.map((p) => <span key={p.id} className="num mr-2 inline-block">{p.name}=<b>{p.id.slice(0, 8)}…</b></span>)}
      </div>
    </div>
  );
}

function HistoryTab() {
  const b = useBoard(); const { memberMap } = useApp(); const toast = useToast();
  const [deleted, setDeleted] = useState<any[]>([]); const [events, setEvents] = useState<any[]>([]);
  const load = useCallback(() => {
    supabase.rpc("deleted_items", { p_board: b.board.id }).then(({ data }) => setDeleted(data ?? []));
    supabase.from("card_events").select("*, cards(title)").eq("board_id", b.board.id).order("created_at", { ascending: false }).limit(100).then(({ data }) => setEvents(data ?? []));
  }, [b.board.id]);
  useEffect(() => { load(); }, [load]);
  async function restore(kind: string, id: string) {
    const { error } = await supabase.rpc("restore_item", { p_type: kind, p_id: id });
    if (error) return toast(errMsg(error), "err");
    toast("Restaurado"); load(); b.reload();
  }
  const kindLabel: Record<string, string> = { card: "Card", phase: "Fase", field: "Campo", tag: "Etiqueta" };
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-bold">Itens excluídos</h3>
        <div className="space-y-1.5">{deleted.map((d) => (
          <div key={d.id} className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-sm">
            <Badge className="bg-soft text-ink-2">{kindLabel[d.kind]}</Badge><span className="flex-1 truncate">{d.name}</span><span className="num text-xs text-ink-3">{fmtDate(d.deleted_at)}</span>
            <Button size="sm" onClick={() => restore(d.kind, d.id)}>Restaurar</Button>
          </div>
        ))}{deleted.length === 0 && <div className="text-xs text-ink-3">Nada na lixeira.</div>}</div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold">Atividade recente <a href="/settings?tab=logs" className="ml-2 text-xs font-semibold text-action">Ver nos logs</a></h3>
        <ol className="space-y-2 text-sm">{events.map((e) => (
          <li key={e.id} className="border-b border-line pb-2"><b>{e.actor ? memberMap[e.actor]?.full_name ?? "Usuário" : "Sistema"}</b> · {e.type === "moved" ? `moveu para ${e.data.to_name}` : e.type === "fields" ? "alterou campos" : e.type} · <span className="text-ink-2">{e.cards?.title}</span><div className="num text-[11px] text-ink-3">{fmtDate(e.created_at, true)}</div></li>
        ))}</ol>
      </div>
    </div>
  );
}
