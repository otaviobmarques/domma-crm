"use client";
import { useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Field, Phase } from "@/lib/types";
import { FIELD_TYPES, NUMERIC_TYPES, computeFormula, typeDef } from "@/lib/fields";
import { Badge, Button, Modal, Toggle, cx, useToast } from "../ui";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";

interface Scope { org_id: string; board_id?: string; database_id?: string }

export function FieldBuilder({ scope, fields, phases = [], reload, initialForm, cardIds, onToggleCard }:
  { scope: Scope; fields: Field[]; phases?: Phase[]; reload: () => void; initialForm?: string; cardIds?: string[]; onToggleCard?: (id: string, on: boolean) => void }) {
  const [form, setForm] = useState<string>(initialForm ?? "initial");
  const [editing, setEditing] = useState<Field | "new" | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const toast = useToast();
  const list = fields.filter((f) => (form === "initial" ? !f.phase_id : f.phase_id === form)).sort((a, b) => a.position - b.position);

  async function reorder(targetId: string) {
    if (!drag || drag === targetId) return;
    const ids = list.map((f) => f.id).filter((id) => id !== drag);
    ids.splice(ids.indexOf(targetId), 0, drag);
    await Promise.all(ids.map((id, i) => supabase.from("fields").update({ position: i }).eq("id", id)));
    setDrag(null); reload();
  }
  async function toggleHidden(f: Field) {
    if (!f.hidden && !confirm(`Ocultar "${f.label}" do formulário? O campo deixa de ser pedido ao criar/preencher o card (os valores já salvos continuam visíveis). Para escolher o que aparece no card do Kanban, use a opção "No card".`)) return;
    await supabase.from("fields").update({ hidden: !f.hidden }).eq("id", f.id); reload();
  }
  async function remove(f: Field) {
    if (!confirm(`Excluir o campo "${f.label}"? Os valores ficam guardados e o campo pode ser restaurado no histórico.`)) return;
    const { error } = await supabase.from("fields").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
    if (error) toast(errMsg(error), "err"); reload();
  }
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr]">
      {scope.board_id && (
        <div className="space-y-1">
          <div className="label">Formulários</div>
          {[{ id: "initial", name: "Formulário inicial", color: "#1A1033" }, ...phases.map((p) => ({ id: p.id, name: p.name, color: p.color }))].map((x) => (
            <button key={x.id} onClick={() => setForm(x.id)} className={cx("flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-semibold", form === x.id ? "bg-lilac text-action" : "hover:bg-soft")}>
              <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />{x.name}
              <span className="num ml-auto text-xs text-ink-3">{fields.filter((f) => (x.id === "initial" ? !f.phase_id : f.phase_id === x.id)).length}</span>
            </button>
          ))}
        </div>
      )}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs text-ink-3">{form === "initial" ? "Campos pedidos ao criar o card (manual, importação, webhook ou API)." : "Campos que completam o card nesta fase."}</p>
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>+ Novo campo</Button>
        </div>
        <div className="space-y-1.5">
          {list.map((f) => (
            <div key={f.id} draggable onDragStart={() => setDrag(f.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(f.id)}
              className={cx("flex items-center gap-3 rounded-[12px] border border-line bg-white px-3 py-2", f.hidden && "opacity-50", drag === f.id && "ring-2 ring-action/30")}>
              <span className="cursor-grab text-ink-3">⠿</span>
              <span className="flex h-7 w-9 items-center justify-center rounded-md bg-soft text-xs font-bold text-ink-2">{typeDef(f.type).icon}</span>
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(f)}>
                <div className="truncate text-sm font-semibold">{f.label}{f.required && <span className="text-red-500"> *</span>}{f.hidden && <Badge className="ml-2">oculto no formulário</Badge>}</div>
                <div className="text-xs text-ink-3">{typeDef(f.type).label}{f.unique_value && " · exclusivo"}{f.integrated_key && ` · integrado: ${f.integrated_key}`}{!f.editable && " · só leitura fora da fase"}</div>
              </button>
              {onToggleCard && f.type !== "static_text" && (
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-2" title="Exibe o valor deste campo no card do Kanban">
                  <input type="checkbox" checked={!!cardIds?.includes(f.id)} onChange={(e) => onToggleCard(f.id, e.target.checked)} />No card
                </label>
              )}
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-2" title="Pede este campo no formulário">
                <input type="checkbox" checked={!f.hidden} onChange={() => toggleHidden(f)} />No formulário
              </label>
              <button onClick={() => remove(f)} className="px-1 text-sm text-ink-3 hover:text-red-600" title="Excluir campo">🗑</button>
            </div>
          ))}
          {list.length === 0 && <div className="rounded-[12px] border border-dashed border-line p-6 text-center text-sm text-ink-3">Nenhum campo. Clique em “Novo campo”.</div>}
        </div>
      </div>
      {editing && <FieldEditor field={editing === "new" ? null : editing} scope={scope} phaseId={form === "initial" ? null : form} siblings={fields}
        nextPosition={(list.at(-1)?.position ?? -1) + 1} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

export function QuickFieldButton({ phaseId }: { phaseId: string }) {
  const b = useBoard(); const [open, setOpen] = useState(false);
  return <>
    <Button size="sm" variant="soft" onClick={() => setOpen(true)}>+ Novo campo</Button>
    {open && <FieldEditor field={null} scope={{ org_id: b.board.org_id, board_id: b.board.id }} phaseId={phaseId} siblings={b.fields}
      nextPosition={b.phaseFields(phaseId).length} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); b.reload(["fields"]); }} />}
  </>;
}

export function FieldEditor({ field, scope, phaseId, siblings, nextPosition, onClose, onSaved }:
  { field: Field | null; scope: Scope; phaseId: string | null; siblings: Field[]; nextPosition: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const { org } = useApp();
  const [type, setType] = useState(field?.type ?? "");
  const [f, setF] = useState<Partial<Field>>(field ?? { label: "", required: false, editable: true, unique_value: false, unique_open_only: false, options: {}, hidden: false });
  const [busy, setBusy] = useState(false);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]); const [dbs, setDbs] = useState<{ id: string; name: string }[]>([]);
  const [targetFields, setTargetFields] = useState<Field[]>([]); const [usage, setUsage] = useState<string[] | null>(null);
  const set = (k: keyof Field, v: any) => setF((x) => ({ ...x, [k]: v }));
  const opt = (k: string, v: any) => setF((x) => ({ ...x, options: { ...(x.options ?? {}), [k]: v } }));
  const o = f.options ?? {};
  useEffect(() => {
    if (type === "connected_board") supabase.from("boards").select("id,name").eq("org_id", org.id).is("deleted_at", null).order("name").then(({ data }) => setBoards(data ?? []));
    if (type === "connected_database") supabase.from("databases").select("id,name").eq("org_id", org.id).is("deleted_at", null).order("name").then(({ data }) => setDbs(data ?? []));
  }, [type, org.id]);
  useEffect(() => {
    if (type === "connected_database" && o.database_id) supabase.from("fields").select("*").eq("database_id", o.database_id).is("deleted_at", null).then(({ data }) => setTargetFields((data ?? []) as Field[]));
  }, [type, o.database_id]);

  async function checkUsage() {
    if (!field) return;
    const [{ data: rules }, { data: autos }] = await Promise.all([
      supabase.from("field_rules").select("name, conditions, true_actions, false_actions").or(`board_id.eq.${scope.board_id ?? "00000000-0000-0000-0000-000000000000"},database_id.eq.${scope.database_id ?? "00000000-0000-0000-0000-000000000000"}`),
      scope.board_id ? supabase.from("automations").select("name, event_config, conditions, actions").eq("board_id", scope.board_id).is("deleted_at", null) : Promise.resolve({ data: [] as any[] }),
    ]);
    const hits = [...(rules ?? []).filter((r) => JSON.stringify(r).includes(field.id)).map((r) => `Regra: ${r.name}`), ...(autos ?? []).filter((a: any) => JSON.stringify(a).includes(field.id)).map((a: any) => `Automação: ${a.name}`)];
    setUsage(hits);
  }

  async function save() {
    if (!f.label?.trim()) return toast("Dê um nome ao campo.", "err");
    if (type === "formula" && o.expression && computeFormula(o.expression, {}) === null) return toast("Fórmula inválida.", "err");
    setBusy(true);
    const row = {
      org_id: scope.org_id, board_id: scope.board_id ?? null, database_id: scope.database_id ?? null, phase_id: field ? field.phase_id : phaseId,
      type, label: f.label!.trim(), description: f.description || null, help: f.help || null, required: !!f.required, editable: f.editable !== false,
      unique_value: !!f.unique_value, unique_open_only: !!f.unique_open_only, integrated_key: f.integrated_key || null, regex: f.regex || null,
      options: f.options ?? {}, position: field?.position ?? nextPosition, hidden: !!f.hidden,
    };
    const { error } = field ? await supabase.from("fields").update(row).eq("id", field.id) : await supabase.from("fields").insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    toast("Campo salvo"); onSaved();
  }

  if (!type) return (
    <Modal open onClose={onClose} title="Escolha o tipo de campo" wide>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FIELD_TYPES.map((t) => (
          <button key={t.type} onClick={() => setType(t.type)} className="flex items-center gap-2 rounded-[12px] border border-line p-2.5 text-left text-sm font-semibold hover:border-action hover:bg-lilac/40">
            <span className="flex h-8 w-9 shrink-0 items-center justify-center rounded-md bg-soft text-xs font-bold">{t.icon}</span>{t.label}{t.extra && <Badge color="#7B61FF" className="ml-auto">+</Badge>}
          </button>
        ))}
      </div>
    </Modal>
  );
  const td = typeDef(type);
  const numeric = siblings.filter((x) => NUMERIC_TYPES.includes(x.type) && x.id !== field?.id);
  const dates = siblings.filter((x) => ["date", "datetime", "due_date"].includes(x.type));
  return (
    <Modal open onClose={onClose} wide title={<>{td.icon} {field ? "Editar campo" : "Novo campo"} · {td.label}</>}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar campo</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Nome do campo</label><input autoFocus className="input" value={f.label ?? ""} onChange={(e) => set("label", e.target.value)} /></div>
          <div><label className="label">Texto de ajuda</label><input className="input" value={f.help ?? ""} onChange={(e) => set("help", e.target.value)} placeholder="Dica exibida no campo" /></div>
        </div>
        <div><label className="label">Descrição</label><input className="input" value={f.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Texto explicativo abaixo do rótulo" /></div>

        {/* opções específicas */}
        {["single_select", "multi_select", "checklist"].includes(type) && (
          <div><label className="label">Itens (um por linha — “Adicionar em massa”)</label>
            <textarea className="input" rows={5} value={(o.items ?? []).join("\n")} onChange={(e) => opt("items", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} /></div>
        )}
        {type === "single_select" && <Toggle checked={o.display === "dropdown"} onChange={(v) => opt("display", v ? "dropdown" : "buttons")} label="Exibir como lista suspensa" />}
        {type === "phone" && <Toggle checked={!!o.whatsapp} onChange={(v) => opt("whatsapp", v)} label="WhatsApp link" hint="Mostra botão que abre a conversa (no futuro, abre o Domma Chat)." />}
        {type === "document" && <div><label className="label">Tipo</label><select className="input" value={o.doc_type ?? "cpf_cnpj"} onChange={(e) => opt("doc_type", e.target.value)}><option value="cpf_cnpj">CPF ou CNPJ</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option></select></div>}
        {type === "assignee" && <Toggle checked={o.multiple !== false} onChange={(v) => opt("multiple", v)} label="Permitir vários responsáveis" />}
        {type === "rating" && <div><label className="label">Nota máxima</label><input type="number" min={3} max={10} className="input" value={o.max ?? 5} onChange={(e) => opt("max", Number(e.target.value))} /></div>}
        {type === "static_text" && <div><label className="label">Conteúdo</label>
          <textarea className="input" rows={6} value={o.content ?? ""} onChange={(e) => opt("content", e.target.value)} placeholder="**negrito**, *itálico*, __sublinhado__, - listas, [link](https://...), ![imagem](https://...)" />
          <FieldChips fields={siblings} onPick={(id) => opt("content", (o.content ?? "") + `{{${id}}}`)} hint="Campos dinâmicos: clique para inserir. Ex.: Olá {Nome}, sua proposta {Número}." /></div>}
        {type === "sequence" && <div className="grid grid-cols-4 gap-2">
          <div><label className="label">Prefixo</label><input className="input" value={o.prefix ?? ""} onChange={(e) => opt("prefix", e.target.value)} /></div>
          <div><label className="label">Dígitos</label><input type="number" className="input" value={o.digits ?? 5} onChange={(e) => opt("digits", Number(e.target.value))} /></div>
          <div><label className="label">Sufixo</label><input className="input" value={o.suffix ?? ""} onChange={(e) => opt("suffix", e.target.value)} placeholder="ex.: 2026" /></div>
          <div><label className="label">Começa em</label><input type="number" className="input" value={o.start ?? 1} onChange={(e) => opt("start", Number(e.target.value))} /></div>
          <div className="col-span-4 text-xs text-ink-3">Exemplo: <span className="num font-bold">{(o.prefix ?? "") + String(o.start ?? 1).padStart(o.digits ?? 5, "0") + (o.suffix ?? "")}</span></div>
        </div>}
        {type === "formula" && <div>
          <label className="label">Expressão</label>
          <input className="input num" value={o.expression ?? ""} onChange={(e) => opt("expression", e.target.value)} placeholder="Ex.: ROUND({{campo}} * 0.1, 2)" />
          <FieldChips fields={numeric} onPick={(id) => opt("expression", (o.expression ?? "") + `{{${id}}}`)} hint="Operadores + − × ÷ ( ) e funções SUM, AVG, MIN, MAX, ROUND, IF, ABS. Atualiza em tempo real." />
          <div className="mt-2"><label className="label">Resultado</label><select className="input" value={o.format ?? "number"} onChange={(e) => opt("format", e.target.value)}><option value="number">Número</option><option value="currency">Moeda</option></select></div>
        </div>}
        {type === "date_diff" && <div className="grid grid-cols-2 gap-2">
          <div><label className="label">De</label><select className="input" value={o.from ?? ""} onChange={(e) => opt("from", e.target.value)}><option value="">Selecione…</option>{dates.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <div><label className="label">Até</label><select className="input" value={o.to ?? ""} onChange={(e) => opt("to", e.target.value)}><option value="">Selecione…</option><option value="today">Hoje</option>{dates.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
        </div>}
        {type === "connected_board" && <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Board de destino</label><select className="input" value={o.board_id ?? ""} onChange={(e) => opt("board_id", e.target.value)}><option value="">Selecione…</option>{boards.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div className="pt-6"><Toggle checked={!!o.multiple} onChange={(v) => opt("multiple", v)} label="Múltiplos cards" /></div>
        </div>}
        {type === "connected_database" && <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Database de destino</label><select className="input" value={o.database_id ?? ""} onChange={(e) => opt("database_id", e.target.value)}><option value="">Selecione…</option>{dbs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div><label className="label">Função</label><select className="input" value={o.mode ?? "both"} onChange={(e) => opt("mode", e.target.value)}><option value="both">Criar e buscar registros</option><option value="search">Buscar registros</option><option value="create">Criar registros</option></select></div>
          </div>
          <div className="flex flex-wrap gap-6"><Toggle checked={!!o.multiple} onChange={(v) => opt("multiple", v)} label="Múltiplos registros" /><Toggle checked={!!o.limited} onChange={(v) => opt("limited", v)} label="Visão limitada" hint="Quem conecta não remove depois." /></div>
          {targetFields.length > 0 && <div>
            <span className="label">Autocompletar campos do card com dados do registro</span>
            {(o.autofill ?? []).map((m: { from: string; to: string }, i: number) => (
              <div key={i} className="mb-1.5 grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <select className="input" value={m.from} onChange={(e) => opt("autofill", (o.autofill ?? []).map((x: any, j: number) => (j === i ? { ...x, from: e.target.value } : x)))}><option value="">Campo do registro…</option>{targetFields.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                <span>→</span>
                <select className="input" value={m.to} onChange={(e) => opt("autofill", (o.autofill ?? []).map((x: any, j: number) => (j === i ? { ...x, to: e.target.value } : x)))}><option value="">Campo do card…</option>{siblings.filter((s) => s.id !== field?.id).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                <button onClick={() => opt("autofill", (o.autofill ?? []).filter((_: any, j: number) => j !== i))} className="px-1 text-ink-3">✕</button>
              </div>
            ))}
            <Button size="sm" variant="soft" onClick={() => opt("autofill", [...(o.autofill ?? []), { from: "", to: "" }])}>+ Mapeamento</Button>
          </div>}
        </div>}

        <div className="grid gap-3 rounded-[12px] bg-soft p-3 sm:grid-cols-2">
          {type !== "static_text" && !["formula", "sequence", "date_diff"].includes(type) && <Toggle checked={!!f.required} onChange={(v) => set("required", v)} label="Obrigatório" hint="Impede salvar ou avançar de fase sem preencher." />}
          {type === "sequence" && <Toggle checked={!!f.required} onChange={(v) => set("required", v)} label="Obrigatório" />}
          {(phaseId || field?.phase_id) && <Toggle checked={f.editable !== false} onChange={(v) => set("editable", v)} label="Editável em outras fases" />}
          {td.unique && <Toggle checked={!!f.unique_value} onChange={(v) => set("unique_value", v)} label="Valor exclusivo" hint="Bloqueia valor repetido." />}
          {td.unique && f.unique_value && <Toggle checked={!!f.unique_open_only} onChange={(v) => set("unique_open_only", v)} label="Só para cards em aberto" hint="Libera repetir se o card antigo está na fase final." />}
        </div>
        {(td.integrated || type === "short_text") && <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Integrado (chave do JSON)</label><input className="input num" value={f.integrated_key ?? ""} onChange={(e) => set("integrated_key", e.target.value)} placeholder="ex.: cliente.nome" /></div>
          {["short_text", "long_text", "email", "url", "plate"].includes(type) && <div><label className="label">Formatação personalizada (RegEx)</label><input className="input num" value={f.regex ?? ""} onChange={(e) => set("regex", e.target.value)} placeholder="^[A-Z]{3}\d{4}$" /></div>}
        </div>}
        {field && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-3">
          <span>ID do campo: <button className="num font-bold text-ink-2 hover:text-action" onClick={() => navigator.clipboard.writeText(field.id)} title="Copiar">{field.id}</button></span>
          <button className="font-semibold text-action" onClick={checkUsage}>Ver conexões do campo</button>
          {usage && <div className="w-full rounded-lg bg-soft p-2">{usage.length ? usage.map((u) => <div key={u}>{u}</div>) : "Este campo não é usado em regras nem automações."}</div>}
        </div>}
      </div>
    </Modal>
  );
}

function FieldChips({ fields, onPick, hint }: { fields: Field[]; onPick: (id: string) => void; hint?: string }) {
  return <div className="mt-1.5">
    <div className="flex flex-wrap gap-1">{fields.filter((x) => x.type !== "static_text").map((x) => <button key={x.id} type="button" onClick={() => onPick(x.id)} className="rounded-md bg-lilac px-1.5 py-0.5 text-[11px] font-semibold text-action">{x.label}</button>)}</div>
    {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
  </div>;
}
