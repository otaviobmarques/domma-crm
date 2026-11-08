"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase, fetchAll } from "@/lib/supabase";
import type { Automation, Board, BoardAccess, Card, Field, FieldRule, Phase, Tag } from "@/lib/types";
import type { FormatCtx } from "@/lib/fields";
import { useApp } from "../AppShell";

export interface BoardData {
  board: Board; phases: Phase[]; fields: Field[]; tags: Tag[]; rules: FieldRule[]; automations: Automation[];
  cards: Card[]; access: BoardAccess; boardMembers: { user_id: string; role: string }[];
  isAdmin: boolean; canEdit: boolean;
  initialFields: Field[]; phaseFields: (phaseId: string) => Field[]; phaseMap: Record<string, Phase>;
  tagMap: Record<string, Tag>; fieldMap: Record<string, Field>; fmt: FormatCtx;
  reload: (what?: ("board" | "phases" | "fields" | "tags" | "rules" | "automations" | "cards" | "members")[]) => Promise<void>;
  patchCardLocal: (id: string, patch: Partial<Card>) => void;
}
const Ctx = createContext<BoardData | null>(null);
export const useBoard = () => { const c = useContext(Ctx); if (!c) throw new Error("useBoard fora do BoardProvider"); return c; };

export function BoardProvider({ boardId, children, fallback }: { boardId: string; children: React.ReactNode; fallback: React.ReactNode }) {
  const { memberMap } = useApp();
  const [board, setBoard] = useState<Board | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [rules, setRules] = useState<FieldRule[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [access, setAccess] = useState<BoardAccess | null>(null);
  const [boardMembers, setBM] = useState<{ user_id: string; role: string }[]>([]);
  const [records, setRecords] = useState<Record<string, string>>({});
  const [linkedCards, setLinkedCards] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);

  const reload = useCallback(async (what?: string[]) => {
    const all = !what; const w = new Set(what ?? []);
    const jobs: PromiseLike<unknown>[] = [];
    if (all || w.has("board")) jobs.push((async () => {
      const { data } = await supabase.from("boards").select("*").eq("id", boardId).maybeSingle();
      if (!data || data.deleted_at) setMissing(true); else setBoard(data as Board);
      const { data: acc } = await supabase.rpc("board_access", { p_board: boardId });
      setAccess((acc as BoardAccess) ?? null);
    })());
    if (all || w.has("phases")) jobs.push(supabase.from("phases").select("*").eq("board_id", boardId).is("deleted_at", null).order("position").then(({ data }) => setPhases((data ?? []) as Phase[])));
    if (all || w.has("fields")) jobs.push(supabase.from("fields").select("*").eq("board_id", boardId).is("deleted_at", null).order("position").then(({ data }) => setFields((data ?? []) as Field[])));
    if (all || w.has("tags")) jobs.push(supabase.from("tags").select("*").eq("board_id", boardId).is("deleted_at", null).order("name").then(({ data }) => setTags((data ?? []) as Tag[])));
    if (all || w.has("rules")) jobs.push(supabase.from("field_rules").select("*").eq("board_id", boardId).order("position").then(({ data }) => setRules((data ?? []) as FieldRule[])));
    if (all || w.has("automations")) jobs.push(supabase.from("automations").select("*").eq("board_id", boardId).is("deleted_at", null).order("created_at").then(({ data }) => setAutomations((data ?? []) as Automation[])));
    if (all || w.has("members")) jobs.push(supabase.from("board_members").select("user_id, role").eq("board_id", boardId).then(({ data }) => setBM(data ?? [])));
    if (all || w.has("cards")) jobs.push(fetchAll<Card>((from, to) => supabase.from("cards").select("*, card_assignees(user_id), card_tags(tag_id)")
      .eq("board_id", boardId).is("deleted_at", null).order("created_at", { ascending: false }).range(from, to)).then(setCards));
    await Promise.all(jobs);
  }, [boardId]);

  useEffect(() => { reload(); }, [reload]);

  // tempo real: o que um usuário move/edita aparece para os outros
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const debounced = (what: string[]) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => reload(what as any), 250); };
    const ch = supabase.channel(`board-${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards", filter: `board_id=eq.${boardId}` }, () => debounced(["cards"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "card_assignees" }, () => debounced(["cards"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "card_tags" }, () => debounced(["cards"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "phases", filter: `board_id=eq.${boardId}` }, () => debounced(["phases"]))
      .on("postgres_changes", { event: "*", schema: "public", table: "fields", filter: `board_id=eq.${boardId}` }, () => debounced(["fields"]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [boardId, reload]);

  // títulos de registros e cards conectados (para exibir nos cards)
  useEffect(() => {
    if (!cards) return;
    const recIds = new Set<string>(), cardIds = new Set<string>();
    for (const f of fields) for (const c of cards) {
      const v = c.data?.[f.id];
      if (!Array.isArray(v)) continue;
      if (f.type === "connected_database") v.forEach((x: string) => !records[x] && recIds.add(x));
      if (f.type === "connected_board") v.forEach((x: string) => !linkedCards[x] && cardIds.add(x));
    }
    if (recIds.size) supabase.from("records").select("id,title").in("id", [...recIds].slice(0, 300)).then(({ data }) => setRecords((r) => ({ ...r, ...Object.fromEntries((data ?? []).map((x) => [x.id, x.title])) })));
    if (cardIds.size) supabase.from("cards").select("id,title").in("id", [...cardIds].slice(0, 300)).then(({ data }) => setLinkedCards((r) => ({ ...r, ...Object.fromEntries((data ?? []).map((x) => [x.id, x.title])) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, fields]);

  const patchCardLocal = useCallback((id: string, patch: Partial<Card>) => setCards((cs) => cs?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? cs), []);

  const value = useMemo<BoardData | null>(() => {
    if (!board || !cards || !access) return null;
    const phaseMap = Object.fromEntries(phases.map((p) => [p.id, p]));
    const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));
    const fieldMap = Object.fromEntries(fields.map((f) => [f.id, f]));
    return {
      board, phases, fields, tags, rules, automations, cards, access, boardMembers,
      isAdmin: access === "admin", canEdit: access === "admin" || access === "member" || access === "limited",
      initialFields: fields.filter((f) => !f.phase_id),
      phaseFields: (pid: string) => fields.filter((f) => f.phase_id === pid),
      phaseMap, tagMap, fieldMap,
      fmt: { members: memberMap, tags: tagMap, records, cards: linkedCards },
      reload: reload as BoardData["reload"], patchCardLocal,
    };
  }, [board, phases, fields, tags, rules, automations, cards, access, boardMembers, memberMap, records, linkedCards, reload, patchCardLocal]);

  if (missing) return <div className="p-10 text-center"><div className="text-3xl">🔒</div><div className="mt-2 font-bold">Board não encontrado</div><p className="text-sm text-ink-3">Ele pode ter sido excluído ou você não tem acesso.</p></div>;
  if (!value) return <>{fallback}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
