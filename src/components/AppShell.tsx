"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Member, Organization, Profile, Role } from "@/lib/types";
import { Avatar, Menu, MenuItem, PageLoader, cx } from "./ui";
import { Logo } from "./Logo";
import { Icon } from "./Icon";
import { fmtDate } from "@/lib/fields";

interface AppCtx {
  session: Session; profile: Profile; orgs: (Organization & { role: Role })[]; org: Organization & { role: Role };
  role: Role; members: Member[]; memberMap: Record<string, Profile>; isPlatformAdmin: boolean;
  setOrgId: (id: string) => void; reloadOrgs: () => Promise<void>; reloadMembers: () => Promise<void>; reloadProfile: () => Promise<void>;
}
const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error("useApp fora do AppShell"); return c; };

export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

const NAV = [
  { href: "/", label: "Início", icon: "home" },
  { href: "/databases", label: "Databases", icon: "database" },
  { href: "/automations", label: "Automações", icon: "zap" },
  { href: "/tasks", label: "Minhas tarefas", icon: "check" },
  { href: "/ai", label: "IA", icon: "sparkles" },
  { href: "/settings", label: "Configurações", icon: "settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orgs, setOrgs] = useState<(Organization & { role: Role })[] | null>(null);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isPlatformAdmin, setPA] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const reloadOrgs = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;
    const { data } = await supabase.from("memberships").select("role, organizations(*)").eq("user_id", uid);
    const list = (data ?? []).filter((m: any) => m.organizations).map((m: any) => ({ ...m.organizations, role: m.role })) as (Organization & { role: Role })[];
    list.sort((a, b) => a.name.localeCompare(b.name));
    setOrgs(list);
    const saved = typeof window !== "undefined" ? localStorage.getItem("domma.org") : null;
    setOrgIdState((cur) => (cur && list.some((o) => o.id === cur) ? cur : saved && list.some((o) => o.id === saved) ? saved : list[0]?.id ?? null));
  }, []);
  const reloadProfile = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id; if (!uid) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
    setProfile(data as Profile);
    const pa = await supabase.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle();
    setPA(!!pa.data);
  }, []);

  useEffect(() => {
    if (session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (session) { reloadProfile(); reloadOrgs(); }
  }, [session, router, pathname, reloadOrgs, reloadProfile]);

  useEffect(() => {
    if (orgs && orgs.length === 0 && !pathname.startsWith("/admin")) router.replace("/onboarding");
  }, [orgs, pathname, router]);

  const reloadMembers = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from("memberships").select("user_id, role, profiles(id, email, full_name, avatar_url, phone)").eq("org_id", orgId);
    setMembers((data ?? []).map((m: any) => ({ user_id: m.user_id, role: m.role, profile: m.profiles })).filter((m) => m.profile));
  }, [orgId]);
  useEffect(() => { reloadMembers(); }, [reloadMembers]);

  const setOrgId = (id: string) => { localStorage.setItem("domma.org", id); setOrgIdState(id); router.push("/"); };
  const org = orgs?.find((o) => o.id === orgId);
  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.profile])), [members]);

  if (!session || !profile || !orgs) return <PageLoader />;
  if (!org) {
    if (pathname.startsWith("/admin") && isPlatformAdmin) return <Ctx.Provider value={{ session, profile, orgs, org: { id: "", name: "—", role: "admin" } as any, role: "admin", members, memberMap, isPlatformAdmin, setOrgId, reloadOrgs, reloadMembers, reloadProfile }}>{children}</Ctx.Provider>;
    return <PageLoader />;
  }

  const value: AppCtx = { session, profile, orgs, org, role: org.role, members, memberMap, isPlatformAdmin, setOrgId, reloadOrgs, reloadMembers, reloadProfile };
  const nav = [...NAV, ...(isPlatformAdmin ? [{ href: "/admin", label: "Super Admin", icon: "shield" }] : [])];

  return (
    <Ctx.Provider value={value}>
      <div className="flex min-h-screen">
        <aside className={cx("fixed bottom-2 left-2 top-2 z-40 w-14 shrink-0 flex-col items-center rounded-[16px] bg-[#111014] py-3 shadow-[0_4px_16px_rgba(0,0,0,.18)] lg:sticky lg:top-2 lg:my-2 lg:ml-2 lg:h-[calc(100vh-16px)] lg:flex", mobileNav ? "flex" : "hidden")}>
          <Link href="/" onClick={() => setMobileNav(false)} className="mb-5" aria-label="Início"><img src="/icon-192.png" alt="Domma" className="h-8 w-8 rounded-[9px]" /></Link>
          <nav className="flex flex-col items-center gap-1">
            {nav.filter((n) => n.href !== "/settings").map((n) => <RailLink key={n.href} n={n} pathname={pathname} onClick={() => setMobileNav(false)} />)}
          </nav>
          <div className="mt-auto flex flex-col items-center gap-1">
            <RailLink n={{ href: "/settings", label: "Configurações", icon: "settings" }} pathname={pathname} onClick={() => setMobileNav(false)} />
            <RailLink n={{ href: "/settings?tab=api", label: "Ajuda", icon: "help" }} pathname="" onClick={() => setMobileNav(false)} />
          </div>
        </aside>
        {mobileNav && <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setMobileNav(false)} />}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="header-glass sticky top-0 z-20 flex h-14 items-center gap-2 px-3 sm:px-5">
            <button className="rounded-lg p-2 text-ink-2 lg:hidden" onClick={() => setMobileNav(true)} aria-label="Menu"><Icon name="menu" size={18} /></button>
            <Link href="/" className="shrink-0"><Logo /></Link>
            <div id="page-header-slot" className="flex min-w-0 flex-1 items-center gap-2" />
            <select className="input !h-8 !w-auto max-w-[200px] text-[13px] font-semibold" value={org.id} onChange={(e) => setOrgId(e.target.value)} aria-label="Organização ativa" title="Organização ativa">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <Notifications />
            <Menu trigger={<button className="ml-1 flex items-center rounded-full p-0.5 hover:bg-line-2" aria-label="Perfil"><Avatar name={profile.full_name || profile.email} size={30} /></button>}>
              {(close) => <>
                <div className="px-2.5 pb-2 pt-1.5 text-xs"><div className="font-semibold text-ink">{profile.full_name}</div><div className="text-ink-3">{profile.email}</div></div>
                <div className="my-1 h-px bg-line-2" />
                <MenuItem onClick={() => { close(); router.push("/settings"); }}><Icon name="settings" size={15} className="text-ink-3" />Minha conta</MenuItem>
                <MenuItem onClick={() => { close(); router.push("/onboarding?new=1"); }}><Icon name="plus" size={15} className="text-ink-3" />Nova organização</MenuItem>
                <MenuItem danger onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}><Icon name="logout" size={15} />Sair</MenuItem>
              </>}
            </Menu>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function RailLink({ n, pathname, onClick }: { n: { href: string; label: string; icon: string }; pathname: string; onClick: () => void }) {
  const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/b/") : pathname !== "" && pathname.startsWith(n.href.split("?")[0]);
  return (
    <Link href={n.href} onClick={onClick} aria-label={n.label}
      className={cx("group relative flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors", active ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/10 hover:text-white")}>
      <Icon name={n.icon} size={18} className={n.icon === "sparkles" ? "text-emerald-400" : ""} />
      <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-pop transition group-hover:opacity-100">{n.label}</span>
    </Link>
  );
}

/** Coloca conteúdo da página no topo global (ao lado do logo). */
export function HeaderSlot({ children }: { children: React.ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById("page-header-slot")); }, []);
  return el ? createPortal(children, el) : null;
}

function Notifications() {
  const { session } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(30);
    setItems(data ?? []);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel("notif-" + session.user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, session.user.id]);
  const unread = items.filter((i) => !i.read_at).length;
  return (
    <Menu trigger={<button className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-ink-2 hover:bg-line-2 hover:text-ink" aria-label="Notificações"><Icon name="bell" size={17} />{unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 text-[10px] font-bold text-white ring-2 ring-canvas">{unread}</span>}</button>}>
      {(close) => (
        <div className="w-80 max-w-[90vw]">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-bold">Notificações</span>
            {unread > 0 && <button className="text-xs font-semibold text-action" onClick={async () => { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); load(); }}>Marcar todas como lidas</button>}
          </div>
          <div className="max-h-96 overflow-y-auto scroll-thin">
            {items.length === 0 && <div className="p-6 text-center text-sm text-ink-3">Nada por aqui.</div>}
            {items.map((n) => (
              <button key={n.id} className={cx("block w-full border-b border-line px-3 py-2.5 text-left hover:bg-soft", !n.read_at && "bg-lilac/40")}
                onClick={async () => {
                  close();
                  if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                  load();
                  if (n.board_id) router.push(`/b/${n.board_id}${n.card_id ? `?card=${n.card_id}` : ""}`);
                }}>
                <div className="text-sm font-semibold">{n.title}</div>
                {n.body && <div className="line-clamp-2 text-xs text-ink-2">{n.body}</div>}
                <div className="mt-0.5 text-[11px] text-ink-3">{fmtDate(n.created_at, true)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Menu>
  );
}
