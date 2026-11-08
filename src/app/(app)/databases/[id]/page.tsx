"use client";
import Link from "next/link";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, errMsg, fetchAll } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { Badge, Button, Drawer, Modal, PageLoader, Tabs, Toggle, cx, useToast } from "@/components/ui";
import { ChipPicker, FieldList } from "@/components/FieldInput";
import { FieldBuilder } from "@/components/board/FieldBuilder";
import type { Database, DbRecord, Field } from "@/lib/types";
import { TEXTLIKE_TYPES, coerce, downloadFile, fmtDate, formatValue, onlyDigits, parseCSV, toCSV } from "@/lib/fields";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense fallback={<PageLoader />}><DatabasePage key={id} id={id} /></Suspense>;
}

function DatabasePage({ id }: { id: string }) {
  const { org, members, memberMap, session, role } = useApp(); const toast = useToast(); const router = useRouter(); const sp = useSearchParams();
  const [db, setDb] = useState<Database | null>(null); const [fields, setFields] = useState<Field[]>([]); const [records, setRecords] = useState<DbRecord[] | null>(null);
  const [q, setQ] = useState(""); const [status, setStatus] = useState<"active" | "disabled" | "all" | "trash">("active");
  const [per, setPer] = useState(20); const [page, setPage] = useState(0); const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "created_at", dir: -1 });
  const [hiddenCols, setHiddenCols] = useState<string[]>([]); const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false); const [settings, setSettings] = useState(false); const [importing, setImporting] = useState(false);
  const openId = sp.get("record");

  const load = useCallback(async () => {
    const { data } = await supabase.from("databases").select("*").eq("id", id).maybeSingle(); setDb(data as Database);
    const { data: fs } = await supabase.from("fields").select("*").eq("database_id", id).is("deleted_at", null).order("position"); setFields((fs ?? []) as Field[]);
    setRecords(await fetchAll<DbRecord>((a, b) => supabase.from("records").select("*").eq("database_id", id).order("created_at", { ascending: false }).range(a, b)));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel("db-" + id).on("postgres_changes", { event: "*", schema: "public", table: "records", filter: `database_id=eq.${id}` }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const cols = fields.filter((f) => f.type !== "static_text" && !hiddenCols.includes(f.id));
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase(); const td = onlyDigits(t);
    return (records ?? []).filter((r) => (status === "trash" ? r.deleted_at : !r.deleted_at && (status === "all" || r.status === status)))
      .filter((r) => !t || (r.title + JSON.stringify(r.data)).toLowerCase().includes(t) || (td.length >= 4 && onlyDigits(JSON.stringify(r.data)).includes(td)))
      .sort((a, b) => {
        const va = sort.col in a ? (a as any)[sort.col] : a.data?.[sort.col]; const vb = sort.col in b ? (b as any)[sort.col] : b.data?.[sort.col];
        return ((va ?? "") > (vb ?? "") ? 1 : (va ?? "") < (vb ?? "") ? -1 : 0) * sort.dir;
      });
  }, [records, q, status, sort]);
  if (!db || !records) return <PageLoader />;
  const isAdmin = role === "admin" || db.created_by === session.user.id;
  const pageRows = rows.slice(page * per, page * per + per);
  const fmt = { members: memberMap };

  async function bulk(action: "disable" | "activate" | "trash" | "restore") {
    const ids = [...selected];
    if (action === "trash" && !confirm(`Mover ${ids.length} registro(s) para a lixeira?`)) return;
    const patch = action === "disable" ? { status: "disabled" } : action === "activate" ? { status: "active" } : action === "trash" ? { deleted_at: new Date().toISOString() } : { deleted_at: null };
    const { error } = await supabase.from("records").update(patch).in("id", ids);
    if (error) toast(errMsg(error), "err"); else toast("Registros atualizados");
    setSelected(new Set()); load();
  }
  function exportCSV() {
    const head = ["Título", "Status", ...cols.map((f) => f.label), "Criado em", "Atualizado em"];
    downloadFile(`${db!.name}.csv`, toCSV([head, ...rows.map((r) => [r.title, r.status === "active" ? "Ativo" : "Desabilitado", ...cols.map((f) => formatValue(f, r.data?.[f.id], fmt)), fmtDate(r.created_at, true), fmtDate(r.updated_at, true)])]));
  }
  const th = (col: string, label: string) => <th className="cursor-pointer whitespace-nowrap px-3 py-2 font-bold" onClick={() => setSort((s) => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : 1 }))}>{label}{sort.col === col && (sort.dir === 1 ? " ↑" : " ↓")}</th>;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/databases" className="text-sm text-ink-3 hover:text-ink">← Databases</Link>
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] text-xl" style={{ background: db.color + "1F" }}>{db.icon}</span>
        <h1 className="text-[19px] font-bold">{db.name}</h1>
        <span className="num text-sm text-ink-3">{rows.length.toLocaleString("pt-BR")} registros</span>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => setCreating(true)}>+ Novo registro</Button>
        <Button onClick={() => setImporting(true)}>Importar</Button>
        <Button onClick={exportCSV}>Exportar</Button>
        {isAdmin && <Button onClick={() => setSettings(true)}>⚙ Configurações</Button>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input className="input !w-72" placeholder="Buscar em qualquer campo…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="input !w-auto" value={status} onChange={(e) => { setStatus(e.target.value as any); setPage(0); setSelected(new Set()); }}>
          <option value="active">Ativos</option><option value="disabled">Desabilitados</option><option value="all">Todos</option>{isAdmin && <option value="trash">Lixeira</option>}
        </select>
        <div className="w-64"><ChipPicker multiple selected={fields.filter((f) => !hiddenCols.includes(f.id)).map((f) => f.id)} onChange={(v) => setHiddenCols(fields.map((f) => f.id).filter((x) => !v.includes(x)))} options={fields.filter((f) => f.type !== "static_text").map((f) => ({ id: f.id, label: f.label }))} /></div>
        {selected.size > 0 && <>
          <span className="text-sm font-semibold">{selected.size} selecionado(s)</span>
          {status !== "trash" ? <><Button size="sm" onClick={() => bulk("disable")}>Desativar</Button><Button size="sm" onClick={() => bulk("activate")}>Ativar</Button>{isAdmin && <Button size="sm" variant="danger" onClick={() => bulk("trash")}>Excluir</Button>}</> : <Button size="sm" onClick={() => bulk("restore")}>Restaurar</Button>}
        </>}
      </div>
      <div className="mt-3 overflow-hidden rounded-[16px] border border-line">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="bg-soft text-left text-xs text-ink-2"><tr>
              <th className="w-8 px-3"><input type="checkbox" checked={selected.size > 0 && selected.size === pageRows.length} onChange={(e) => setSelected(new Set(e.target.checked ? pageRows.map((r) => r.id) : []))} /></th>
              {th("title", "Título")}{th("status", "Status")}{cols.map((f) => <th key={f.id} className="cursor-pointer whitespace-nowrap px-3 py-2 font-bold" onClick={() => setSort((s) => ({ col: f.id, dir: s.col === f.id ? (s.dir === 1 ? -1 : 1) : 1 }))}>{f.label}{sort.col === f.id && (sort.dir === 1 ? " ↑" : " ↓")}</th>)}{th("created_at", "Criado em")}{th("updated_at", "Atualizado em")}
            </tr></thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className={cx("cursor-pointer border-t border-line hover:bg-soft/60", selected.has(r.id) && "bg-lilac/40")} onClick={() => router.replace(`/databases/${id}?record=${r.id}`, { scroll: false })}>
                  <td className="px-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
                  <td className="max-w-[240px] truncate px-3 py-2 font-semibold">{r.title}</td>
                  <td className="px-3"><Badge color={r.status === "active" ? "#10B981" : "#8A84A0"}>{r.status === "active" ? "Ativo" : "Desabilitado"}</Badge></td>
                  {cols.map((f) => <td key={f.id} className="max-w-[220px] truncate px-3 py-2">{formatValue(f, r.data?.[f.id], fmt)}</td>)}
                  <td className="num whitespace-nowrap px-3 text-xs text-ink-3">{fmtDate(r.created_at, true)}</td><td className="num whitespace-nowrap px-3 text-xs text-ink-3">{fmtDate(r.updated_at, true)}</td>
                </tr>
              ))}
              {pageRows.length === 0 && <tr><td colSpan={cols.length + 5} className="p-8 text-center text-ink-3">Nenhum registro.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs">
          <span className="flex items-center gap-2">Por página <select className="input !w-auto !py-1" value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(0); }}>{[10, 20, 30].map((n) => <option key={n}>{n}</option>)}</select></span>
          <span className="num text-ink-3">{rows.length ? page * per + 1 : 0}–{Math.min(rows.length, page * per + per)} de {rows.length}</span>
          <div className="flex gap-1"><Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</Button><Button size="sm" disabled={(page + 1) * per >= rows.length} onClick={() => setPage(page + 1)}>›</Button></div>
        </div>
      </div>

      {creating && <RecordForm db={db} fields={fields} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {openId && <RecordDrawer db={db} fields={fields} id={openId} onClose={() => router.replace(`/databases/${id}`, { scroll: false })} onChanged={load} />}
      {settings && <DbSettings db={db} fields={fields} onClose={() => setSettings(false)} reload={load} />}
      {importing && <ImportRecords db={db} fields={fields} onClose={() => { setImporting(false); load(); }} />}
      <span className="hidden">{members.length}</span>
    </div>
  );
}

function RecordForm({ db, fields, onClose, onSaved }: { db: Database; fields: Field[]; onClose: () => void; onSaved: () => void }) {
  const { org, members } = useApp(); const toast = useToast();
  const [data, setData] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const { error } = await supabase.from("records").insert({ org_id: org.id, database_id: db.id, data });
    setBusy(false);
    if (error) return toast(errMsg(error), "err");
    toast("Registro criado"); onSaved();
  }
  return (
    <Modal open onClose={onClose} title={`Novo registro · ${db.name}`} wide footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar</Button></>}>
      <FieldList fields={fields} data={data} onSave={(k, v) => setData((d) => ({ ...d, [k]: v }))} ctx={{ orgId: org.id, members, folder: `records/${db.id}` }} />
    </Modal>
  );
}

function RecordDrawer({ db, fields, id, onClose, onChanged }: { db: Database; fields: Field[]; id: string; onClose: () => void; onChanged: () => void }) {
  const { org, members } = useApp(); const toast = useToast();
  const [r, setR] = useState<DbRecord | null>(null); const [cards, setCards] = useState<any[]>([]);
  const load = useCallback(() => {
    supabase.from("records").select("*").eq("id", id).maybeSingle().then(({ data }) => setR(data as DbRecord));
    supabase.rpc("record_cards", { p_record: id }).then(({ data }) => setCards(data ?? []));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!r) return null;
  async function patch(p: Partial<DbRecord>) {
    const { error } = await supabase.from("records").update(p).eq("id", id);
    if (error) toast(errMsg(error), "err"); load(); onChanged();
  }
  return (
    <Drawer open onClose={onClose} title={<>🗂 {r.title}</>}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={r.status === "active"} onChange={(v) => patch({ status: v ? "active" : "disabled" })} label={r.status === "active" ? "Ativo" : "Desabilitado"} />
          <span className="text-xs text-ink-3">Criado {fmtDate(r.created_at, true)} · atualizado {fmtDate(r.updated_at, true)}{r.disabled_at && ` · desabilitado ${fmtDate(r.disabled_at, true)}`}</span>
        </div>
        <FieldList fields={fields} data={r.data} onSave={(k, v) => patch({ data: { ...r.data, [k]: v } } as any)} ctx={{ orgId: org.id, members, folder: `records/${db.id}` }} />
        <div>
          <h3 className="mb-2 text-sm font-bold">Ficha única · cards ligados a este registro</h3>
          <div className="space-y-1.5">
            {cards.map((c) => (
              <Link key={c.id} href={`/b/${c.board_id}?card=${c.id}`} className="flex items-center gap-2 rounded-[12px] border border-line px-3 py-2 text-sm hover:bg-soft">
                <span className="h-2 w-2 rounded-full" style={{ background: c.phase_color }} /><b className="truncate">{c.title}</b>
                <span className="ml-auto truncate text-xs text-ink-3">{c.board_name} · {c.phase_name}</span><span className="num text-xs text-ink-3">{fmtDate(c.created_at)}</span>
              </Link>
            ))}
            {cards.length === 0 && <div className="text-xs text-ink-3">Nenhum card conectado ainda.</div>}
          </div>
        </div>
        <Button variant="danger" onClick={async () => { if (confirm("Mover este registro para a lixeira?")) { await patch({ deleted_at: new Date().toISOString() } as any); onClose(); } }}>Excluir registro</Button>
      </div>
    </Drawer>
  );
}

function DbSettings({ db, fields, onClose, reload }: { db: Database; fields: Field[]; onClose: () => void; reload: () => void }) {
  const toast = useToast(); const [tab, setTab] = useState<"general" | "fields">("general");
  const [s, setS] = useState(db.settings ?? {}); const [name, setName] = useState(db.name);
  async function save() {
    const { error } = await supabase.from("databases").update({ name, settings: s }).eq("id", db.id);
    if (error) return toast(errMsg(error), "err"); toast("Salvo"); reload();
  }
  async function clear() {
    if (prompt(`Ação irreversível pela tela (os registros vão para a lixeira). Digite LIMPAR para confirmar:`) !== "LIMPAR") return;
    const { error } = await supabase.from("records").update({ deleted_at: new Date().toISOString() }).eq("database_id", db.id).is("deleted_at", null);
    if (error) toast(errMsg(error), "err"); else toast("Registros movidos para a lixeira"); reload();
  }
  return (
    <Drawer open onClose={onClose} title={`⚙ ${db.name}`} width="max-w-4xl">
      <Tabs value={tab} onChange={setTab} className="-mx-6 -mt-2 mb-6 px-6" tabs={[{ id: "general", label: "Geral" }, { id: "fields", label: "Formulário da database" }]} />
      {tab === "general" ? (
        <div className="space-y-4">
          <div><label className="label">Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Campo de título</label><select className="input" value={s.title_field ?? ""} onChange={(e) => setS({ ...s, title_field: e.target.value })}><option value="">—</option>{fields.filter((f) => TEXTLIKE_TYPES.includes(f.type)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select></div>
            <div><label className="label">Subtítulo</label><ChipPicker multiple selected={s.subtitle_fields ?? []} onChange={(v) => setS({ ...s, subtitle_fields: v })} options={fields.map((f) => ({ id: f.id, label: f.label }))} /></div>
          </div>
          <Toggle checked={!!s.limited_view} onChange={(v) => setS({ ...s, limited_view: v })} label="Visão limitada" hint="Cada usuário só vê os próprios registros (admins veem todos)." />
          <div className="flex justify-end"><Button variant="primary" onClick={save}>Salvar</Button></div>
          <div className="border-t border-line pt-4"><Button variant="danger" onClick={clear}>Limpar registros</Button></div>
        </div>
      ) : <FieldBuilder scope={{ org_id: db.org_id, database_id: db.id }} fields={fields} reload={reload} />}
    </Drawer>
  );
}

function ImportRecords({ db, fields, onClose }: { db: Database; fields: Field[]; onClose: () => void }) {
  const { org } = useApp(); const toast = useToast();
  const [rows, setRows] = useState<string[][] | null>(null); const [map, setMap] = useState<Record<number, string>>({}); const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ ok: number; err: string[] } | null>(null);
  const targets = fields.filter((f) => !["static_text", "formula", "sequence", "attachment", "connected_database", "connected_board"].includes(f.type));
  async function onFile(file?: File) {
    if (!file) return; const r = parseCSV(await file.text()); setRows(r);
    const m: Record<number, string> = {}; r[0]?.forEach((h, i) => { const f = targets.find((t) => t.label.toLowerCase() === h.trim().toLowerCase()); if (f) m[i] = f.id; }); setMap(m);
  }
  async function run() {
    setBusy(true); let ok = 0; const err: string[] = [];
    const built = rows!.slice(1).map((r) => { const o: Record<string, any> = {}; Object.entries(map).forEach(([i, fid]) => { const f = fields.find((x) => x.id === fid)!; const v = coerce(f, r[Number(i)]); if (v !== undefined) o[fid] = v; }); return o; });
    for (let i = 0; i < built.length; i += 100) {
      const chunk = built.slice(i, i + 100).map((data) => ({ org_id: org.id, database_id: db.id, data }));
      const { error } = await supabase.from("records").insert(chunk);
      if (!error) { ok += chunk.length; continue; }
      for (const [j, row] of chunk.entries()) { const r2 = await supabase.from("records").insert(row); if (r2.error) err.push(`Linha ${i + j + 2}: ${errMsg(r2.error)}`); else ok++; }
    }
    setBusy(false); setRes({ ok, err }); toast(`${ok} registro(s) importados`);
  }
  return (
    <Modal open onClose={onClose} wide title={`Importar para ${db.name}`} footer={res ? <Button variant="primary" onClick={onClose}>Fechar</Button> : <><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!rows} onClick={run}>Importar</Button></>}>
      {res ? <div className="space-y-2 text-sm"><div className="text-lg font-bold text-emerald-600">✓ {res.ok} importados</div>{res.err.length > 0 && <div className="max-h-56 overflow-y-auto rounded-[12px] bg-red-50 p-3 text-xs text-red-700">{res.err.map((e) => <div key={e}>{e}</div>)}</div>}</div>
        : !rows ? <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[16px] border-2 border-dashed border-line p-10 text-center hover:bg-soft"><span className="text-3xl">📄</span><b>Selecione um CSV</b><span className="text-xs text-ink-3">Duplicados em campos “exclusivos” são recusados e listados.</span><input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        : <div className="grid gap-2 sm:grid-cols-2">{rows[0].map((h, i) => (
          <div key={i} className="flex items-center gap-2 rounded-[10px] bg-soft p-2 text-sm"><span className="w-32 truncate font-semibold">{h}</span>
            <select className="input !py-1.5" value={map[i] ?? ""} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value) n[i] = e.target.value; else delete n[i]; return n; })}><option value="">Ignorar</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
        ))}<div className="text-xs text-ink-3 sm:col-span-2">{rows.length - 1} linhas.</div></div>}
    </Modal>
  );
}
