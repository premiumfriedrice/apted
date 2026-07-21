"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
// (useSession is called once at the AppShell top so we can gate the whole tree
// on the resolved session before any page body mounts; SidebarInner receives
// the result as a prop.)
import { isAuthConfigured } from "@/lib/auth-config";

const SidebarCollapsedContext = createContext(false);
export function useSidebarCollapsed() {
  return useContext(SidebarCollapsedContext);
}

const SIDEBAR_NAV = [
  { href: "/resumes", label: "Resumes", icon: "folder_open" },
  { href: "/applications", label: "Applications", icon: "assignment_turned_in" },
  { href: "/master", label: "Master Resume", icon: "edit_note" },
];

const STORAGE_KEY = "apted:sidebar-collapsed";

// Shared button language (matches the master resume editor header).
const sideBtnCls =
  "flex items-center gap-1 px-3 w-full text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const sideActiveBtnCls =
  "flex items-center gap-1 px-3 w-full text-on-surface text-label-md font-label-md bg-surface-container-high font-semibold rounded";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  async function logout() {
    setProfileOpen(false);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const authed = !!isAuthConfigured();
  // authed is a build-time constant (NEXT_PUBLIC_AUTH_ENABLED) so the value is
  // identical on server and client — no hydration mismatch from branching on it.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: session, isPending } = authed ? useSession() : { data: null, isPending: false };

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === "1");
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed, mounted]);

  const isAuthPage = pathname === "/login" || pathname === "/signup";

  // When real auth is on and there's no session, bounce anonymous visitors to
  // the auth pages instead of rendering page bodies that'll 401 on their API
  // fetches (which throws during render). The first user has signed up, so
  // returnees land on /login (not /signup).
  useEffect(() => {
    if (authed && !isPending && !session && !isAuthPage) {
      router.replace("/login");
    }
  }, [authed, isPending, session, isAuthPage, router]);

  // Auth pages render edge-to-edge with NO sidebar (AuthForm centers itself).
  if (isAuthPage) {
    return <>{children}</>;
  }

  // Until the session resolves (or we redirect), render nothing. This BLOCKS
  // children from mounting, so the dashboard's `/api/versions` fetch never
  // fires and never throws `N is not iterable` on a 401.
  if (authed && !session) {
    return null;
  }

  const sidebarWidth = collapsed ? "w-12" : "w-64";
  const mainLeft = collapsed ? "ml-12" : "ml-64";

  // When collapsed, the whole sidebar rail is a click target to expand. The
  // inner links/brand call stopPropagation so they keep working; they share the
  // same bg-surface-container-low hover token, so the rail shows a uniform
  // affordance on hover instead of clashing.
  const asideCls = collapsed
    ? `${sidebarWidth} cursor-pointer hover:bg-surface-container-low`
    : sidebarWidth;

  // Full-bleed routes keep the sidebar but render edge-to-edge with no page
  // padding so they can manage their own split-pane layouts.
  // /applications/new is a form, not a split-pane, so it keeps page padding.
  const flush =
    pathname === "/master" ||
    pathname.startsWith("/resumes/") ||
    (pathname.startsWith("/applications/") && pathname !== "/applications/new");
  if (flush) {
    return (
      <SidebarCollapsedContext.Provider value={collapsed}>
        <div className="h-screen overflow-hidden bg-surface text-on-background">
          <aside
            onClick={collapsed ? () => setCollapsed(false) : undefined}
            title={collapsed ? "Click to expand sidebar" : undefined}
            className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-outline-variant bg-surface-white transition-[width] duration-200 ease-out overflow-hidden ${asideCls}`}
          >
            <SidebarInner
              pathname={pathname}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              session={session}
              onOpenProfile={() => setProfileOpen(true)}
            />
          </aside>
          <div className={`h-full transition-[margin] duration-200 ease-out ${mainLeft}`}>
            {children}
          </div>
          <ProfileMenu
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            session={session}
            collapsed={collapsed}
            onSignOut={logout}
          />
        </div>
      </SidebarCollapsedContext.Provider>
    );
  }

  return (
    <SidebarCollapsedContext.Provider value={collapsed}>
      <div className="min-h-screen bg-surface text-on-background">
        {/* Sidebar */}
        <aside
          onClick={collapsed ? () => setCollapsed(false) : undefined}
          title={collapsed ? "Click to expand sidebar" : undefined}
          className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-outline-variant bg-surface-white transition-[width] duration-200 ease-out overflow-hidden ${asideCls}`}
        >
          <SidebarInner
            pathname={pathname}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            session={session}
            onOpenProfile={() => setProfileOpen(true)}
          />
        </aside>

        {/* Main content */}
        <main className={`min-h-screen p-margin-desktop transition-[margin] duration-200 ease-out ${mainLeft}`}>
          {children}
        </main>
        <ProfileMenu
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          session={session}
          collapsed={collapsed}
          onSignOut={logout}
        />
      </div>
    </SidebarCollapsedContext.Provider>
  );
}

function SidebarInner({
  pathname,
  collapsed,
  setCollapsed,
  session,
  onOpenProfile,
}: {
  pathname: string;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  session: { user?: { name?: string | null; email?: string | null } } | null;
  onOpenProfile: () => void;
}) {
  const authed = !!isAuthConfigured();
  const user = session?.user;
  const initials = user?.name
    ? user.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase()
    : user?.email
      ? user.email[0].toUpperCase()
      : "AU";
  // Local mode (no BETTER_AUTH_SECRET): show "Apted User" / "Local mode" like before.
  const displayName = authed ? (user?.name ?? user?.email ?? "-") : "Apted User";
  const displayTier = authed ? (user?.email ?? "") : "Local mode";

  return (
    <>
      {/* Brand area: always centered in w-12, text overflows when expanded */}
      <div className="flex h-12 shrink-0 items-center">
        <div className="flex w-12 shrink-0 items-center justify-center">
          <Link
            href="/"
            title="apted"
            onClick={(e) => e.stopPropagation()}
            className="text-[28px] font-medium tracking-tight leading-none flex items-center justify-center pb-1 text-on-surface"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            {collapsed ? "a" : "apted"}
          </Link>
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface mr-sm"
          >
            <CollapseIcon />
          </button>
        )}
      </div>
      {/* Nav: icons always centered in w-12, text overflows when expanded */}
      <nav className="flex-1 pt-sm space-y-sm">
        {SIDEBAR_NAV.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={collapsed ? (e) => e.stopPropagation() : undefined}
              className={`flex items-center py-sm transition-colors duration-200 ${
                isActive ? sideActiveBtnCls : sideBtnCls
              } ${collapsed ? "mx-0 px-0" : "mx-sm px-sm"}`}
            >
              <span className="flex w-12 shrink-0 items-center justify-center">
                <MaterialIcon name={item.icon} className="text-[20px]" />
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: profile trigger. Avatar always centered in w-12. No extra bottom padding. */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenProfile(); }}
          title="Open profile menu"
          aria-label="Open profile menu"
          className={`flex items-center border-t border-outline-variant pt-sm text-left transition-colors hover:bg-surface-container-low ${collapsed ? "px-0 pb-sm" : "px-sm pb-sm"}`}
        >
          <span className="flex w-12 shrink-0 items-center justify-center">
            <span className="flex py-sm px-sm items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
              <span className="text-label-sm font-bold text-secondary">{initials}</span>
            </span>
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block font-label-md text-label-md truncate leading-tight">{displayName}</span>
              <span className="block text-label-sm text-on-surface-variant truncate leading-tight">{displayTier}</span>
            </span>
          )}
        </button>
      </div>
    </>
  );
}

function sideIconBtnCls(active: boolean): string {
  return active
    ? "bg-surface-container-high text-on-surface"
    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface";
}

const MENU_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/usage", label: "Usage Policy" },
  { href: "/terms", label: "Terms of Service" },
] as const;

function ProfileMenu({
  open,
  onClose,
  session,
  collapsed,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  session: { user?: { name?: string | null; email?: string | null } } | null;
  collapsed: boolean;
  onSignOut: () => void;
}) {
  const authed = !!isAuthConfigured();
  const user = session?.user;
  const initials = user?.name
    ? user.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase()
    : user?.email
      ? user.email[0].toUpperCase()
      : "AU";
  const displayName = authed ? (user?.name ?? user?.email ?? "-") : "Apted User";
  const displayTier = authed ? (user?.email ?? "") : "Local mode";

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Close the menu whenever the sidebar collapses/expands so the popover
  // never ends up anchored to the wrong rail width.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  if (!open) return null;

  // Anchor the popover to the bottom-left, opening upward over the sidebar
  // footer. Expanded sidebar is w-64 (256px); collapsed is w-12 (48px).
  const anchorLeft = collapsed ? "left-2" : "left-4";
  const width = collapsed ? "w-64" : "w-56";

  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose} role="presentation">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-16 ${anchorLeft} ${width} overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg`
        }
        role="menu"
        aria-label="Profile menu"
      >
        {/* Header: avatar + name + email */}
        <div className="flex items-center gap-sm border-b border-outline-variant px-md py-sm">
          <span className="flex py-sm px-sm shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
            <span className="text-label-sm font-bold text-secondary">{initials}</span>
          </span>
          <div className="min-w-0">
            <p className="font-label-md text-label-md truncate leading-tight text-on-surface">{displayName}</p>
            <p className="text-label-sm text-on-surface-variant truncate leading-tight">{displayTier}</p>
          </div>
        </div>

        {/* Menu links */}
        <nav className="py-xs" onClick={onClose}>
          <Link
            href="/settings"
            className="flex w-full items-center gap-sm px-md py-sm text-left text-body-md text-on-surface transition-colors hover:bg-surface-container-low"
            role="menuitem"
          >
            <MaterialIcon name="settings" className="text-[20px] text-on-surface-variant" />
            Settings
          </Link>
          <button
            type="button"
            disabled
            className="flex w-full items-center gap-sm px-md py-sm text-left text-body-md text-on-surface-variant"
            role="menuitem"
            title="Coming soon"
          >
            <MaterialIcon name="workspace_premium" className="text-[20px] text-on-surface-variant" />
            <span className="flex-1">Upgrade plan</span>
            <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Soon</span>
          </button>
        </nav>

        {/* Learn more section */}
        <div className="border-t border-outline-variant py-xs">
          <p className="px-md py-xs text-label-sm uppercase tracking-wider text-on-surface-variant">Learn more</p>
          {MENU_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={onClose}
              className="flex w-full items-center gap-sm px-md py-sm text-left text-body-md text-on-surface transition-colors hover:bg-surface-container-low"
              role="menuitem"
            >
              <MaterialIcon name="article" className="text-[20px] text-on-surface-variant" />
              {l.label}
            </Link>
          ))}
        </div>

        {/* Sign out */}
        {authed && user && (
          <div className="border-t border-outline-variant p-xs">
            <button
              type="button"
              onClick={onSignOut}
              className="flex w-full items-center gap-sm px-md py-sm text-left text-body-md text-error transition-colors hover:bg-error-container"
              role="menuitem"
            >
              <MaterialIcon name="logout" className="text-[20px]" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CollapseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <polyline points="15 10 13 12 15 14" transform="translate(-2 0)" />
    </svg>
  );
}

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{ fontFamily: "'Material Symbols Outlined', sans-serif", fontSize: "20px", fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
    >
      {name}
    </span>
  );
}
