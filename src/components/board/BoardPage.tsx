"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import type { Field } from "@/lib/types";
import { coerce, parseCSV } from "@/lib/fields";
import { applyFilter, emptyFilter, filterActive, type CardFilter } from "@/lib/filter";
import { Button, Menu, MenuItem, Modal, PageLoader, cx, useToast } from "../ui";
import { HeaderSlot, useApp } from "../AppShell";
import { BoardProvider, useBoard } from "./BoardContext";
import { Kanban } from "./Kanban";
import { CardModal, NewCardModal } from "./CardModal";
import { ListView, ReportsView } from "./TableViews";
import { Dashboard } from "./Dashboard";
import { AutomationsView } from "./Automations";
import { BoardSettings, type SettingsTab } from "./BoardSettings";
import { FilterPanel, SavedFilters } from "./Filters";
import { useMover } from "./actions";
import { Icon } from "../Icon";

type View = "kanban" | "list" | "reports" | "dashboard" | "automations";
const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: "kanban", label: "Kanban", icon: "kanban" }, { id: "list", label: "Lista", icon: "list" }, { id: "reports", label: "Relatórios", icon: "chart" },
  { id: "automations", label: "Automações", icon: "zap" }, { id: "dashboard", label: "Dashboard", icon: "gauge" },
];

export function BoardPage({ id }: { id: string }) {
  return <BoardProvider boardId={id} fallback={<PageLoader />}><Suspense fallback={<PageLoader />}><Inner /></Suspense></BoardProvider>;
}

function Inner() {
  const b = useBoard(); const router = useRouter(); const sp = useSearchParams(); const toast = useToast();
  const view = (sp.get("view") as View) || "kanban"; const openCard = sp.get("card");
  const [filter, setFilter] = useState<CardFilter>(emptyFilter); const [showFilter, setShowFilter] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newCard, setNewCard] = useState(false); const [newCardPhase, setNewCardPhase] = useState<string | null>(null); const [importing, setImporting] = useState(false);
  const [settings, setSettings] = useState<{ tab: SettingsTab; phaseId?: string } | null>(null);
  const [bulk, setBulk] = useState<"move" | "edit" | null>(null);
  const mover = useMover();
  const nav = (p: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString()); Object.entries(p).forEach(([k, v]) => (v === null ? q.delete(k) : q.set(k, v)));
    router.replace(`/b/${b.board.id}?${q.toString()}`, { scroll: false });
  };
  const cards = useMemo(() => applyFilter(b.cards, filter), [b.cards, filter]);
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function joinBoard() { const { error } = await supabase.rpc("join_board", { p_board: b.board.id }); if (error) toast(errMsg(error), "err"); else { toast("Agora você participa deste board"); b.reload(); } }
  async function bulkDelete() {
    if (!confirm(`Remover ${selected.size} card(s)? Eles podem ser restaurados no histórico do board.`)) return;
    const { error } = await supabase.rpc("delete_cards", { p_ids: [...selected] });
    if (error) return toast(errMsg(error), "err");
    toast(`${selected.size} card(s) removidos`); setSelected(new Set()); b.reload(["cards"]);
  }
  async function bulkDuplicate() {
    const { data, error } = await supabase.rpc("duplicate_cards", { p_ids: [...selected] });
    if (error) return toast(errMsg(error), "err"); toast(`${data} card(s) duplicados`); setSelected(new Set()); b.reload(["cards"]);
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <HeaderSlot>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line text-base" style={{ background: b.board.color + "10" }}>{b.board.icon}</span>
        <h1 className="min-w-0 truncate text-[16px] font-semibold">{b.board.name}</h1>
        <span className="flex-1" />
        {b.access === "viewer" && <Button size="sm" variant="soft" onClick={joinBoard}>Participar do board</Button>}
        <Menu trigger={<button className="flex h-8 items-center gap-1.5 rounded-[8px] border border-line bg-white px-2.5 text-[13px] font-semibold hover:bg-soft"><Icon name={VIEWS.find((v) => v.id === view)?.icon ?? "kanban"} size={15} className="text-action" />{VIEWS.find((v) => v.id === view)?.label}<Icon name="chevron" size={14} className="text-ink-3" /></button>}>
          {(close) => VIEWS.map((v) => <MenuItem key={v.id} onClick={() => { close(); nav({ view: v.id === "kanban" ? null : v.id }); }}><Icon name={v.icon} size={15} className={view === v.id ? "text-action" : "text-ink-3"} />{v.label}</MenuItem>)}
        </Menu>
        {b.isAdmin && <>
          <button onClick={() => setSettings({ tab: "board" })} title="Configurações do board" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-line-2 hover:text-ink"><Icon name="settings" size={17} /></button>
          <button onClick={() => setSettings({ tab: "members" })} className="hidden h-8 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-semibold text-ink-2 hover:bg-line-2 hover:text-ink md:flex"><Icon name="users" size={16} />Membros</button>
          <button onClick={() => setSettings({ tab: "history" })} title="Histórico" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-ink-2 hover:bg-line-2 hover:text-ink"><Icon name="history" size={17} /></button>
        </>}
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
      </HeaderSlot>

      {(view === "kanban" || view === "list") && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
          {b.canEdit && <button onClick={() => setNewCard(true)} className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-action px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(91,63,230,.3)] hover:bg-action-dark"><Icon name="plus" size={15} />Novo Card</button>}
          <div className="relative w-64"><Icon name="search" size={15} className="pointer-events-none absolute left-3 top-2 text-ink-3" />
            <input className="input !h-8 !border-transparent !bg-line-2 !pl-9 focus:!bg-white focus:!border-[#B9AAFF]" placeholder="Pesquisar..." value={filter.q ?? ""} onChange={(e) => setFilter({ ...filter, q: e.target.value })} /></div>
          <button onClick={() => setShowFilter((s) => !s)} className={cx("inline-flex items-center gap-1.5 text-[13px] font-semibold", filterActive(filter) || showFilter ? "text-action" : "text-ink-2 hover:text-ink")}><Icon name="filter" size={15} />Filtrar{filterActive(filter) && " (ativo)"}</button>
          <span className="h-4 w-px bg-line" />
          <span className="num text-[13px] font-medium text-ink-2">{cards.length}{cards.length !== b.cards.length && ` / ${b.cards.length}`} Cards</span>
          <span className="h-4 w-px bg-line" />
          {selected.size > 0 ? <>
            <span className="text-[13px] font-semibold">{selected.size} selecionado(s)</span>
            <Button onClick={() => setBulk("move")}>Mover</Button>
            <Button onClick={() => setBulk("edit")}>Editar campo</Button>
            <Button onClick={bulkDuplicate}>Duplicar</Button>
            <Button variant="danger" onClick={bulkDelete}>Excluir</Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Limpar</Button>
          </> : <>
            {b.canEdit && <button onClick={() => setSelected(new Set(cards.map((c) => c.id)))} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"><Icon name="layers" size={15} />Ações em massa</button>}
            {b.canEdit && <button onClick={() => setImporting(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-ink"><Icon name="upload" size={15} />Importar planilha</button>}
          </>}
        </div>
      )}
      {showFilter && (view === "kanban" || view === "list") && <div className="grid gap-3 px-4 pb-3 sm:px-6 lg:grid-cols-[1fr_auto]"><FilterPanel value={filter} onChange={setFilter} /><SavedFilters value={filter} onApply={setFilter} /></div>}

      <div className={cx("min-h-0 flex-1", view === "kanban" ? "overflow-hidden" : "overflow-y-auto pt-3")}>
        {view === "kanban" && <Kanban cards={cards} onOpen={(id) => nav({ card: id })} onMove={mover.request} selected={selected} onSelect={toggleSel}
          onConfigurePhase={(pid) => setSettings({ tab: "phases", phaseId: pid })} onEditForm={(pid) => setSettings({ tab: "fields", phaseId: pid })}
          onCreateIn={(pid) => { setNewCardPhase(pid); setNewCard(true); }} />}
        {view === "list" && <ListView cards={cards} onOpen={(id) => nav({ card: id })} selected={selected} onSelect={toggleSel} onSelectAll={(ids) => setSelected(new Set(ids))} />}
        {view === "reports" && <ReportsView onOpen={(id) => nav({ card: id })} />}
        {view === "dashboard" && <Dashboard />}
        {view === "automations" && <AutomationsView />}
      </div>

      {openCard && <CardModal cardId={openCard} onClose={() => nav({ card: null })} onMove={mover.request} onConfigurePhase={(pid) => setSettings({ tab: "phases", phaseId: pid })} />}
      {mover.dialog}
      <NewCardModal open={newCard} phaseId={newCardPhase} onClose={() => { setNewCard(false); setNewCardPhase(null); }} onCreated={(id) => { toast("Card criado"); nav({ card: id }); }} />
      {settings && <BoardSettings open onClose={() => setSettings(null)} tab={settings.tab} setTab={(t) => setSettings({ tab: t, phaseId: settings.phaseId })} phaseId={settings.phaseId} />}
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {bulk && <BulkModal mode={bulk} ids={[...selected]} onClose={() => setBulk(null)} onDone={() => { setBulk(null); setSelected(new Set()); b.reload(["cards"]); }} />}
    </div>
  );
}

function BulkModal({ mode, ids, onClose, onDone }: { mode: "move" | "edit"; ids: string[]; onClose: () => void; onDone: () => void }) {
  const b = useBoard(); const toast = useToast();
  const [phase, setPhase] = useState(""); const [field, setField] = useState(""); const [value, setValue] = useState(""); const [busy, setBusy] = useState(false);
  const f = b.fieldMap[field];
  async function run() {
    setBusy(true); let ok = 0; const errs: string[] = [];
    for (const id of ids) {
      const c = b.cards.find((x) => x.id === id)!;
      const { error } = mode === "move"
        ? await supabase.rpc("move_card", { p_card: id, p_phase: phase, p_patch: {} })
        : await supabase.rpc("update_card", { p_card: id, p_patch: { [field]: f ? coerce(f, value) ?? null : value } });
      if (error) errs.push(`${c?.title}: ${errMsg(error)}`); else ok++;
    }
    setBusy(false);
    toast(`${ok} de ${ids.length} card(s) atualizados${errs.length ? ` · ${errs.length} com erro` : ""}`, errs.length ? "err" : "ok");
    if (errs.length) console.warn(errs);
    onDone();
  }
  return (
    <Modal open onClose={onClose} title={mode === "move" ? `Mover ${ids.length} card(s)` : `Editar ${ids.length} card(s)`} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={mode === "move" ? !phase : !field} onClick={run}>Aplicar</Button></>}>
      {mode === "move" ? <select className="input" value={phase} onChange={(e) => setPhase(e.target.value)}><option value="">Fase de destino…</option>{b.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : (
        <div className="space-y-3">
          <select className="input" value={field} onChange={(e) => setField(e.target.value)}><option value="">Campo…</option>{b.fields.filter((x) => !["static_text", "formula", "sequence", "attachment", "connected_database", "connected_board", "cep"].includes(x.type)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          {f && (["single_select"].includes(f.type) ? <select className="input" value={value} onChange={(e) => setValue(e.target.value)}><option value="">(limpar)</option>{(f.options?.items ?? []).map((x: string) => <option key={x}>{x}</option>)}</select> : <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Novo valor (vazio limpa o campo)" />)}
          <p className="text-xs text-ink-3">Movimentos em massa respeitam obrigatórios, regras e movimentos permitidos; cards bloqueados são informados.</p>
        </div>
      )}
    </Modal>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const b = useBoard(); const toast = useToast(); const { org } = useApp(); void org;
  const [rows, setRows] = useState<string[][] | null>(null); const [map, setMap] = useState<Record<number, string>>({});
  const [dedupe, setDedupe] = useState(""); const [busy, setBusy] = useState(false); const [result, setResult] = useState<any>(null);
  const targets: Field[] = b.initialFields.filter((f) => !["static_text", "formula", "sequence", "date_diff"].includes(f.type));
  async function onFile(file?: File) {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) return toast("Salve a planilha como CSV (Arquivo › Salvar como › CSV) e envie novamente.", "err");
    const r = parseCSV(await file.text()); setRows(r);
    const m: Record<number, string> = {};
    r[0]?.forEach((h, i) => { const f = targets.find((t) => t.label.toLowerCase() === h.trim().toLowerCase() || t.integrated_key?.toLowerCase() === h.trim().toLowerCase()); if (f) m[i] = f.id; });
    setMap(m);
  }
  const body = rows?.slice(1) ?? [];
  const built = body.map((r) => { const o: Record<string, any> = {}; Object.entries(map).forEach(([i, fid]) => { const f = b.fieldMap[fid]; const v = f ? coerce(f, r[Number(i)]) : undefined; if (v !== undefined) o[fid] = v; }); return o; });
  const missingReq = targets.filter((t) => t.required && !Object.values(map).includes(t.id));
  async function run() {
    setBusy(true); let created = 0, skipped = 0; const errors: any[] = [];
    for (let i = 0; i < built.length; i += 200) {
      const { data, error } = await supabase.rpc("import_cards", { p_board: b.board.id, p_rows: built.slice(i, i + 200), p_dedupe_field: dedupe || null });
      if (error) { toast(errMsg(error), "err"); break; }
      created += data.created; skipped += data.skipped; errors.push(...data.errors.map((e: any) => ({ ...e, row: e.row + i + 1 })));
    }
    setBusy(false); setResult({ created, skipped, errors }); b.reload(["cards"]);
  }
  return (
    <Modal open onClose={onClose} wide title="Importar cards de planilha" footer={result ? <Button variant="primary" onClick={onClose}>Fechar</Button> : <><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} disabled={!rows || !built.length} onClick={run}>Importar {built.length} card(s)</Button></>}>
      {result ? (
        <div className="space-y-2 text-sm">
          <div className="text-lg font-bold text-emerald-600">✓ {result.created} card(s) criados</div>
          {result.skipped > 0 && <div>{result.skipped} ignorado(s) por duplicidade.</div>}
          {result.errors.length > 0 && <div className="max-h-56 overflow-y-auto rounded-[12px] bg-red-50 p-3 text-xs text-red-700">{result.errors.map((e: any) => <div key={e.row}>Linha {e.row + 1}: {e.error}</div>)}</div>}
        </div>
      ) : !rows ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] border-2 border-dashed border-line p-10 text-center hover:bg-soft">
          <span className="text-3xl">📄</span><span className="font-bold">Selecione um arquivo CSV</span><span className="text-xs text-ink-3">Primeira linha com os nomes das colunas. Separador vírgula ou ponto e vírgula. Para .xlsx, salve como CSV antes.</span>
          <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="text-sm"><b>{body.length}</b> linhas encontradas. Ligue cada coluna a um campo do formulário inicial:</div>
          <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 scroll-thin">
            {rows[0].map((h, i) => (
              <div key={i} className="flex items-center gap-2 rounded-[10px] bg-soft p-2 text-sm">
                <span className="w-32 shrink-0 truncate font-semibold" title={h}>{h || `Coluna ${i + 1}`}</span>
                <select className="input !py-1.5" value={map[i] ?? ""} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value) n[i] = e.target.value; else delete n[i]; return n; })}><option value="">Ignorar</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.label}{t.required ? " *" : ""}</option>)}</select>
              </div>
            ))}
          </div>
          <div><label className="label">Deduplicação</label><select className="input" value={dedupe} onChange={(e) => setDedupe(e.target.value)}><option value="">Não verificar duplicados</option>{targets.filter((t) => Object.values(map).includes(t.id)).map((t) => <option key={t.id} value={t.id}>Ignorar linhas com {t.label} já existente</option>)}</select></div>
          {missingReq.length > 0 && <div className="rounded-[12px] bg-amber-50 p-3 text-xs text-amber-800">Campos obrigatórios sem coluna: {missingReq.map((f) => f.label).join(", ")}. Na importação eles não bloqueiam, mas o card ficará incompleto.</div>}
          <div><div className="label">Prévia (3 primeiras linhas)</div>
            <div className="overflow-x-auto rounded-[12px] border border-line text-xs"><table className="w-full"><thead className="bg-soft"><tr>{Object.values(map).map((fid) => <th key={fid} className="px-2 py-1 text-left">{b.fieldMap[fid]?.label}</th>)}</tr></thead>
              <tbody>{built.slice(0, 3).map((r, i) => <tr key={i} className="border-t border-line">{Object.values(map).map((fid) => <td key={fid} className="px-2 py-1">{Array.isArray(r[fid]) ? r[fid].join(", ") : String(r[fid] ?? "")}</td>)}</tr>)}</tbody></table></div>
          </div>
        </div>
      )}
    </Modal>
  );
}
