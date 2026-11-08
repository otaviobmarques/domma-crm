"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import { AuthLayout } from "@/components/AuthLayout";
import { Button, PageLoader, cx, useToast } from "@/components/ui";
import { useSession } from "@/components/AppShell";
import { TEMPLATES } from "@/lib/templates";

function Onboarding() {
  const session = useSession(); const router = useRouter(); const sp = useSearchParams(); const toast = useToast();
  const [name, setName] = useState(""); const [segment, setSegment] = useState("Automotivo"); const [tpl, setTpl] = useState("franquias");
  const [loading, setLoading] = useState(false); const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (session === null) router.replace("/login?next=/onboarding");
    if (!session) return;
    setName((n) => n || String(session.user.user_metadata?.company ?? ""));
    if (sp.get("new")) { setChecked(true); return; }
    supabase.from("memberships").select("org_id").eq("user_id", session.user.id).then(({ data }) => {
      if (data && data.length > 0) router.replace("/"); else setChecked(true);
    });
  }, [session, router, sp]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    try {
      const { data: org, error } = await supabase.rpc("create_organization", { p_name: name, p_segment: segment });
      if (error) throw error;
      localStorage.setItem("domma.org", org as string);
      if (tpl !== "none") {
        const t = TEMPLATES.find((x) => x.id === tpl)!;
        const { data: b, error: e2 } = await supabase.rpc("create_board", { p_org: org, p_name: t.name === "Em branco" ? "Meu primeiro board" : t.name, p_icon: t.icon, p_color: "#5B3FE6", p_template: tpl });
        if (e2) throw e2;
        window.location.href = `/b/${b}`;
      } else window.location.href = "/";
    } catch (err) { toast(errMsg(err), "err"); setLoading(false); }
  }
  if (!checked) return <PageLoader />;
  return (
    <AuthLayout title="Crie sua organização" subtitle="A organização é a sua empresa no Domma CRM. Você pode criar outras depois.">
      <form onSubmit={submit} className="space-y-4">
        <div><label className="label">Nome da organização</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Auto Visão Vistorias" /></div>
        <div><label className="label">Segmento</label>
          <select className="input" value={segment} onChange={(e) => setSegment(e.target.value)}>
            {["Automotivo", "Franquias", "Serviços", "Varejo", "Imobiliário", "Educação", "Saúde", "Outro"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <span className="label">Primeiro board</span>
          <div className="space-y-2">
            {TEMPLATES.map((t) => (
              <button type="button" key={t.id} onClick={() => setTpl(t.id)} className={cx("flex w-full gap-3 rounded-[12px] border p-3 text-left transition", tpl === t.id ? "border-action bg-lilac/50" : "border-line hover:bg-soft")}>
                <span className="text-2xl">{t.icon}</span><span><span className="block text-sm font-bold">{t.name}</span><span className="block text-xs text-ink-3">{t.desc}</span></span>
              </button>
            ))}
          </div>
        </div>
        <Button variant="primary" className="w-full" loading={loading}>Começar</Button>
      </form>
    </AuthLayout>
  );
}
export default function Page() { return <Suspense><Onboarding /></Suspense>; }
