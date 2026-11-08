"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import { AuthLayout } from "@/components/AuthLayout";
import { Button, useToast } from "@/components/ui";

export default function Signup() {
  const router = useRouter(); const toast = useToast();
  const [f, setF] = useState({ full_name: "", email: "", phone: "", birth_date: "", company: "", password: "", terms: false });
  const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.terms) return toast("Aceite os termos de uso e a política de privacidade.", "err");
    if (f.password.length < 8) return toast("A senha precisa de pelo menos 8 caracteres.", "err");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: { emailRedirectTo: `${location.origin}/onboarding`, data: { full_name: f.full_name, phone: f.phone, birth_date: f.birth_date, company: f.company, terms_accepted_at: new Date().toISOString() } },
    });
    setLoading(false);
    if (error) return toast(errMsg(error), "err");
    if (data.session) router.replace("/onboarding"); else setSent(true);
  }
  if (sent) return (
    <AuthLayout title="Confirme seu e-mail" subtitle={`Enviamos um link de confirmação para ${f.email}.`}>
      <p className="text-sm text-ink-2">Abra o e-mail e clique no link para ativar a conta. Depois você cria sua organização e o primeiro board.</p>
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-action">Ir para o login</Link>
    </AuthLayout>
  );
  return (
    <AuthLayout title="Criar conta" subtitle="Teste o Domma CRM com sua equipe.">
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label">Nome completo</label><input className="input" required value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div><label className="label">E-mail</label><input className="input" type="email" required value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Telefone</label><input className="input" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" /></div>
          <div><label className="label">Nascimento</label><input className="input" type="date" value={f.birth_date} onChange={(e) => set("birth_date", e.target.value)} /></div>
        </div>
        <div><label className="label">Nome da empresa</label><input className="input" value={f.company} onChange={(e) => set("company", e.target.value)} /></div>
        <div><label className="label">Senha</label><input className="input" type="password" required minLength={8} value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" /></div>
        <label className="flex items-start gap-2 text-xs text-ink-2"><input type="checkbox" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} className="mt-0.5" />Li e aceito os termos de uso e a política de privacidade (LGPD).</label>
        <Button variant="primary" className="w-full" loading={loading}>Criar conta</Button>
      </form>
      <div className="mt-5 text-sm">Já tem conta? <Link href="/login" className="font-semibold text-action">Entrar</Link></div>
    </AuthLayout>
  );
}
