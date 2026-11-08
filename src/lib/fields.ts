import type { Condition, Field, FieldRule, RuleAction } from "./types";

export interface FieldTypeDef { type: string; label: string; icon: string; extra?: boolean; unique?: boolean; integrated?: boolean }

/** Os 22 tipos do Goalfy + os extras do Domma CRM. */
export const FIELD_TYPES: FieldTypeDef[] = [
  { type: "short_text", label: "Texto curto", icon: "T", unique: true, integrated: true },
  { type: "long_text", label: "Texto longo", icon: "¶", unique: true, integrated: true },
  { type: "email", label: "E-mail", icon: "@", unique: true, integrated: true },
  { type: "static_text", label: "Texto fixo", icon: "❝" },
  { type: "document", label: "Documento (CPF/CNPJ)", icon: "#", unique: true, integrated: true },
  { type: "phone", label: "Telefone", icon: "☎", unique: true, integrated: true },
  { type: "datetime", label: "Data e hora", icon: "◷", unique: true, integrated: true },
  { type: "date", label: "Data", icon: "▦", unique: true, integrated: true },
  { type: "time", label: "Tempo", icon: "⏱", unique: true, integrated: true },
  { type: "due_date", label: "Data de vencimento", icon: "⚑", unique: true, integrated: true },
  { type: "currency", label: "Moeda", icon: "R$", unique: true, integrated: true },
  { type: "number", label: "Número", icon: "123", unique: true, integrated: true },
  { type: "multi_select", label: "Seleção de lista", icon: "☰", integrated: true },
  { type: "single_select", label: "Seleção única", icon: "◉", integrated: true },
  { type: "assignee", label: "Responsável", icon: "👤", integrated: true },
  { type: "checklist", label: "Checkbox", icon: "☑" },
  { type: "attachment", label: "Anexo", icon: "📎", integrated: true },
  { type: "tag", label: "Etiqueta", icon: "🏷", integrated: true },
  { type: "connected_database", label: "Database conectado", icon: "🗂" },
  { type: "connected_board", label: "Board conectado", icon: "▤" },
  { type: "formula", label: "Fórmula", icon: "ƒ" },
  { type: "sequence", label: "Sequenciador", icon: "№" },
  { type: "cep", label: "Endereço (CEP)", icon: "⌖", extra: true, integrated: true },
  { type: "plate", label: "Placa de veículo", icon: "🚗", extra: true, unique: true, integrated: true },
  { type: "rating", label: "Avaliação", icon: "★", extra: true, integrated: true },
  { type: "url", label: "URL", icon: "🔗", extra: true, unique: true, integrated: true },
  { type: "date_diff", label: "Dias entre datas", icon: "Δ", extra: true },
];
export const typeDef = (t: string) => FIELD_TYPES.find((x) => x.type === t) ?? { type: t, label: t, icon: "?" };
export const NUMERIC_TYPES = ["number", "currency", "formula", "rating", "date_diff"];
export const COMPUTED_TYPES = ["formula", "sequence", "date_diff", "static_text"];
export const TEXTLIKE_TYPES = ["short_text", "long_text", "email", "document", "phone", "plate", "url", "single_select", "sequence", "number", "currency"];

export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function fmtDate(v?: string | null, withTime = false) {
  if (!v) return "";
  const d = new Date(v.length === 10 ? v + "T12:00:00" : v);
  if (isNaN(d.getTime())) return String(v);
  return withTime ? d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : d.toLocaleDateString("pt-BR");
}

export function duration(ms: number) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(m, 0)}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `${d}d` : `${Math.floor(d / 30)}m`;
}

export interface FormatCtx {
  members?: Record<string, { full_name: string | null; email: string | null }>;
  tags?: Record<string, { name: string; color: string }>;
  records?: Record<string, string>;
  cards?: Record<string, string>;
}

/** Texto simples para exibir o valor de um campo (Kanban, Lista, CSV). */
export function formatValue(f: Field, v: any, ctx: FormatCtx = {}): string {
  if (isEmpty(v)) return "";
  switch (f.type) {
    case "currency": return typeof v === "number" ? brl(v) : String(v);
    case "number": case "formula": case "date_diff": return typeof v === "number" ? num(v) : String(v);
    case "date": return fmtDate(v);
    case "datetime": case "due_date": return fmtDate(v, true);
    case "rating": return "★".repeat(Number(v) || 0);
    case "multi_select": case "checklist": return (v as string[]).join(", ");
    case "assignee": return (v as string[]).map((id) => ctx.members?.[id]?.full_name || ctx.members?.[id]?.email || "—").join(", ");
    case "tag": return (v as string[]).map((id) => ctx.tags?.[id]?.name ?? "—").join(", ");
    case "connected_database": return (v as string[]).map((id) => ctx.records?.[id] ?? "registro").join(", ");
    case "connected_board": return (v as string[]).map((id) => ctx.cards?.[id] ?? "card").join(", ");
    case "attachment": return `${(v as unknown[]).length} arquivo(s)`;
    case "cep": return [v.logradouro, v.numero, v.bairro, v.cidade && `${v.cidade}/${v.uf ?? ""}`].filter(Boolean).join(", ") || v.cep || "";
    case "document": return maskDocument(String(v));
    case "phone": return maskPhone(String(v));
    default: return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

export const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
export function maskPhone(s: string) {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}
export function maskDocument(s: string) {
  const d = onlyDigits(s);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return s;
}
export function validCPF(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === +d[9] && calc(10) === +d[10];
}
export function validCNPJ(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => { const w = n === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]; let s = 0; for (let i = 0; i < n; i++) s += +d[i] * w[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +d[12] && calc(13) === +d[13];
}
export const validPlate = (v: string) => /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/i.test((v || "").trim());
export const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");

/** Valida um valor no cliente; devolve mensagem de erro ou null. */
export function validateField(f: Field, v: any): string | null {
  if (isEmpty(v)) return null;
  if (f.type === "email" && !validEmail(v)) return "E-mail inválido";
  if (f.type === "document") {
    const kind = f.options?.doc_type ?? "cpf_cnpj";
    const ok = kind === "cpf" ? validCPF(v) : kind === "cnpj" ? validCNPJ(v) : validCPF(v) || validCNPJ(v);
    if (!ok) return kind === "cnpj" ? "CNPJ inválido" : kind === "cpf" ? "CPF inválido" : "CPF/CNPJ inválido";
  }
  if (f.type === "plate" && !validPlate(v)) return "Placa inválida (ex.: ABC1D23)";
  if (f.regex && typeof v === "string") { try { if (!new RegExp(f.regex).test(v)) return "Formato inválido"; } catch { /* regex ruim */ } }
  return null;
}

// ---------------- Fórmulas ----------------
// Sintaxe: {{id_do_campo}} + - * / ( ), comparações e SUM AVG MIN MAX ROUND IF ABS
type Tok = { t: "num" | "op" | "id" | "(" | ")" | ","; v: string };
function tokenize(s: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; out.push({ t: "num", v: s.slice(i, j) }); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z_]/.test(s[j])) j++; out.push({ t: "id", v: s.slice(i, j).toUpperCase() }); i = j; continue; }
    const two = s.slice(i, i + 2);
    if ([">=", "<=", "==", "!="].includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/><×÷−=".includes(c)) { out.push({ t: "op", v: c === "×" ? "*" : c === "÷" ? "/" : c === "−" ? "-" : c === "=" ? "==" : c }); i++; continue; }
    if (c === "(" || c === ")" || c === ",") { out.push({ t: c, v: c } as Tok); i++; continue; }
    throw new Error(`Caractere inválido: ${c}`);
  }
  return out;
}
export function evalExpression(expr: string): number {
  const toks = tokenize(expr); let p = 0;
  const peek = () => toks[p]; const next = () => toks[p++];
  const cmp = (): number => {
    let l = add();
    while (peek()?.t === "op" && [">", "<", ">=", "<=", "==", "!="].includes(peek().v)) {
      const o = next().v; const r = add();
      l = Number(o === ">" ? l > r : o === "<" ? l < r : o === ">=" ? l >= r : o === "<=" ? l <= r : o === "==" ? l === r : l !== r);
    }
    return l;
  };
  const add = (): number => { let l = mul(); while (peek()?.t === "op" && "+-".includes(peek().v)) { const o = next().v; const r = mul(); l = o === "+" ? l + r : l - r; } return l; };
  const mul = (): number => { let l = unary(); while (peek()?.t === "op" && "*/".includes(peek().v)) { const o = next().v; const r = unary(); l = o === "*" ? l * r : r === 0 ? 0 : l / r; } return l; };
  const unary = (): number => { if (peek()?.t === "op" && peek().v === "-") { next(); return -unary(); } return prim(); };
  const prim = (): number => {
    const t = next();
    if (!t) throw new Error("Expressão incompleta");
    if (t.t === "num") return parseFloat(t.v);
    if (t.t === "(") { const v = cmp(); if (next()?.t !== ")") throw new Error("Falta )"); return v; }
    if (t.t === "id") {
      if (next()?.t !== "(") throw new Error(`Esperado ( após ${t.v}`);
      const args: number[] = [];
      if (peek()?.t !== ")") { args.push(cmp()); while (peek()?.t === ",") { next(); args.push(cmp()); } }
      if (next()?.t !== ")") throw new Error("Falta )");
      switch (t.v) {
        case "SUM": return args.reduce((a, b) => a + b, 0);
        case "AVG": return args.length ? args.reduce((a, b) => a + b, 0) / args.length : 0;
        case "MIN": return Math.min(...args);
        case "MAX": return Math.max(...args);
        case "ABS": return Math.abs(args[0] ?? 0);
        case "ROUND": { const f = Math.pow(10, args[1] ?? 0); return Math.round((args[0] ?? 0) * f) / f; }
        case "IF": return args[0] ? args[1] ?? 0 : args[2] ?? 0;
        default: throw new Error(`Função desconhecida: ${t.v}`);
      }
    }
    throw new Error("Expressão inválida");
  };
  const v = cmp();
  if (p < toks.length) throw new Error("Sobrou texto na expressão");
  return v;
}
export function computeFormula(expr: string, data: Record<string, any>): number | null {
  if (!expr) return null;
  try {
    const replaced = expr.replace(/\{\{([^}]+)\}\}/g, (_, id) => { const n = Number(data[id]); return isFinite(n) ? `(${n})` : "(0)"; });
    const r = evalExpression(replaced);
    return isFinite(r) ? Math.round(r * 100) / 100 : null;
  } catch { return null; }
}
export function computeDateDiff(f: Field, data: Record<string, any>): number | null {
  const a = data[f.options?.from], b = f.options?.to === "today" ? new Date().toISOString() : data[f.options?.to];
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
/** Recalcula campos computados (fórmula, dias entre datas) e devolve o patch. */
export function computedPatch(fields: Field[], data: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {}; const merged = { ...data };
  for (let pass = 0; pass < 2; pass++) for (const f of fields) {
    if (f.type === "formula") { const v = computeFormula(f.options?.expression ?? "", merged); if (v !== merged[f.id]) { patch[f.id] = v; merged[f.id] = v; } }
    if (f.type === "date_diff") { const v = computeDateDiff(f, merged); if (v !== merged[f.id]) { patch[f.id] = v; merged[f.id] = v; } }
  }
  return patch;
}
export function interpolate(tpl: string, data: Record<string, any>, fields: Field[], ctx: FormatCtx = {}) {
  return (tpl || "").replace(/\{\{([^}]+)\}\}/g, (_, id) => {
    const f = fields.find((x) => x.id === id);
    return f ? formatValue(f, data[id], ctx) : id === "title" ? String(data.__title ?? "") : "";
  });
}

// ---------------- Condições e regras (mesma semântica do banco) ----------------
export const OPERATORS: { op: string; label: string; needsValue: boolean }[] = [
  { op: "filled", label: "está preenchido", needsValue: false },
  { op: "empty", label: "está vazio", needsValue: false },
  { op: "eq", label: "é igual a", needsValue: true },
  { op: "neq", label: "é diferente de", needsValue: true },
  { op: "contains", label: "contém", needsValue: true },
  { op: "not_contains", label: "não contém", needsValue: true },
  { op: "gt", label: "é maior que", needsValue: true },
  { op: "gte", label: "é maior ou igual a", needsValue: true },
  { op: "lt", label: "é menor que", needsValue: true },
  { op: "lte", label: "é menor ou igual a", needsValue: true },
];

export function condOk(v: any, op: string, target: any): boolean {
  if (op === "filled") return !isEmpty(v);
  if (op === "empty") return isEmpty(v);
  if (isEmpty(v)) return op === "neq" || op === "not_contains";
  const t = target === undefined || target === null ? "" : String(target);
  if (Array.isArray(v)) {
    const has = v.map(String).includes(t);
    if (op === "eq" || op === "contains") return has;
    if (op === "neq" || op === "not_contains") return !has;
    return false;
  }
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  switch (op) {
    case "eq": return s.toLowerCase() === t.toLowerCase();
    case "neq": return s.toLowerCase() !== t.toLowerCase();
    case "contains": return s.toLowerCase().includes(t.toLowerCase());
    case "not_contains": return !s.toLowerCase().includes(t.toLowerCase());
    default: {
      let a = Number(s), b = Number(t);
      if (isNaN(a) || isNaN(b)) { a = new Date(s).getTime(); b = new Date(t).getTime(); if (isNaN(a) || isNaN(b)) return false; }
      return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
    }
  }
}
export interface CardCtx { phase?: string; tags?: string[]; assignees?: string[]; title?: string }
export function evalConditions(conds: Condition[], match: "and" | "or", data: Record<string, any>, ctx: CardCtx = {}) {
  if (!conds?.length) return true;
  const res = conds.map((c) => condOk(["phase", "tags", "assignees", "title"].includes(c.field) ? (ctx as any)[c.field] : data[c.field], c.op, c.value));
  return match === "or" ? res.some(Boolean) : res.every(Boolean);
}
const MIRROR: Record<string, string> = { show: "hide", hide: "show", enable: "disable", disable: "enable", require: "optional", allow_move: "deny_move", deny_move: "allow_move" };
export const mirrorActions = (a: RuleAction[]) => a.map((x) => ({ ...x, type: MIRROR[x.type] ?? x.type }));
export const RULE_ACTIONS = [
  { type: "show", label: "Exibir campo", target: "field" },
  { type: "hide", label: "Esconder campo", target: "field" },
  { type: "enable", label: "Habilitar campo", target: "field" },
  { type: "disable", label: "Desabilitar campo", target: "field" },
  { type: "require", label: "Tornar obrigatório", target: "field" },
  { type: "allow_move", label: "Permitir movimento para fase", target: "phase" },
  { type: "deny_move", label: "Negar movimento para fase", target: "phase" },
];
export interface RuleState { hidden: Set<string>; disabled: Set<string>; required: Set<string>; denied: Map<string, string> }
export function evalRules(rules: FieldRule[], data: Record<string, any>, ctx: CardCtx, phaseId: string | null): RuleState {
  const st: RuleState = { hidden: new Set(), disabled: new Set(), required: new Set(), denied: new Map() };
  for (const r of rules.filter((r) => r.enabled && (!r.phase_id || r.phase_id === phaseId)).sort((a, b) => a.position - b.position)) {
    const ok = evalConditions(r.conditions, r.match, data, ctx);
    const acts = ok ? r.true_actions : r.mirror ? mirrorActions(r.true_actions) : r.false_actions;
    for (const a of acts ?? []) {
      const id = a.field_id ?? "";
      if (a.type === "hide") st.hidden.add(id);
      if (a.type === "show") st.hidden.delete(id);
      if (a.type === "disable") st.disabled.add(id);
      if (a.type === "enable") st.disabled.delete(id);
      if (a.type === "require") st.required.add(id);
      if (a.type === "optional") st.required.delete(id);
      if (a.type === "deny_move") st.denied.set(a.phase_id ?? "*", r.name);
      if (a.type === "allow_move") st.denied.delete(a.phase_id ?? "*");
    }
  }
  return st;
}

export const PHASE_COLORS = ["#7B61FF", "#5B3FE6", "#3B82F6", "#06B6D4", "#10B981", "#84CC16", "#F59E0B", "#F97316", "#EF4444", "#EC4899", "#6B7280"];

export function toCSV(rows: (string | number | null | undefined)[][]) {
  return "﻿" + rows.map((r) => r.map((c) => { const s = c === null || c === undefined ? "" : String(c); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\n");
}
export function downloadFile(name: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type }); const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/** Parser de CSV (vírgula ou ponto e vírgula, com aspas). */
export function parseCSV(text: string): string[][] {
  const t = text.replace(/^﻿/, ""); const first = t.split("\n")[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
/** Converte texto da planilha para o formato do campo. */
export function coerce(f: Field, raw: string): any {
  const s = (raw ?? "").trim(); if (!s) return undefined;
  if (f.type === "number" || f.type === "currency" || f.type === "rating") { const n = Number(s.replace(/[R$\s.]/g, "").replace(",", ".")); return isNaN(n) ? undefined : n; }
  if (f.type === "multi_select" || f.type === "checklist") return s.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
  if (f.type === "phone" || f.type === "document") return onlyDigits(s);
  if (f.type === "date" || f.type === "datetime" || f.type === "due_date") {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (m) return f.type === "date" ? `${m[3]}-${m[2]}-${m[1]}` : new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "12"}:${m[5] ?? "00"}:00`).toISOString();
    return s;
  }
  if (["assignee", "tag", "connected_database", "connected_board", "attachment", "cep"].includes(f.type)) return undefined;
  return s;
}
