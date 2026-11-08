"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import { useApp } from "@/components/AppShell";
import { Button, Empty, Modal, PageLoader, useToast } from "@/components/ui";
import type { Database } from "@/lib/types";

export default function Databases() {
  const { org, session } = useApp(); const router = useRouter(); const toast = useToast();
  const [list, setList] = useState<(Database & { count: number })[] | null>(null);
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    setList(null);
    supabase.from("databases").select("*").eq("org_id", org.id).is("deleted_at", null).order("name").then(async ({ data }) => {
      const counts = await Promise.all((data ?? []).map((d) => supabase.from("records").select("id", { count: "exact", head: true }).eq("database_id", d.id).is("deleted_at", null)));
      setList((data ?? []).map((d, i) => ({ ...(d as Database), count: counts[i].count ?? 0 })));
    });
  }, [org.id]);
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    const { data: db, error } = await supabase.from("databases").insert({ org_id: org.id, name: name.trim(), created_by: session.user.id }).select().single();
    if (error) { setBusy(false); return toast(errMsg(error), "err"); }
    const { data: f } = await supabase.from("fields").insert({ org_id: org.id, database_id: db.id, type: "short_text", label: "Nome", required: true, position: 0 }).select().single();
    await supabase.from("fields").insert([
      { org_id: org.id, database_id: db.id, type: "phone", label: "Telefone", position: 1, unique_value: true, options: { whatsapp: true } },
      { org_id: org.id, database_id: db.id, type: "email", label: "E-mail", position: 2, unique_value: true },
    ]);
    if (f) await supabase.from("databases").update({ settings: { title_field: f.id } }).eq("id", db.id);
    router.push(`/databases/${db.id}`);
  }
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[22px] font-bold">Databases</h1><p className="text-sm text-ink-3">Tabelas de registros reutilizáveis (contatos, clientes, unidades), ligadas aos cards por campo conectado.</p></div>
        <Button variant="primary" onClick={() => setOpen(true)}>+ Nova database</Button>
      </div>
      {!list ? <PageLoader /> : list.length === 0 ? <div className="mt-6"><Empty icon="🗂" title="Nenhuma database">Crie, por exemplo, “Interessados em Franquia” e conecte aos boards com o campo Database conectado.</Empty></div> : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Link key={d.id} href={`/databases/${d.id}`} className="flex items-center gap-3 rounded-[16px] border border-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-action/40">
              <span className="flex h-11 w-11 items-center justify-center rounded-[12px] text-xl" style={{ background: d.color + "1F" }}>{d.icon}</span>
              <span><span className="block font-bold">{d.name}</span><span className="num text-xs text-ink-3">{d.count.toLocaleString("pt-BR")} registros</span></span>
            </Link>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova database" footer={<><Button onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" loading={busy} onClick={create}>Criar</Button></>}>
        <label className="label">Nome</label><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="Ex.: Interessados em Franquia" />
        <p className="mt-2 text-xs text-ink-3">Começa com Nome, Telefone e E-mail (exclusivos, para deduplicar). Você monta o resto do formulário em seguida.</p>
      </Modal>
    </div>
  );
}
