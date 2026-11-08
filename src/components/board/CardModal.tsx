"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Attachment, Card, Field } from "@/lib/types";
import { duration, evalRules, fmtDate, formatValue, isEmpty } from "@/lib/fields";
import { AttachmentInput, AttachmentRow, ChipPicker, FieldList } from "../FieldInput";
import { Avatar, Badge, Button, Menu, MenuItem, Modal, Spinner, Tabs, cx, useToast } from "../ui";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";
import { cardCtx, useSaveCard } from "./actions";
import { FieldEditor, QuickFieldButton } from "./FieldBuilder";
import { Icon } from "../Icon";

const toLocal = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export function CardModal({ cardId, onClose, onMove, onConfigurePhase }: { cardId: string; onClose: () => void; onMove: (c: Card, phaseId: string) => void; onConfigurePhase: (phaseId: string) => void }) {
  const b = useBoard(); const { org, members, memberMap } = useApp(); const toast = useToast(); const save = useSaveCard();
  const fromBoard = b.cards.find((c) => c.id === cardId);
  const [loaded, setLoaded] = useState<Card | null>(null);
  const [tab, setTab] = useState<"comments" | "tasks" | "files" | "history">("comments");
  useEffect(() => {
    if (fromBoard) return;
    supabase.from("cards").select("*, card_assignees(user_id), card_tags(tag_id)").eq("id", cardId).maybeSingle().then(({ data }) => setLoaded(data as Card));
  }, [cardId, fromBoard]);
  const card = fromBoard ?? loaded;
  const st = useMemo(() => card ? evalRules(b.rules, card.data, cardCtx(card), card.phase_id) : null, [card, b.rules]);
  if (!card || !st) return <Modal open onClose={onClose} full><div className="flex h-60 items-center justify-center"><Spinner /></div></Modal>;

  const phase = b.phaseMap[card.phase_id];
  const editable = b.canEdit;
  const lockedOutside = new Set(b.fields.filter((f) => !f.editable && f.phase_id && f.phase_id !== card.phase_id).map((f) => f.id));
  const onSave = (id: string, v: any) => save(card, { [id]: v });
  const fctx = { orgId: org.id, members, tags: b.tags, folder: card.id, onAutofill: (patch: Record<string, any>) => save(card, patch) };
  const allowed = b.phases.filter((p) => p.id !== card.phase_id && (!phase?.allowed_moves || phase.allowed_moves.includes(p.id)));
  const assignees = card.card_assignees?.map((a) => a.user_id) ?? [];
  const tags = card.card_tags?.map((t) => t.tag_id) ?? [];
  const now = Date.now();

  async function setAssignees(next: string[]) {
    const add = next.filter((x) => !assignees.includes(x)); const rem = assignees.filter((x) => !next.includes(x));
    b.patchCardLocal(card!.id, { card_assignees: next.map((user_id) => ({ user_id })) });
    if (add.length) { const { error } = await supabase.from("card_assignees").insert(add.map((user_id) => ({ card_id: card!.id, user_id }))); if (error) toast(errMsg(error), "err"); }
    if (rem.length) await supabase.from("card_assignees").delete().eq("card_id", card!.id).in("user_id", rem);
  }
  async function setTags(next: string[]) {
    const add = next.filter((x) => !tags.includes(x)); const rem = tags.filter((x) => !next.includes(x));
    b.patchCardLocal(card!.id, { card_tags: next.map((tag_id) => ({ tag_id })) });
    if (add.length) { const { error } = await supabase.from("card_tags").insert(add.map((tag_id) => ({ card_id: card!.id, tag_id }))); if (error) toast(errMsg(error), "err"); }
    if (rem.length) await supabase.from("card_tags").delete().eq("card_id", card!.id).in("tag_id", rem);
  }
  async function setDue(v: string) {
    const iso = v ? new Date(v).toISOString() : null;
    b.patchCardLocal(card!.id, { due_at: iso });
    const { error } = await supabase.rpc("update_card", { p_card: card!.id, p_patch: {}, p_due: iso, p_set_due: true });
    if (error) toast(errMsg(error), "err");
  }
  async function remove() {
    if (!confirm("Remover este card? Ele pode ser restaurado pelo histórico do board.")) return;
    const { error } = await supabase.rpc("delete_cards", { p_ids: [card!.id] });
    if (error) return toast(errMsg(error), "err");
    toast("Card removido"); b.reload(["cards"]); onClose();
  }
  async function duplicate() {
    const { error } = await supabase.rpc("duplicate_cards", { p_ids: [card!.id] });
    if (error) toast(errMsg(error), "err"); else { toast("Card duplicado"); b.reload(["cards"]); }
  }
  const creator = card.created_by ? memberMap[card.created_by] : null;

  return (
    <Modal open onClose={onClose} full>
      <div className="-mx-6 -my-4">
        {/* topo */}
        <div className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: phase?.color }} />{phase?.name}{card.finished_at && <Badge color="#10B981">finalizado</Badge>}</div>
            <h2 className="mt-1 text-[19px] font-bold">{card.title}</h2>
            <div className="mt-1 text-xs text-ink-3">
              Criado {card.created_via === "automation" ? "via automação" : card.created_via === "webhook" ? "via webhook" : card.created_via === "api" ? "via API" : card.created_via === "import" ? "por importação" : `por ${creator?.full_name || creator?.email || "—"}`} em {fmtDate(card.created_at, true)}
              {!b.board.settings.hide_clocks && <span className="num"> · {duration(now - new Date(card.created_at).getTime())} no board · {duration(now - new Date(card.phase_entered_at).getTime())} na fase</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`${location.origin}/b/${b.board.id}?card=${card.id}`); toast("Link copiado"); }}>🔗</Button>
            <Menu trigger={<Button size="sm" variant="ghost">⋯</Button>}>
              {(close) => <>
                {b.canEdit && <MenuItem onClick={() => { close(); duplicate(); }}>Duplicar card</MenuItem>}
                {b.canEdit && <MenuItem danger onClick={() => { close(); remove(); }}>Remover card</MenuItem>}
              </>}
            </Menu>
            <button onClick={onClose} className="rounded-lg p-2 text-ink-3 hover:bg-soft" aria-label="Fechar">✕</button>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-3">
            <div><span className="label">Responsáveis</span><ChipPicker disabled={!editable} multiple selected={assignees} onChange={setAssignees} options={members.filter((m) => m.role !== "guest").map((m) => ({ id: m.user_id, label: m.profile.full_name || m.profile.email || "", icon: <Avatar size={16} name={m.profile.full_name || m.profile.email} /> }))} /></div>
            <div><span className="label">Etiquetas</span><ChipPicker disabled={!editable} multiple selected={tags} onChange={setTags} options={b.tags.map((t) => ({ id: t.id, label: t.name, color: t.color }))} /></div>
            <div><span className="label">Vencimento</span><input type="datetime-local" disabled={!editable} className={cx("input", card.due_at && new Date(card.due_at).getTime() < now && !card.finished_at && "!border-red-300 !text-red-600")} value={toLocal(card.due_at)} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_240px]">
          {/* visão geral */}
          <section className="border-b border-line p-5 lg:border-b-0 lg:border-r">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-3">Visão geral</h3>
            <FieldList fields={b.initialFields} data={card.data} onSave={onSave} ctx={fctx} state={st} readOnly={!editable} />
          </section>

          {/* fase atual + atividade */}
          <section className="border-b border-line p-5 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: phase?.color }}>{phase?.name}</h3>
              {b.isAdmin && phase && <QuickFieldButton phaseId={phase.id} />}
            </div>
            <FieldList fields={phase ? b.phaseFields(phase.id) : []} data={card.data} onSave={onSave} ctx={fctx} state={st} readOnly={!editable} />
            {b.fields.some((f) => f.phase_id && f.phase_id !== card.phase_id && !isEmpty(card.data[f.id])) && (
              <details className="mt-4 rounded-[12px] bg-soft p-3">
                <summary className="cursor-pointer text-sm font-semibold">Campos de outras fases</summary>
                <div className="mt-3 space-y-4">
                  {b.phases.filter((p) => p.id !== card.phase_id).map((p) => {
                    const fs = b.phaseFields(p.id).filter((f) => !isEmpty(card.data[f.id]));
                    if (!fs.length) return null;
                    return <div key={p.id}><div className="mb-2 text-xs font-bold" style={{ color: p.color }}>{p.name}</div>
                      <FieldList fields={fs} data={card.data} onSave={onSave} ctx={fctx} state={st} readOnly={!editable} lockedIds={lockedOutside} /></div>;
                  })}
                </div>
              </details>
            )}
            <div className="mt-6">
              <Tabs value={tab} onChange={setTab} tabs={[{ id: "comments", label: "Comentários" }, { id: "tasks", label: "Atividades" }, { id: "files", label: "Anexos" }, { id: "history", label: "Histórico" }]} />
              <div className="pt-4">
                {tab === "comments" && <Comments card={card} />}
                {tab === "tasks" && <Tasks card={card} />}
                {tab === "files" && <Files card={card} />}
                {tab === "history" && <History card={card} />}
              </div>
            </div>
          </section>

          {/* mover */}
          <aside className="p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-3">Mover card para</h3>
            <div className="space-y-2">
              {allowed.map((p) => (
                <button key={p.id} disabled={!editable || st.denied.has(p.id)} onClick={() => onMove(card, p.id)}
                  className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
                  style={{ background: p.color }} title={st.denied.has(p.id) ? `Bloqueado pela regra "${st.denied.get(p.id)}"` : undefined}>
                  {p.name}<span>→</span>
                </button>
              ))}
              {allowed.length === 0 && <div className="text-xs text-ink-3">Nenhum movimento permitido a partir desta fase.</div>}
            </div>
            {b.isAdmin && <button onClick={() => onConfigurePhase(card.phase_id)} className="mt-3 text-xs font-semibold text-action">Configurar movimentos</button>}
          </aside>
        </div>
      </div>
    </Modal>
  );
}

function Comments({ card }: { card: Card }) {
  const { session, org, members, memberMap } = useApp(); const toast = useToast(); const b = useBoard();
  const [items, setItems] = useState<any[]>([]); const [body, setBody] = useState(""); const [mentions, setMentions] = useState<string[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]); const [busy, setBusy] = useState(false); const [mq, setMq] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const load = useCallback(() => supabase.from("comments").select("*").eq("card_id", card.id).is("deleted_at", null).order("created_at").then(({ data }) => setItems(data ?? [])), [card.id]);
  useEffect(() => {
    load();
    const ch = supabase.channel("cm-" + card.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `card_id=eq.${card.id}` }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [card.id, load]);
  function onType(v: string) {
    setBody(v);
    const m = v.slice(0, ta.current?.selectionStart ?? v.length).match(/@([\wÀ-ú]*)$/);
    setMq(m ? m[1].toLowerCase() : null);
  }
  function pick(id: string | "all") {
    const name = id === "all" ? "responsáveis" : (memberMap[id]?.full_name || memberMap[id]?.email || "").split(" ")[0];
    setBody((v) => v.replace(/@([\wÀ-ú]*)$/, `@${name} `));
    setMentions((m) => [...new Set([...m, ...(id === "all" ? (card.card_assignees ?? []).map((a) => a.user_id) : [id])])]);
    setMq(null); ta.current?.focus();
  }
  async function send() {
    if (!body.trim() && !files.length) return;
    setBusy(true);
    const { error } = await supabase.from("comments").insert({ org_id: org.id, card_id: card.id, author: session.user.id, body: body.trim(), mentions, attachments: files });
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    setBody(""); setMentions([]); setFiles([]); load();
  }
  const highlight = (t: string) => t.split(/(@[\wÀ-ú]+)/g).map((p, i) => p.startsWith("@") ? <span key={i} className="font-semibold text-action">{p}</span> : p);
  return (
    <div className="space-y-4">
      <div className="relative">
        <textarea ref={ta} className="input" rows={3} placeholder="Escreva um comentário… use @ para mencionar" value={body} onChange={(e) => onType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} />
        {mq !== null && <div className="absolute z-20 mt-1 w-64 rounded-[12px] border border-line bg-white p-1 shadow-pop">
          <button className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-soft" onMouseDown={(e) => { e.preventDefault(); pick("all"); }}>@ Todos os responsáveis</button>
          {members.filter((m) => (m.profile.full_name || m.profile.email || "").toLowerCase().includes(mq)).slice(0, 6).map((m) => (
            <button key={m.user_id} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-soft" onMouseDown={(e) => { e.preventDefault(); pick(m.user_id); }}><Avatar size={18} name={m.profile.full_name || m.profile.email} />{m.profile.full_name || m.profile.email}</button>
          ))}
        </div>}
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1"><AttachmentInput value={files} onSave={setFiles} folder={`${org.id}/${card.id}`} /></div>
          <Button variant="primary" loading={busy} onClick={send}>Comentar</Button>
        </div>
      </div>
      {[...items].reverse().map((c) => (
        <div key={c.id} className="flex gap-2.5">
          <Avatar name={memberMap[c.author]?.full_name || memberMap[c.author]?.email} size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-xs"><b>{memberMap[c.author]?.full_name || "Usuário"}</b> <span className="text-ink-3">{fmtDate(c.created_at, true)}</span></div>
            <div className="mt-0.5 whitespace-pre-wrap text-sm">{highlight(c.body)}</div>
            {c.attachments?.length > 0 && <div className="mt-2 space-y-1">{c.attachments.map((a: Attachment) => <AttachmentRow key={a.path} a={a} />)}</div>}
          </div>
        </div>
      ))}
      {items.length === 0 && <div className="text-center text-sm text-ink-3">Nenhum comentário ainda.</div>}
      <span className="hidden">{b.board.id}</span>
    </div>
  );
}

function Tasks({ card }: { card: Card }) {
  const { org, members, memberMap, session } = useApp(); const toast = useToast(); const b = useBoard();
  const [items, setItems] = useState<any[]>([]); const [title, setTitle] = useState(""); const [assignee, setAssignee] = useState(session.user.id); const [due, setDue] = useState("");
  const load = useCallback(() => supabase.from("tasks").select("*").eq("card_id", card.id).order("created_at").then(({ data }) => setItems(data ?? [])), [card.id]);
  useEffect(() => { load(); }, [load]);
  async function add() {
    if (!title.trim()) return;
    const { error } = await supabase.from("tasks").insert({ org_id: org.id, card_id: card.id, title: title.trim(), assignee: assignee || null, due_at: due ? new Date(due).toISOString() : null, created_by: session.user.id });
    if (error) return toast(errMsg(error), "err");
    setTitle(""); setDue(""); load();
  }
  async function toggle(t: any) {
    const { error } = await supabase.from("tasks").update({ done_at: t.done_at ? null : new Date().toISOString() }).eq("id", t.id);
    if (error) toast(errMsg(error), "err"); load(); if (!t.done_at) setTimeout(() => b.reload(["cards"]), 400);
  }
  return (
    <div className="space-y-3">
      {b.canEdit && <div className="grid gap-2 sm:grid-cols-[1fr_150px_170px_auto]">
        <input className="input" placeholder="Nova atividade (ex.: Ligar para o lead)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Sem responsável</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.profile.full_name || m.profile.email}</option>)}</select>
        <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        <Button variant="primary" onClick={add}>Adicionar</Button>
      </div>}
      {items.map((t) => {
        const late = t.due_at && !t.done_at && new Date(t.due_at).getTime() < Date.now();
        return (
          <label key={t.id} className="flex items-center gap-3 rounded-[12px] border border-line px-3 py-2">
            <input type="checkbox" checked={!!t.done_at} onChange={() => toggle(t)} />
            <span className={cx("flex-1 text-sm", t.done_at && "text-ink-3 line-through")}>{t.title}</span>
            {t.assignee && <Avatar size={20} name={memberMap[t.assignee]?.full_name || memberMap[t.assignee]?.email} />}
            {t.due_at && <span className={cx("num text-xs", late ? "font-bold text-red-600" : "text-ink-3")}>{fmtDate(t.due_at, true)}</span>}
          </label>
        );
      })}
      {items.length === 0 && <div className="text-center text-sm text-ink-3">Sem atividades. Concluir uma atividade pode disparar automações.</div>}
    </div>
  );
}

function Files({ card }: { card: Card }) {
  const b = useBoard(); const save = useSaveCard(); const { org } = useApp();
  const [comments, setComments] = useState<Attachment[]>([]);
  useEffect(() => { supabase.from("comments").select("attachments").eq("card_id", card.id).then(({ data }) => setComments((data ?? []).flatMap((c) => c.attachments ?? []))); }, [card.id]);
  const fieldFiles = b.fields.filter((f) => f.type === "attachment").flatMap((f) => ((card.data[f.id] ?? []) as Attachment[]).map((a) => ({ a, f })));
  const general = b.fields.find((f) => f.type === "attachment" && !f.phase_id);
  return (
    <div className="space-y-4">
      {general && <div><span className="label">Enviar para “{general.label}”</span><AttachmentInput value={card.data[general.id] ?? []} onSave={(v) => save(card, { [general.id]: v })} folder={`${org.id}/${card.id}`} disabled={!b.canEdit} /></div>}
      <div className="space-y-1.5">
        {fieldFiles.map(({ a, f }) => <div key={a.path}><div className="text-[11px] font-semibold text-ink-3">{f.label}</div><AttachmentRow a={a} /></div>)}
        {comments.map((a) => <div key={a.path}><div className="text-[11px] font-semibold text-ink-3">Comentário</div><AttachmentRow a={a} /></div>)}
      </div>
      {fieldFiles.length + comments.length === 0 && <div className="text-center text-sm text-ink-3">Nenhum anexo neste card.</div>}
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: "criou o card", moved: "moveu o card", fields: "alterou campos", due: "alterou o vencimento", assignee_added: "adicionou responsável",
  assignee_removed: "removeu responsável", tag_added: "adicionou etiqueta", tag_removed: "removeu etiqueta", comment: "comentou",
  task_created: "criou atividade", task_done: "concluiu atividade", deleted: "removeu o card", restored: "restaurou o card",
};
function History({ card }: { card: Card }) {
  const b = useBoard(); const { memberMap } = useApp();
  const [phases, setPhases] = useState<any[]>([]); const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("card_phase_history").select("*").eq("card_id", card.id).order("entered_at").then(({ data }) => setPhases(data ?? []));
    supabase.from("card_events").select("*").eq("card_id", card.id).order("created_at", { ascending: false }).limit(200).then(({ data }) => setEvents(data ?? []));
  }, [card.id, card.updated_at]);
  const name = (id?: string | null) => (id ? memberMap[id]?.full_name || memberMap[id]?.email || "Usuário" : "Sistema");
  const fieldLabel = (id: string) => b.fieldMap[id]?.label ?? "campo";
  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase text-ink-3">Fases percorridas</h4>
        <ol className="space-y-1.5">
          {phases.map((h) => {
            const p = b.phaseMap[h.phase_id]; const fs = p ? b.phaseFields(p.id).filter((f) => !isEmpty((h.data_snapshot ?? card.data)?.[f.id])) : [];
            return (
              <li key={h.id}>
                <details className="rounded-[10px] border border-line px-3 py-2">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full" style={{ background: p?.color ?? "#999" }} /><b>{p?.name ?? "Fase excluída"}</b>
                    <span className="num ml-auto text-xs text-ink-3">{fmtDate(h.entered_at, true)} · {duration((h.left_at ? new Date(h.left_at).getTime() : Date.now()) - new Date(h.entered_at).getTime())}</span></summary>
                  <div className="mt-2 space-y-1 text-xs">{fs.length ? fs.map((f) => <div key={f.id}><span className="text-ink-3">{f.label}:</span> {formatValue(f, (h.data_snapshot ?? card.data)[f.id], b.fmt)}</div>) : <span className="text-ink-3">Sem formulário preenchido.</span>}</div>
                </details>
              </li>
            );
          })}
        </ol>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-bold uppercase text-ink-3">Alterações</h4>
        <ol className="relative space-y-3 border-l border-line pl-4">
          {events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="absolute -left-1 mt-1.5 h-2 w-2 rounded-full bg-brand" />
              <b>{name(e.actor)}</b> {EVENT_LABEL[e.type] ?? e.type}
              {e.type === "moved" && <> de <b>{e.data.from_name}</b> para <b>{e.data.to_name}</b></>}
              {(e.type === "tag_added" || e.type === "tag_removed") && <> <b>{e.data.name}</b></>}
              {(e.type === "assignee_added" || e.type === "assignee_removed") && <> <b>{name(e.data.user_id)}</b></>}
              {(e.type === "task_created" || e.type === "task_done") && <> “{e.data.title}”</>}
              {e.type === "created" && e.data.via !== "manual" && <> via {e.data.via}</>}
              {e.type === "fields" && <div className="mt-1 space-y-0.5 text-xs text-ink-2">{(e.data.fields as string[]).slice(0, 8).map((fid) => {
                const f = b.fieldMap[fid];
                return <div key={fid}>{fieldLabel(fid)}: <span className="text-ink-3 line-through">{f ? formatValue(f, e.data.old?.[fid], b.fmt) || "vazio" : ""}</span> → <b>{f ? formatValue(f, e.data.new?.[fid], b.fmt) || "vazio" : ""}</b></div>;
              })}</div>}
              <div className="num text-[11px] text-ink-3">{fmtDate(e.created_at, true)}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function NewCardModal({ open, onClose, onCreated, phaseId }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; phaseId?: string | null }) {
  const b = useBoard(); const { org, members } = useApp(); const toast = useToast();
  const [data, setData] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setData({}); }, [open]);
  const st = evalRules(b.rules, data, {}, null);
  const fields: Field[] = b.initialFields;
  async function create() {
    const missing = fields.filter((f) => (f.required || st.required.has(f.id)) && !f.hidden && !st.hidden.has(f.id) && !["static_text", "sequence", "formula", "date_diff"].includes(f.type) && isEmpty(data[f.id]));
    if (missing.length) return toast(`Preencha: ${missing.map((f) => f.label).join(", ")}`, "err");
    setBusy(true);
    const { computedPatch } = await import("@/lib/fields");
    const full = { ...data, ...computedPatch(b.fields, data) };
    const { data: id, error } = await supabase.rpc("create_card", { p_board: b.board.id, p_data: full, p_phase: phaseId ?? null });
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    const due = fields.find((f) => f.type === "due_date" && data[f.id]);
    if (due) await supabase.rpc("update_card", { p_card: id, p_patch: {}, p_due: data[due.id], p_set_due: true });
    b.reload(["cards"]); onClose(); onCreated(id as string);
  }
  const [editing, setEditing] = useState<Field | "new" | null>(null);
  const [showOff, setShowOff] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !editing && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, onClose, editing]);
  if (!open) return null;
  const active = fields.filter((f) => !f.hidden);
  const off = fields.filter((f) => f.hidden);

  async function moveUp(f: Field, i: number) {
    const prev = active[i - 1]; if (!prev) return;
    await Promise.all([supabase.from("fields").update({ position: prev.position }).eq("id", f.id), supabase.from("fields").update({ position: f.position }).eq("id", prev.id)]);
    if (prev.position === f.position) await supabase.from("fields").update({ position: f.position - 1 }).eq("id", f.id);
    b.reload(["fields"]);
  }
  async function setHidden(f: Field, hidden: boolean) {
    const { error } = await supabase.from("fields").update({ hidden }).eq("id", f.id);
    if (error) toast(errMsg(error), "err"); else toast(hidden ? `"${f.label}" desativado` : `"${f.label}" reativado`);
    b.reload(["fields"]);
  }
  async function remove(f: Field) {
    if (!confirm(`Remover o campo "${f.label}"? Ele pode ser restaurado no histórico do board.`)) return;
    await supabase.from("fields").update({ deleted_at: new Date().toISOString() }).eq("id", f.id); b.reload(["fields"]);
  }
  const fieldMenu = b.isAdmin ? (f: Field, i: number) => (
    <Menu trigger={<button type="button" className="-mt-1 flex h-6 w-6 items-center justify-center rounded-md text-ink-3 hover:bg-line-2 hover:text-ink" aria-label={`Opções do campo ${f.label}`}><Icon name="more" size={15} className="rotate-90" /></button>}>
      {(close) => <>
        {i > 0 && <MenuItem onClick={() => { close(); moveUp(f, i); }}><Icon name="arrow" size={14} className="-rotate-90 text-ink-3" />Mover para cima</MenuItem>}
        <MenuItem onClick={() => { close(); setEditing(f); }}><Icon name="settings" size={14} className="text-ink-3" />Editar</MenuItem>
        <MenuItem onClick={() => { close(); setEditing(f); }}><Icon name="link" size={14} className="text-ink-3" />Ver conexões do campo</MenuItem>
        <MenuItem onClick={() => { close(); setHidden(f, true); }}><Icon name="x" size={14} className="text-ink-3" />Desativar</MenuItem>
        <MenuItem danger onClick={() => { close(); remove(f); }}><Icon name="x" size={14} />Remover</MenuItem>
      </>}
    </Menu>
  ) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#15102B]/25 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && !editing && onClose()}>
      <div className="flex h-full w-full max-w-[420px] flex-col bg-white shadow-pop">
        <div className="flex items-center justify-end gap-2 px-4 pt-3">
          <button onClick={() => toast("Formulário público entra na Fase 2 (link para pessoas de fora criarem cards).")} className="inline-flex items-center gap-1.5 rounded-[8px] bg-lilac px-2.5 py-1 text-xs font-semibold text-action hover:bg-[#E6E0FF]"><Icon name="link" size={13} />Compartilhar formulário</button>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-line-2 hover:text-ink" aria-label="Fechar"><Icon name="x" size={17} /></button>
        </div>
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-3">
          <span className="text-xl">{b.board.icon}</span>
          <h2 className="truncate text-[19px] font-semibold">{b.board.name}</h2>
          {phaseId && <Badge color={b.phaseMap[phaseId]?.color}>{b.phaseMap[phaseId]?.name}</Badge>}
        </div>
        <div className="form-filled flex-1 overflow-y-auto px-5 pb-4 scroll-thin">
          <FieldList fields={active} data={data} onSave={(id, v) => setData((d) => ({ ...d, [id]: v }))} state={st} fieldMenu={fieldMenu}
            emptyText={b.isAdmin ? "O formulário inicial está vazio. Adicione campos em “Novo campo”." : "Este formulário ainda não tem campos."}
            ctx={{ orgId: org.id, members, tags: b.tags, folder: "new", onAutofill: (p) => setData((d) => ({ ...d, ...p })) }} />
          {b.isAdmin && <>
            <button onClick={() => setEditing("new")} className="mt-5 flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-line text-[13px] font-semibold text-ink-2 hover:bg-soft hover:text-ink"><Icon name="plus" size={15} />Novo campo</button>
            {off.length > 0 && <div className="mt-4">
              <button onClick={() => setShowOff((s) => !s)} className="text-xs font-semibold text-ink-3 hover:text-ink">{showOff ? "Esconder" : "Ver"} campos desativados ({off.length})</button>
              {showOff && <div className="mt-2 space-y-1">{off.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-[8px] bg-soft px-3 py-2 text-[13px]"><span className="text-ink-2">{f.label}</span><button onClick={() => setHidden(f, false)} className="text-xs font-semibold text-action">Reativar</button></div>
              ))}</div>}
            </div>}
          </>}
        </div>
        <div className="border-t border-line-2 px-5 py-4">
          <button onClick={create} disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-action text-[15px] font-semibold text-white hover:bg-action-dark disabled:opacity-60">{busy && <Spinner small />}Novo Card</button>
        </div>
      </div>
      {editing && <FieldEditor field={editing === "new" ? null : editing} scope={{ org_id: b.board.org_id, board_id: b.board.id }} phaseId={null} siblings={b.fields}
        nextPosition={(fields.at(-1)?.position ?? -1) + 1} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); b.reload(["fields"]); }} />}
    </div>
  );
}
