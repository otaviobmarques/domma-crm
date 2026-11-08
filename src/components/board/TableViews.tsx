"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Card } from "@/lib/types";
import { NUMERIC_TYPES, brl, downloadFile, fmtDate, formatValue, num, toCSV } from "@/lib/fields";
import { applyFilter, emptyFilter, type CardFilter } from "@/lib/filter";
import { Avatar, Badge, Button, Modal, cx, useToast } from "../ui";
import { ChipPicker } from "../FieldInput";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";
import { FilterPanel } from "./Filters";

const SYS = [
  { id: "__title", label: "Título" }, { id: "__phase", label: "Fase" }, { id: "__assignees", label: "Responsáveis" }, { id: "__tags", label: "Etiquetas" },
  { id: "__due", label: "Vencimento" }, { id: "__created", label: "Criado em" }, { id: "__updated", label: "Atualizado em" }, { id: "__finished", label: "Finalizado em" },
];

function useColumns() {
  const b = useBoard();
  return useMemo(() => [...SYS, ...b.fields.filter((f) => f.type !== "static_text").map((f) => ({ id: f.id, label: f.label + (f.phase_id ? ` · ${b.phaseMap[f.phase_id]?.name ?? ""}` : "") }))], [b.fields, b.phaseMap]);
}

function cellValue(c: Card, col: string, b: ReturnType<typeof useBoard>, memberMap: Record<string, any>): { text: string; sort: string | number; node?: React.ReactNode } {
  switch (col) {
    case "__title": return { text: c.title, sort: c.title.toLowerCase() };
    case "__phase": { const p = b.phaseMap[c.phase_id]; return { text: p?.name ?? "", sort: p?.position ?? 0, node: <Badge color={p?.color}>{p?.name}</Badge> }; }
    case "__assignees": { const n = (c.card_assignees ?? []).map((a) => memberMap[a.user_id]?.full_name || memberMap[a.user_id]?.email || ""); return { text: n.join(", "), sort: n.join(","), node: <div className="flex -space-x-1">{n.map((x, i) => <Avatar key={i} size={20} name={x} />)}</div> }; }
    case "__tags": { const t = (c.card_tags ?? []).map((x) => b.tagMap[x.tag_id]).filter(Boolean); return { text: t.map((x) => x.name).join(", "), sort: t.map((x) => x.name).join(","), node: <div className="flex flex-wrap gap-1">{t.map((x) => <Badge key={x.id} color={x.color}>{x.name}</Badge>)}</div> }; }
    case "__due": return { text: fmtDate(c.due_at, true), sort: c.due_at ?? "9999" };
    case "__created": return { text: fmtDate(c.created_at, true), sort: c.created_at };
    case "__updated": return { text: fmtDate(c.updated_at, true), sort: c.updated_at };
    case "__finished": return { text: fmtDate(c.finished_at, true), sort: c.finished_at ?? "" };
    default: { const f = b.fieldMap[col]; if (!f) return { text: "", sort: "" }; const v = c.data?.[col]; return { text: formatValue(f, v, b.fmt), sort: typeof v === "number" ? v : formatValue(f, v, b.fmt).toLowerCase() }; }
  }
}

export function CardTable({ cards, columns, onOpen, selected, onSelect, onSelectAll, totals }:
  { cards: Card[]; columns: string[]; onOpen: (id: string) => void; selected?: Set<string>; onSelect?: (id: string) => void; onSelectAll?: (ids: string[]) => void; totals?: boolean }) {
  const b = useBoard(); const { memberMap } = useApp(); const all = useColumns();
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "__created", dir: -1 });
  const [page, setPage] = useState(0); const per = 50;
  const rows = useMemo(() => [...cards].sort((x, y) => { const a = cellValue(x, sort.col, b, memberMap).sort, c = cellValue(y, sort.col, b, memberMap).sort; return (a > c ? 1 : a < c ? -1 : 0) * sort.dir; }), [cards, sort, b, memberMap]);
  useEffect(() => setPage(0), [cards.length]);
  const pageRows = rows.slice(page * per, page * per + per);
  const numericCols = columns.filter((c) => b.fieldMap[c] && NUMERIC_TYPES.includes(b.fieldMap[c].type));
  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-white">
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="bg-soft text-left text-xs text-ink-2">
            <tr>
              {onSelect && <th className="w-8 px-3 py-2"><input type="checkbox" checked={!!selected?.size && selected.size === cards.length} onChange={(e) => onSelectAll?.(e.target.checked ? cards.map((c) => c.id) : [])} aria-label="Selecionar todos" /></th>}
              {columns.map((c) => <th key={c} className="cursor-pointer whitespace-nowrap px-3 py-2 font-bold hover:text-ink" onClick={() => setSort((s) => ({ col: c, dir: s.col === c ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                {all.find((x) => x.id === c)?.label ?? c}{sort.col === c && (sort.dir === 1 ? " ↑" : " ↓")}</th>)}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.id} className={cx("cursor-pointer border-t border-line hover:bg-soft/60", selected?.has(c.id) && "bg-lilac/40")} onClick={() => onOpen(c.id)}>
                {onSelect && <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected?.has(c.id)} onChange={() => onSelect(c.id)} /></td>}
                {columns.map((col) => { const v = cellValue(c, col, b, memberMap); return <td key={col} className={cx("max-w-[280px] truncate px-3 py-2", col === "__title" && "font-semibold", typeof v.sort === "number" && col.length > 10 && "num")}>{v.node ?? v.text}</td>; })}
              </tr>
            ))}
            {pageRows.length === 0 && <tr><td colSpan={columns.length + 1} className="p-8 text-center text-ink-3">Nenhum card encontrado.</td></tr>}
          </tbody>
          {totals && cards.length > 0 && (
            <tfoot className="border-t-2 border-line bg-soft text-xs font-bold">
              <tr>
                {onSelect && <td />}
                {columns.map((col, i) => {
                  if (i === 0) return <td key={col} className="px-3 py-2">{cards.length} cards</td>;
                  if (!numericCols.includes(col)) return <td key={col} />;
                  const vals = cards.map((c) => Number(c.data?.[col])).filter((n) => isFinite(n)); const sum = vals.reduce((a, x) => a + x, 0);
                  const isCur = b.fieldMap[col].type === "currency" || b.fieldMap[col].options?.format === "currency";
                  return <td key={col} className="num px-3 py-2"><div>Σ {isCur ? brl(sum) : num(sum)}</div><div className="font-normal text-ink-3">x̄ {isCur ? brl(vals.length ? sum / vals.length : 0) : num(vals.length ? sum / vals.length : 0)} · n {vals.length}</div></td>;
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length > per && <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs">
        <span className="num text-ink-3">{page * per + 1}–{Math.min(rows.length, page * per + per)} de {rows.length}</span>
        <div className="flex gap-1"><Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</Button><Button size="sm" disabled={(page + 1) * per >= rows.length} onClick={() => setPage(page + 1)}>›</Button></div>
      </div>}
    </div>
  );
}

export function exportCards(name: string, cards: Card[], columns: string[], b: ReturnType<typeof useBoard>, memberMap: Record<string, any>, labels: { id: string; label: string }[]) {
  const head = columns.map((c) => labels.find((l) => l.id === c)?.label ?? c);
  const rows = cards.map((c) => columns.map((col) => cellValue(c, col, b, memberMap).text));
  downloadFile(`${name}.csv`, toCSV([head, ...rows]));
}

export function ListView({ cards, onOpen, selected, onSelect, onSelectAll }: { cards: Card[]; onOpen: (id: string) => void; selected: Set<string>; onSelect: (id: string) => void; onSelectAll: (ids: string[]) => void }) {
  const b = useBoard(); const all = useColumns(); const key = `domma.cols.${b.board.id}`;
  const [cols, setCols] = useState<string[]>(["__title", "__phase", "__assignees", "__tags", "__due", "__created"]);
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setCols(JSON.parse(s)); } catch { /* */ } }, [key]);
  const save = (v: string[]) => { setCols(v); localStorage.setItem(key, JSON.stringify(v)); };
  return (
    <div className="px-4 pb-6 sm:px-6">
      <div className="mb-3 flex items-center gap-2"><span className="text-xs font-semibold text-ink-3">Colunas</span><div className="min-w-0 flex-1"><ChipPicker multiple selected={cols} onChange={save} options={all.map((c) => ({ id: c.id, label: c.label }))} /></div></div>
      <CardTable cards={cards} columns={cols} onOpen={onOpen} selected={selected} onSelect={onSelect} onSelectAll={onSelectAll} />
    </div>
  );
}

export function ReportsView({ onOpen }: { onOpen: (id: string) => void }) {
  const b = useBoard(); const { memberMap, session } = useApp(); const toast = useToast(); const all = useColumns();
  const [reports, setReports] = useState<any[]>([]); const [cur, setCur] = useState<any | null>(null);
  const [filter, setFilter] = useState<CardFilter>(emptyFilter); const [cols, setCols] = useState<string[]>(["__title", "__phase", "__assignees", "__created"]);
  const [saving, setSaving] = useState(false); const [name, setName] = useState("");
  const load = () => supabase.from("reports").select("*").eq("board_id", b.board.id).eq("kind", "report").order("name").then(({ data }) => setReports(data ?? []));
  useEffect(() => { load(); }, [b.board.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => applyFilter(b.cards, filter), [b.cards, filter]);
  function pick(r: any) { setCur(r); setFilter({ ...emptyFilter, ...(r?.config?.filter ?? {}) }); setCols(r?.config?.columns ?? ["__title", "__phase", "__assignees", "__created"]); }
  async function saveReport() {
    const config = { filter, columns: cols };
    const { data, error } = cur && !saving
      ? await supabase.from("reports").update({ config }).eq("id", cur.id).select().single()
      : await supabase.from("reports").insert({ org_id: b.board.org_id, board_id: b.board.id, kind: "report", name: name || "Relatório", config, created_by: session.user.id }).select().single();
    if (error) return toast(errMsg(error), "err");
    toast("Relatório salvo"); setSaving(false); setCur(data); load();
  }
  async function del() { if (!cur || !confirm(`Excluir o relatório "${cur.name}"?`)) return; await supabase.from("reports").delete().eq("id", cur.id); setCur(null); load(); }
  const apiUrl = cur && typeof window !== "undefined" ? `${location.origin}/api/v1/reports/${cur.id}?key=SUA_CHAVE_DE_API` : "";
  return (
    <div className="grid gap-4 px-4 pb-6 sm:px-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <div className="space-y-1">
          <button onClick={() => pick(null)} className={cx("block w-full rounded-[10px] px-3 py-2 text-left text-sm font-semibold", !cur ? "bg-lilac text-action" : "hover:bg-soft")}>+ Relatório novo</button>
          {reports.map((r) => <button key={r.id} onClick={() => pick(r)} className={cx("block w-full truncate rounded-[10px] px-3 py-2 text-left text-sm", cur?.id === r.id ? "bg-lilac font-semibold text-action" : "hover:bg-soft")}>📊 {r.name}</button>)}
        </div>
        <FilterPanel value={filter} onChange={setFilter} />
      </aside>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-[16px] font-bold">{cur?.name ?? "Relatório novo"} <span className="num text-sm font-semibold text-ink-3">· {rows.length} cards</span></h3>
          <Button onClick={() => exportCards(cur?.name ?? "relatorio", rows, cols, b, memberMap, all)}>⬇ Exportar CSV</Button>
          {cur && <Button onClick={saveReport}>Salvar alterações</Button>}
          <Button variant="primary" onClick={() => { setName(cur ? `${cur.name} (cópia)` : ""); setSaving(true); }}>{cur ? "Salvar como…" : "Salvar relatório"}</Button>
          {cur && <Button variant="danger" onClick={del}>Excluir</Button>}
        </div>
        <ChipPicker multiple selected={cols} onChange={setCols} options={all.map((c) => ({ id: c.id, label: c.label }))} />
        <CardTable cards={rows} columns={cols} onOpen={onOpen} totals />
        {cur && <div className="rounded-[12px] bg-soft p-3 text-xs"><b>Power BI / planilhas:</b> use a URL abaixo como fonte de dados Web (JSON), com sua chave de API de Configurações › Usuário.<div className="num mt-1 break-all rounded-md bg-white p-2">{apiUrl}</div></div>}
      </div>
      <Modal open={saving} onClose={() => setSaving(false)} title="Salvar relatório" footer={<><Button onClick={() => setSaving(false)}>Cancelar</Button><Button variant="primary" onClick={() => { setCur(null); saveReport(); }}>Salvar</Button></>}>
        <label className="label">Nome</label><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Relatório padrão - Leads franquia" />
      </Modal>
    </div>
  );
}
