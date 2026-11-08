"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export function Button({ variant = "secondary", size = "md", className, loading, children, ...p }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; loading?: boolean }) {
  const v = {
    primary: "bg-action text-white hover:bg-action-dark shadow-[0_1px_2px_rgba(91,63,230,.25),inset_0_1px_0_rgba(255,255,255,.12)]",
    secondary: "bg-white border border-line text-ink hover:border-[#DFDCE8] hover:bg-soft",
    ghost: "text-ink-2 hover:bg-line-2 hover:text-ink",
    danger: "bg-white border border-line text-red-600 hover:border-red-200 hover:bg-red-50",
    soft: "bg-lilac text-action hover:bg-[#E6E0FF]",
  }[variant];
  return (
    <button {...p} disabled={p.disabled || loading}
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-[13px]", v, className)}>
      {loading && <Spinner small />}{children}
    </button>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", small ? "h-3.5 w-3.5" : "h-5 w-5 text-action")} />;
}
export function PageLoader() { return <div className="flex h-64 items-center justify-center"><Spinner /></div>; }

export function Modal({ open, onClose, title, children, wide, full, footer }:
  { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; wide?: boolean; full?: boolean; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#15102B]/25 p-2 backdrop-blur-[2px] sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("relative w-full rounded-[16px] bg-white shadow-pop", full ? "max-w-7xl" : wide ? "max-w-3xl" : "max-w-lg")}>
        {title && <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 transition hover:bg-line-2 hover:text-ink" aria-label="Fechar"><Icon name="x" /></button>
        </div>}
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line-2 bg-canvas/60 px-6 py-3.5 rounded-b-[16px]">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = "max-w-2xl" }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; width?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[#15102B]/20 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("flex h-full w-full flex-col bg-white shadow-pop", width)}>
        <div className="flex items-center justify-between px-6 pb-3 pt-5">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 transition hover:bg-line-2 hover:text-ink" aria-label="Fechar"><Icon name="x" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2 scroll-thin">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: React.ReactNode }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("flex gap-5 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]", className)}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cx("-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-[1.5px] py-2.5 text-[13px] font-semibold transition", value === t.id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex items-start gap-3", disabled ? "opacity-50" : "cursor-pointer")}>
      <button type="button" disabled={disabled} onClick={() => onChange(!checked)}
        className={cx("mt-0.5 h-[18px] w-8 shrink-0 rounded-full p-[2px] transition", checked ? "bg-action" : "bg-[#E2E0EA]")}>
        <span className={cx("block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition", checked && "translate-x-[14px]")} />
      </button>
      {label && <span className="text-[13px]"><span className="font-medium">{label}</span>{hint && <span className="mt-0.5 block text-xs text-ink-3">{hint}</span>}</span>}
    </label>
  );
}

export function Badge({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", !color && "bg-line-2 text-ink-2", className)}
    style={color ? { background: color + "17", color } : undefined}>{children}</span>;
}

export function Avatar({ name, size = 24, title }: { name?: string | null; size?: number; title?: string }) {
  const n = (name || "?").trim();
  const initials = n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
  return <span title={title ?? n} className="inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-white"
    style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${h} 70% 94%)`, color: `hsl(${h} 45% 38%)` }}>{initials}</span>;
}

export function Empty({ icon = "✦", title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-line bg-white px-6 py-14 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-line-2 text-lg text-ink-3">{icon}</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-[13px] text-ink-3">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint, required }: { label: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode; required?: boolean }) {
  return <div><span className="label">{label}{required && <span className="text-red-500"> *</span>}</span>{children}{hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}</div>;
}

export function Menu({ trigger, children, align = "right" }: { trigger: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && <div className={cx("absolute z-30 mt-1.5 min-w-52 rounded-[12px] bg-white p-1 shadow-pop", align === "right" ? "right-0" : "left-0")}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return <button onClick={onClick} className={cx("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-line-2", danger && "text-red-600")}>{children}</button>;
}

/** Cabeçalho de página padrão: título, descrição e ações. */
export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-[22px] font-bold">{title}</h1>{subtitle && <p className="mt-1 text-[13px] text-ink-3">{subtitle}</p>}</div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

// -------- toasts --------
type Toast = { id: number; msg: string; kind: "ok" | "err" };
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "err" ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="flex items-start gap-2.5 rounded-[12px] bg-ink px-4 py-3 text-[13px] font-medium text-white shadow-pop">
            <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", t.kind === "err" ? "bg-red-400" : "bg-emerald-400")} />{t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
