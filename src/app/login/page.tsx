"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import { AuthLayout } from "@/components/AuthLayout";
import { Button, useToast } from "@/components/ui";

function LoginForm() {
  const router = useRouter(); const sp = useSearchParams(); const toast = useToast();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const next = sp.get("next") || "/";
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace(next); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) router.replace(next); });
    return () => data.subscription.unsubscribe();
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/settings?tab=user` });
      setLoading(false);
      return error ? toast(errMsg(error), "err") : toast("Enviamos um link para redefinir a senha.");
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast(errMsg(error), "err");
  }
  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/` } });
    if (error) toast(error.message.includes("not enabled") ? "Login com Google ainda não foi ativado no Supabase." : errMsg(error), "err");
  }
  return (
    <AuthLayout title={mode === "login" ? "Entrar" : "Recuperar senha"} subtitle={mode === "login" ? "Acesse sua organização no Domma CRM." : "Informe seu e-mail para receber o link."}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label">E-mail</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
        {mode === "login" && <div><label className="label">Senha</label><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>}
        <Button variant="primary" className="w-full" loading={loading}>{mode === "login" ? "Entrar" : "Enviar link"}</Button>
      </form>
      {mode === "login" && <Button className="mt-3 w-full" onClick={google}><span className="font-bold text-[#4285F4]">G</span> Entrar com Google</Button>}
      <div className="mt-5 flex justify-between text-sm">
        <button className="font-semibold text-action" onClick={() => setMode(mode === "login" ? "reset" : "login")}>{mode === "login" ? "Esqueci a senha" : "Voltar ao login"}</button>
        <Link href="/signup" className="font-semibold text-action">Criar conta</Link>
      </div>
    </AuthLayout>
  );
}
export default function Page() { return <Suspense><LoginForm /></Suspense>; }
