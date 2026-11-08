"use client";
import { useEffect, useRef, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Attachment, DbRecord, Field, Member, Tag } from "@/lib/types";
import { brl, fmtDate, formatValue, interpolate, isEmpty, maskDocument, maskPhone, onlyDigits, validateField } from "@/lib/fields";
import { Avatar, Badge, Button, Spinner, cx, useToast } from "./ui";

export interface FieldCtx {
  orgId: string; members: Member[]; tags?: Tag[]; folder?: string;
  data?: Record<string, any>; fields?: Field[]; onAutofill?: (patch: Record<string, any>) => void;
  linkTitles?: Record<string, string>;
}

const toLocalInput = (iso?: string) => { if (!iso) return ""; const d = new Date(iso); if (isNaN(d.getTime())) return ""; const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Campo editável. `onSave` é chamado ao confirmar (blur/enter para textos, na hora para seleções). */
export function FieldInput({ field: f, value, onSave, disabled, ctx, autoFocus }:
  { field: Field; value: any; onSave: (v: any) => void; disabled?: boolean; ctx: FieldCtx; autoFocus?: boolean }) {
  const [draft, setDraft] = useState<any>(value ?? "");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(value ?? ""); }, [value]);
  const commit = (v: any) => {
    const e = validateField(f, v); setErr(e);
    if (e) return;
    const same = JSON.stringify(v ?? "") === JSON.stringify(value ?? "");
    if (!same) onSave(v === "" ? null : v);
  };
  const common = { disabled, autoFocus, className: "input", placeholder: f.help ?? "" };
  const errEl = err && <span className="mt-1 block text-xs font-semibold text-red-600">{err}</span>;

  switch (f.type) {
    case "static_text":
      return <div className="rich rounded-[10px] bg-soft p-3 text-sm" dangerouslySetInnerHTML={{ __html: renderRich(interpolate(f.options?.content ?? "", ctx.data ?? {}, ctx.fields ?? [], { members: Object.fromEntries(ctx.members.map((m) => [m.user_id, m.profile])) })) }} />;
    case "long_text":
      return <>
        <textarea {...common} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} />
        {typeof draft === "string" && draft.match(/https?:\/\/\S+\.(png|jpe?g|gif|webp)/gi)?.map((u) => <img key={u} src={u} alt="" className="mt-2 max-h-48 rounded-lg" />)}
        {errEl}
      </>;
    case "number": case "currency": case "rating": {
      if (f.type === "rating") {
        const max = Number(f.options?.max ?? 5);
        return <div className="flex gap-1">{Array.from({ length: max }, (_, i) => (
          <button key={i} type="button" disabled={disabled} onClick={() => onSave(value === i + 1 ? null : i + 1)} className={cx("text-2xl", (value ?? 0) > i ? "text-amber-400" : "text-line")}>★</button>
        ))}</div>;
      }
      return <div className="relative">
        {f.type === "currency" && <span className="pointer-events-none absolute left-3 top-2 text-sm text-ink-3">R$</span>}
        <input {...common} className={cx("input num", f.type === "currency" && "!pl-9")} inputMode="decimal" value={draft}
          onChange={(e) => setDraft(e.target.value)} onBlur={() => { const s = String(draft).replace(/\./g, "").replace(",", "."); commit(s === "" ? null : isNaN(Number(s)) ? draft : Number(s)); }}
          onFocus={() => typeof draft === "number" && setDraft(String(draft).replace(".", ","))} />
        {typeof value === "number" && f.type === "currency" && <span className="mt-1 block text-xs text-ink-3">{brl(value)}</span>}
        {errEl}
      </div>;
    }
    case "formula": case "date_diff": case "sequence":
      return <div className="input num !bg-soft">{isEmpty(value) ? <span className="text-ink-3">{f.type === "sequence" ? "gerado ao criar" : "calculado automaticamente"}</span> : formatValue(f, value)}</div>;
    case "date":
      return <input {...common} type="date" value={draft || ""} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }} />;
    case "datetime": case "due_date":
      return <input {...common} type="datetime-local" value={toLocalInput(draft)} onChange={(e) => { const v = e.target.value ? new Date(e.target.value).toISOString() : null; setDraft(v ?? ""); commit(v); }} />;
    case "time":
      return <input {...common} type="time" value={draft || ""} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }} />;
    case "single_select": {
      const items: string[] = f.options?.items ?? [];
      return items.length <= 6 && f.options?.display !== "dropdown" ? (
        <div className="space-y-1.5">{items.map((it) => (
          <button key={it} type="button" disabled={disabled} onClick={() => onSave(value === it ? null : it)} className="flex items-center gap-2.5 text-[13px] text-ink-2 hover:text-ink disabled:opacity-60">
            <span className={cx("flex h-[18px] w-[18px] items-center justify-center rounded-full transition", value === it ? "bg-action" : "bg-[#EBEAF0]")}>{value === it && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>{it}
          </button>
        ))}</div>
      ) : (
        <select {...common} value={value ?? ""} onChange={(e) => onSave(e.target.value || null)}>
          <option value="">Selecione…</option>{items.map((it) => <option key={it}>{it}</option>)}
        </select>
      );
    }
    case "multi_select": case "checklist": {
      const items: string[] = f.options?.items ?? []; const cur: string[] = Array.isArray(value) ? value : [];
      const toggle = (it: string) => onSave(cur.includes(it) ? cur.filter((x) => x !== it) : [...cur, it]);
      return <div className={cx(f.type === "checklist" ? "space-y-1" : "flex flex-wrap gap-1.5")}>{items.map((it) => f.type === "checklist" ? (
        <label key={it} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={cur.includes(it)} onChange={() => toggle(it)} />{it}</label>
      ) : (
        <button key={it} type="button" disabled={disabled} onClick={() => toggle(it)} className={cx("rounded-[10px] border px-3 py-1.5 text-sm font-medium", cur.includes(it) ? "border-action bg-lilac text-action" : "border-line hover:bg-soft")}>{cur.includes(it) && "✓ "}{it}</button>
      ))}{f.type === "checklist" && items.length > 0 && <div className="text-xs text-ink-3">{cur.length}/{items.length} concluídos</div>}</div>;
    }
    case "assignee": {
      const cur: string[] = Array.isArray(value) ? value : [];
      return <ChipPicker disabled={disabled} selected={cur} onChange={onSave} multiple={f.options?.multiple !== false}
        options={ctx.members.filter((m) => m.role !== "guest").map((m) => ({ id: m.user_id, label: m.profile.full_name || m.profile.email || "", icon: <Avatar name={m.profile.full_name || m.profile.email} size={18} /> }))} />;
    }
    case "tag": {
      const cur: string[] = Array.isArray(value) ? value : [];
      return <ChipPicker disabled={disabled} selected={cur} onChange={onSave} multiple options={(ctx.tags ?? []).map((t) => ({ id: t.id, label: t.name, color: t.color }))} />;
    }
    case "attachment":
      return <AttachmentInput value={Array.isArray(value) ? value : []} onSave={onSave} disabled={disabled} folder={`${ctx.orgId}/${ctx.folder ?? "tmp"}`} />;
    case "connected_database":
      return <ConnectedDatabase f={f} value={Array.isArray(value) ? value : []} onSave={onSave} disabled={disabled} ctx={ctx} />;
    case "connected_board":
      return <ConnectedBoard f={f} value={Array.isArray(value) ? value : []} onSave={onSave} disabled={disabled} ctx={ctx} />;
    case "cep":
      return <CepInput value={value ?? {}} onSave={onSave} disabled={disabled} />;
    case "phone":
      return <div className="flex gap-2">
        <input {...common} inputMode="tel" value={typeof draft === "string" ? maskPhone(draft) : draft} onChange={(e) => setDraft(onlyDigits(e.target.value))} onBlur={() => commit(onlyDigits(String(draft)) || null)} />
        {f.options?.whatsapp && value && <a href={`https://wa.me/55${onlyDigits(value)}`} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-[10px] bg-emerald-500 px-3 text-sm font-bold text-white" title="Abrir conversa">WhatsApp</a>}
      </div>;
    case "document":
      return <><input {...common} inputMode="numeric" value={maskDocument(String(draft ?? ""))} onChange={(e) => setDraft(onlyDigits(e.target.value))} onBlur={() => commit(onlyDigits(String(draft)) || null)} />{errEl}</>;
    case "plate":
      return <><input {...common} className="input num uppercase" maxLength={8} value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} onBlur={() => commit(String(draft).replace("-", "").toUpperCase() || null)} />{errEl}</>;
    case "url":
      return <div className="flex gap-2"><input {...common} type="url" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(draft)} />{value && <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center px-2 text-action">↗</a>}</div>;
    case "email":
      return <><input {...common} type="email" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(String(draft).trim())} />{errEl}</>;
    default:
      return <><input {...common} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit(typeof draft === "string" ? draft.trim() : draft)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />{errEl}</>;
  }
}

/** Texto rico simples: **negrito**, *itálico*, __sublinhado__, listas com "- ", links e imagens. */
export function renderRich(s: string) {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(s).split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const inline = (l: string) => l
      .replace(/!\[([^\]]*)\]\((https?:[^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;border-radius:8px"/>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/__([^_]+)__/g, "<u>$1</u>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
    if (lines.every((l) => l.startsWith("- "))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(inline).join("<br/>")}</p>`;
  }).join("");
}

export function ChipPicker({ options, selected, onChange, multiple, disabled, placeholder = "Selecionar…" }:
  { options: { id: string; label: string; color?: string; icon?: React.ReactNode }[]; selected: string[]; onChange: (v: string[]) => void; multiple?: boolean; disabled?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  const sel = options.filter((o) => selected.includes(o.id));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : multiple ? [...selected, id] : [id]);
  return (
    <div className="relative" ref={ref}>
      <div className={cx("flex min-h-[38px] flex-wrap items-center gap-1 rounded-[10px] border border-line px-2 py-1", !disabled && "cursor-pointer hover:border-action/50")} onClick={() => !disabled && setOpen(true)}>
        {sel.length === 0 && <span className="px-1 text-sm text-ink-3">{placeholder}</span>}
        {sel.map((o) => <span key={o.id} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ background: (o.color ?? "#5B3FE6") + "1F", color: o.color ?? "#5B3FE6" }}>{o.icon}{o.label}
          {!disabled && <button type="button" onClick={(e) => { e.stopPropagation(); toggle(o.id); }} className="ml-0.5 opacity-60 hover:opacity-100">×</button>}</span>)}
      </div>
      {open && <div className="absolute z-30 mt-1 w-full min-w-56 rounded-[12px] border border-line bg-white p-1 shadow-pop">
        <input autoFocus className="input mb-1 !py-1.5" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-56 overflow-y-auto scroll-thin">
          {options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())).map((o) => (
            <button type="button" key={o.id} onClick={() => { toggle(o.id); if (!multiple) setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-soft">
              <span className="w-4">{selected.includes(o.id) ? "✓" : ""}</span>{o.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />}{o.icon}{o.label}
            </button>
          ))}
          {options.length === 0 && <div className="p-2 text-xs text-ink-3">Nenhuma opção.</div>}
        </div>
      </div>}
    </div>
  );
}

export function AttachmentInput({ value, onSave, disabled, folder }: { value: Attachment[]; onSave: (v: Attachment[]) => void; disabled?: boolean; folder: string }) {
  const [busy, setBusy] = useState(false); const toast = useToast();
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); const out = [...value];
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) { toast(`${file.name}: limite de 25 MB`, "err"); continue; }
      const path = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) toast(errMsg(error), "err"); else out.push({ path, name: file.name, size: file.size, mime: file.type });
    }
    setBusy(false); onSave(out);
  }
  return (
    <div className="space-y-1.5">
      {value.map((a) => <AttachmentRow key={a.path} a={a} onRemove={disabled ? undefined : () => onSave(value.filter((x) => x.path !== a.path))} />)}
      {!disabled && <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-line px-3 py-2 text-sm text-ink-3 hover:bg-soft">
        {busy ? <Spinner small /> : "📎"} Anexar arquivos<input type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      </label>}
    </div>
  );
}
export async function openAttachment(path: string) {
  const { data } = await supabase.storage.from("attachments").createSignedUrl(path, 300);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank");
}
export function AttachmentRow({ a, onRemove }: { a: Attachment; onRemove?: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => { if (a.mime?.startsWith("image/")) supabase.storage.from("attachments").createSignedUrl(a.path, 600).then(({ data }) => setThumb(data?.signedUrl ?? null)); }, [a]);
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-line px-2 py-1.5 text-sm">
      {thumb ? <img src={thumb} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded bg-soft text-xs font-bold text-ink-3">{(a.name.split(".").pop() || "").toUpperCase().slice(0, 4)}</span>}
      <button type="button" onClick={() => openAttachment(a.path)} className="min-w-0 flex-1 truncate text-left font-medium hover:text-action">{a.name}</button>
      {a.size ? <span className="num text-xs text-ink-3">{(a.size / 1024 / 1024).toFixed(1)} MB</span> : null}
      {onRemove && <button type="button" onClick={onRemove} className="px-1 text-ink-3 hover:text-red-600">×</button>}
    </div>
  );
}

function CepInput({ value, onSave, disabled }: { value: Record<string, string>; onSave: (v: any) => void; disabled?: boolean }) {
  const [v, setV] = useState<Record<string, string>>(value || {}); const [busy, setBusy] = useState(false);
  useEffect(() => setV(value || {}), [value]);
  async function lookup(cep: string) {
    const d = onlyDigits(cep); if (d.length !== 8) return;
    setBusy(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then((x) => x.json());
      if (!r.erro) { const nv = { ...v, cep: d, logradouro: r.logradouro, bairro: r.bairro, cidade: r.localidade, uf: r.uf }; setV(nv); onSave(nv); }
    } catch { /* offline */ } finally { setBusy(false); }
  }
  const upd = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const blur = () => JSON.stringify(v) !== JSON.stringify(value || {}) && onSave(v);
  return (
    <div className="grid grid-cols-6 gap-2">
      <div className="col-span-2 relative"><input disabled={disabled} className="input num" placeholder="CEP" value={v.cep ?? ""} onChange={(e) => upd("cep", e.target.value)} onBlur={(e) => { lookup(e.target.value); blur(); }} />{busy && <span className="absolute right-2 top-2.5"><Spinner small /></span>}</div>
      <input disabled={disabled} className="input col-span-4" placeholder="Logradouro" value={v.logradouro ?? ""} onChange={(e) => upd("logradouro", e.target.value)} onBlur={blur} />
      <input disabled={disabled} className="input col-span-2" placeholder="Número" value={v.numero ?? ""} onChange={(e) => upd("numero", e.target.value)} onBlur={blur} />
      <input disabled={disabled} className="input col-span-4" placeholder="Bairro" value={v.bairro ?? ""} onChange={(e) => upd("bairro", e.target.value)} onBlur={blur} />
      <input disabled={disabled} className="input col-span-4" placeholder="Cidade" value={v.cidade ?? ""} onChange={(e) => upd("cidade", e.target.value)} onBlur={blur} />
      <input disabled={disabled} className="input col-span-2 uppercase" placeholder="UF" maxLength={2} value={v.uf ?? ""} onChange={(e) => upd("uf", e.target.value.toUpperCase())} onBlur={blur} />
    </div>
  );
}

function ConnectedDatabase({ f, value, onSave, disabled, ctx }: { f: Field; value: string[]; onSave: (v: string[]) => void; disabled?: boolean; ctx: FieldCtx }) {
  const dbId = f.options?.database_id as string | undefined; const mode = f.options?.mode ?? "both"; const multiple = !!f.options?.multiple;
  const [titles, setTitles] = useState<Record<string, string>>({}); const [q, setQ] = useState(""); const [res, setRes] = useState<DbRecord[]>([]);
  const [open, setOpen] = useState(false); const [creating, setCreating] = useState(false); const toast = useToast();
  useEffect(() => { if (value.length) supabase.from("records").select("id,title").in("id", value).then(({ data }) => setTitles(Object.fromEntries((data ?? []).map((r) => [r.id, r.title])))); }, [value]);
  useEffect(() => {
    if (!open || !dbId) return;
    const t = setTimeout(() => supabase.rpc("search_records", { p_db: dbId, p_q: q, p_limit: 15 }).then(({ data }) => setRes((data ?? []) as DbRecord[])), 200);
    return () => clearTimeout(t);
  }, [q, open, dbId]);
  async function link(r: DbRecord) {
    const next = multiple ? [...new Set([...value, r.id])] : [r.id];
    setTitles((t) => ({ ...t, [r.id]: r.title })); onSave(next); setOpen(false); setQ("");
    const map: { from: string; to: string }[] = f.options?.autofill ?? [];
    if (map.length && ctx.onAutofill) {
      const patch: Record<string, any> = {};
      for (const m of map) if (m.from && m.to && r.data?.[m.from] !== undefined && isEmpty(ctx.data?.[m.to])) patch[m.to] = r.data[m.from];
      if (Object.keys(patch).length) ctx.onAutofill(patch);
    }
  }
  if (!dbId) return <div className="text-xs text-red-600">Configure a database de destino deste campo.</div>;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">{value.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-md bg-lilac px-2 py-1 text-xs font-semibold text-action">
          <a href={`/databases/${dbId}?record=${id}`} className="hover:underline">🗂 {titles[id] ?? "…"}</a>
          {!disabled && !f.options?.limited && <button type="button" onClick={() => onSave(value.filter((x) => x !== id))}>×</button>}
        </span>
      ))}</div>
      {!disabled && (multiple || value.length === 0) && (
        <div className="relative">
          {mode !== "create" && <input className="input" placeholder="Buscar registro por qualquer campo…" value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 200)} />}
          {open && mode !== "create" && <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-[12px] border border-line bg-white p-1 shadow-pop">
            {res.map((r) => <button type="button" key={r.id} onMouseDown={() => link(r)} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-soft">{r.title}</button>)}
            {res.length === 0 && <div className="p-2 text-xs text-ink-3">Nenhum registro encontrado.</div>}
          </div>}
          {mode !== "search" && <Button size="sm" variant="ghost" className="mt-1" onClick={() => setCreating(true)}>+ Criar registro</Button>}
        </div>
      )}
      {creating && <QuickRecordForm dbId={dbId} orgId={ctx.orgId} members={ctx.members} initial={q} onClose={() => setCreating(false)} onCreated={(r) => { setCreating(false); link(r); toast("Registro criado"); }} />}
    </div>
  );
}

function QuickRecordForm({ dbId, orgId, members, onClose, onCreated, initial }: { dbId: string; orgId: string; members: Member[]; onClose: () => void; onCreated: (r: DbRecord) => void; initial?: string }) {
  const [fields, setFields] = useState<Field[]>([]); const [data, setData] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(false); const toast = useToast();
  useEffect(() => {
    supabase.from("fields").select("*").eq("database_id", dbId).is("deleted_at", null).eq("hidden", false).order("position").then(({ data: fs }) => {
      setFields((fs ?? []) as Field[]);
      const first = (fs ?? []).find((x: any) => x.type === "short_text");
      if (first && initial) setData({ [first.id]: initial });
    });
  }, [dbId, initial]);
  async function save() {
    setBusy(true);
    const { data: r, error } = await supabase.from("records").insert({ org_id: orgId, database_id: dbId, data }).select().single();
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    onCreated(r as DbRecord);
  }
  return (
    <div className="space-y-3 rounded-[12px] border border-action/30 bg-lilac/30 p-3">
      {fields.filter((x) => x.type !== "static_text").map((x) => <div key={x.id}><span className="label">{x.label}{x.required && " *"}</span><FieldInput field={x} value={data[x.id]} onSave={(v) => setData((d) => ({ ...d, [x.id]: v }))} ctx={{ orgId, members, folder: "records" }} /></div>)}
      <div className="flex justify-end gap-2"><Button size="sm" onClick={onClose}>Cancelar</Button><Button size="sm" variant="primary" loading={busy} onClick={save}>Salvar registro</Button></div>
    </div>
  );
}

function ConnectedBoard({ f, value, onSave, disabled }: { f: Field; value: string[]; onSave: (v: string[]) => void; disabled?: boolean; ctx: FieldCtx }) {
  const bId = f.options?.board_id as string | undefined; const multiple = !!f.options?.multiple;
  const [titles, setTitles] = useState<Record<string, string>>({}); const [q, setQ] = useState(""); const [res, setRes] = useState<any[]>([]); const [open, setOpen] = useState(false);
  useEffect(() => { if (value.length) supabase.from("cards").select("id,title").in("id", value).then(({ data }) => setTitles(Object.fromEntries((data ?? []).map((r) => [r.id, r.title])))); }, [value]);
  useEffect(() => {
    if (!open || !bId) return;
    const t = setTimeout(() => supabase.rpc("search_cards", { p_board: bId, p_q: q, p_limit: 15 }).then(({ data }) => setRes(data ?? [])), 200);
    return () => clearTimeout(t);
  }, [q, open, bId]);
  if (!bId) return <div className="text-xs text-red-600">Configure o board de destino deste campo.</div>;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">{value.map((id) => (
        <span key={id} className="inline-flex items-center gap-1 rounded-md bg-soft px-2 py-1 text-xs font-semibold">
          <a href={`/b/${bId}?card=${id}`} className="hover:text-action">▤ {titles[id] ?? "…"}</a>
          {!disabled && <button type="button" onClick={() => onSave(value.filter((x) => x !== id))}>×</button>}
        </span>
      ))}</div>
      {!disabled && (multiple || value.length === 0) && <div className="relative">
        <input className="input" placeholder="Buscar card…" value={q} onFocus={() => setOpen(true)} onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setOpen(false), 200)} />
        {open && <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-[12px] border border-line bg-white p-1 shadow-pop">
          {res.map((c) => <button type="button" key={c.id} onMouseDown={() => { setTitles((t) => ({ ...t, [c.id]: c.title })); onSave(multiple ? [...new Set([...value, c.id])] : [c.id]); setQ(""); }} className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-soft">{c.title}<span className="ml-2 text-xs text-ink-3">{fmtDate(c.created_at)}</span></button>)}
          {res.length === 0 && <div className="p-2 text-xs text-ink-3">Nenhum card encontrado.</div>}
        </div>}
      </div>}
    </div>
  );
}

/** Lista de campos de um formulário, com regras aplicadas. */
export function FieldList({ fields, data, onSave, ctx, state, readOnly, lockedIds, fieldMenu, emptyText }:
  { fields: Field[]; data: Record<string, any>; onSave: (id: string, v: any) => void; ctx: FieldCtx;
    state?: { hidden: Set<string>; disabled: Set<string>; required: Set<string> }; readOnly?: boolean; lockedIds?: Set<string>;
    fieldMenu?: (f: Field, index: number) => React.ReactNode; emptyText?: string }) {
  const visible = fields.filter((f) => !state?.hidden.has(f.id) && (!f.hidden || !isEmpty(data[f.id])));
  if (!visible.length) return <div className="rounded-[12px] bg-soft p-4 text-center text-sm text-ink-3">{emptyText ?? "Nenhum campo neste formulário."}</div>;
  return (
    <div className="space-y-4">
      {visible.map((f, i) => {
        const req = f.required || state?.required.has(f.id);
        const dis = readOnly || f.hidden || state?.disabled.has(f.id) || lockedIds?.has(f.id);
        return (
          <div key={f.id}>
            {(f.type !== "static_text" || fieldMenu) && <div className="flex items-center justify-between gap-2">
              <span className="label">{f.type !== "static_text" && f.label}{req && <span className="text-red-500"> *</span>}{f.hidden && <Badge className="ml-1 bg-soft text-ink-3">oculto</Badge>}</span>
              {fieldMenu?.(f, i)}
            </div>}
            {f.description && <span className="-mt-0.5 mb-1 block text-xs text-ink-3">{f.description}</span>}
            <FieldInput field={f} value={data[f.id]} onSave={(v) => onSave(f.id, v)} disabled={dis} ctx={{ ...ctx, data, fields }} />
          </div>
        );
      })}
    </div>
  );
}
