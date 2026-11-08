"use client";
import { useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Card, Field, Phase } from "@/lib/types";
import { COMPUTED_TYPES, computedPatch, evalRules, isEmpty } from "@/lib/fields";
import { FieldList } from "../FieldInput";
import { Button, Modal, useToast } from "../ui";
import { useApp } from "../AppShell";
import { useBoard } from "./BoardContext";

export const cardCtx = (c: Card) => ({ phase: c.phase_id, tags: c.card_tags?.map((t) => t.tag_id) ?? [], assignees: c.card_assignees?.map((a) => a.user_id) ?? [], title: c.title });

/** Salva valores do card recalculando fórmulas e sincronizando a data de vencimento. */
export function useSaveCard() {
  const { fields, patchCardLocal } = useBoard(); const toast = useToast();
  return async (card: Card, patch: Record<string, any>) => {
    const merged = { ...card.data, ...patch };
    const full = { ...patch, ...computedPatch(fields, merged) };
    const dueField = fields.find((f) => f.type === "due_date" && f.id in patch);
    patchCardLocal(card.id, { data: { ...card.data, ...full } });
    const { error } = await supabase.rpc("update_card", { p_card: card.id, p_patch: full, p_due: dueField ? patch[dueField.id] : null, p_set_due: !!dueField });
    if (error) { toast(errMsg(error), "err"); patchCardLocal(card.id, { data: card.data }); return false; }
    return true;
  };
}

/** Movimento com formulário: obrigatórios da fase atual e campos da fase final. */
export function useMover() {
  const b = useBoard(); const toast = useToast();
  const [pending, setPending] = useState<{ card: Card; to: Phase; fields: Field[] } | null>(null);

  async function doMove(card: Card, to: Phase, patch: Record<string, any> = {}) {
    const merged = { ...card.data, ...patch };
    const full = Object.keys(patch).length ? { ...patch, ...computedPatch(b.fields, merged) } : {};
    const prev = { phase_id: card.phase_id };
    b.patchCardLocal(card.id, { phase_id: to.id, data: merged });
    const { error } = await supabase.rpc("move_card", { p_card: card.id, p_phase: to.id, p_patch: full });
    if (error) { b.patchCardLocal(card.id, { ...prev, data: card.data }); toast(errMsg(error), "err"); return false; }
    b.reload(["cards"]);
    return true;
  }

  async function request(card: Card, toId: string) {
    if (card.phase_id === toId) return;
    const from = b.phaseMap[card.phase_id]; const to = b.phaseMap[toId];
    if (!to) return;
    if (!b.canEdit) return toast("Você não tem permissão para mover cards neste board.", "err");
    if (from?.allowed_moves && !from.allowed_moves.includes(toId)) return toast(`Movimento não permitido de "${from.name}" para "${to.name}".`, "err");
    const st = evalRules(b.rules, card.data, cardCtx(card), card.phase_id);
    if (st.denied.has(toId) || st.denied.has("*")) return toast(`Movimento bloqueado pela regra "${st.denied.get(toId) ?? st.denied.get("*")}".`, "err");
    const visible = (f: Field) => !f.hidden && !st.hidden.has(f.id) && !COMPUTED_TYPES.includes(f.type);
    const missing = b.phaseFields(card.phase_id).filter((f) => visible(f) && (f.required || st.required.has(f.id)) && isEmpty(card.data[f.id]));
    const finalFields = to.is_final ? b.phaseFields(to.id).filter(visible) : [];
    const formFields = [...missing, ...finalFields.filter((f) => !missing.includes(f))];
    if (formFields.length) setPending({ card, to, fields: formFields });
    else await doMove(card, to);
  }

  const dialog = pending && <MoveDialog {...pending} onClose={() => setPending(null)} onConfirm={async (patch) => { if (await doMove(pending.card, pending.to, patch)) setPending(null); }} />;
  return { request, dialog };
}

function MoveDialog({ card, to, fields, onClose, onConfirm }: { card: Card; to: Phase; fields: Field[]; onClose: () => void; onConfirm: (patch: Record<string, any>) => Promise<void> }) {
  const { org, members } = useApp(); const b = useBoard();
  const [data, setData] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(false);
  const merged = { ...card.data, ...data };
  return (
    <Modal open onClose={onClose} title={<>Mover para <span style={{ color: to.color }}>{to.name}</span></>}
      footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" loading={busy} onClick={async () => { setBusy(true); await onConfirm(data); setBusy(false); }}>{to.is_final ? "Finalizar card" : "Mover card"}</Button></>}>
      <p className="mb-4 text-sm text-ink-3">{to.is_final ? "Preencha o formulário para finalizar o card." : "Complete os campos obrigatórios antes de avançar."}</p>
      <FieldList fields={fields} data={merged} onSave={(id, v) => setData((d) => ({ ...d, [id]: v }))} ctx={{ orgId: org.id, members, tags: b.tags, folder: card.id }} />
    </Modal>
  );
}
