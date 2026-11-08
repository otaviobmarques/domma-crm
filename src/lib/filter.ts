import type { Card, Condition } from "./types";
import { evalConditions, onlyDigits } from "./fields";

export interface CardFilter {
  q?: string; tags?: string[]; assignees?: string[]; phases?: string[];
  due?: "" | "overdue" | "today" | "week" | "none"; status?: "" | "open" | "done";
  created_from?: string; created_to?: string; conditions?: Condition[]; match?: "and" | "or";
}
export const emptyFilter: CardFilter = { q: "", tags: [], assignees: [], phases: [], due: "", status: "", conditions: [], match: "and" };

export function filterActive(f: CardFilter) {
  return !!(f.tags?.length || f.assignees?.length || f.phases?.length || f.due || f.status || f.created_from || f.created_to || f.conditions?.length);
}

export function applyFilter(cards: Card[], f: CardFilter): Card[] {
  const q = (f.q ?? "").trim().toLowerCase(); const qd = onlyDigits(q);
  const now = Date.now(); const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  return cards.filter((c) => {
    if (q) {
      const hay = (c.title + " " + JSON.stringify(c.data)).toLowerCase();
      if (!hay.includes(q) && !(qd.length >= 4 && onlyDigits(hay).includes(qd))) return false;
    }
    const tags = c.card_tags?.map((t) => t.tag_id) ?? []; const ass = c.card_assignees?.map((a) => a.user_id) ?? [];
    if (f.tags?.length && !f.tags.some((t) => tags.includes(t))) return false;
    if (f.assignees?.length && !f.assignees.some((a) => (a === "__none" ? ass.length === 0 : ass.includes(a)))) return false;
    if (f.phases?.length && !f.phases.includes(c.phase_id)) return false;
    if (f.status === "open" && c.finished_at) return false;
    if (f.status === "done" && !c.finished_at) return false;
    if (f.due) {
      const d = c.due_at ? new Date(c.due_at).getTime() : null;
      if (f.due === "none" && d !== null) return false;
      if (f.due === "overdue" && !(d !== null && d < now && !c.finished_at)) return false;
      if (f.due === "today" && !(d !== null && d <= endToday.getTime() && d >= now - 86400000)) return false;
      if (f.due === "week" && !(d !== null && d <= now + 7 * 86400000 && d >= now)) return false;
    }
    if (f.created_from && c.created_at < f.created_from) return false;
    if (f.created_to && c.created_at.slice(0, 10) > f.created_to) return false;
    if (f.conditions?.length && !evalConditions(f.conditions, f.match ?? "and", c.data, { phase: c.phase_id, tags, assignees: ass, title: c.title })) return false;
    return true;
  });
}
