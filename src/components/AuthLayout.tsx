import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <Logo dark size="lg" />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight">Seu processo comercial,<br /><span className="text-brand">montado pela tela.</span></h1>
          <p className="mt-4 max-w-md text-white/70">Boards, fases, campos, regras e automações sem código. Multiempresa desde o primeiro dia.</p>
        </div>
        <div className="text-sm text-white/50">Domma Tecnologia</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-extrabold">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
