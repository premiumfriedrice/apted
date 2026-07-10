"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SidebarCollapsedContext = createContext(false);
export function useSidebarCollapsed() {
  return useContext(SidebarCollapsedContext);
}

const SIDEBAR_NAV = [
  { href: "/resumes", label: "Resumes", icon: "folder_open" },
  { href: "/applications", label: "Applications", icon: "assignment_turned_in" },
  { href: "/master", label: "Master Resume", icon: "edit_note" },
];

const SETTINGS_NAV = { href: "/settings", label: "Settings", icon: "settings" };

const STORAGE_KEY = "apted:sidebar-collapsed";

// Shared button language (matches the master resume editor header).
const sideBtnCls =
  "flex items-center gap-1 px-3 w-full text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded";
const sideActiveBtnCls =
  "flex items-center gap-1 px-3 w-full text-on-surface text-label-md font-label-md bg-surface-container-high font-semibold rounded";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

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
  const flush = pathname === "/master" || pathname.startsWith("/resumes/");
  if (flush) {
    return (
      <SidebarCollapsedContext.Provider value={collapsed}>
        <div className="h-screen overflow-hidden bg-surface text-on-background">
          <aside
            onClick={collapsed ? () => setCollapsed(false) : undefined}
            title={collapsed ? "Click to expand sidebar" : undefined}
            className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-outline-variant bg-surface-white transition-[width] duration-200 ease-out ${asideCls}`}
          >
            <SidebarInner pathname={pathname} collapsed={collapsed} setCollapsed={setCollapsed} />
          </aside>
          <div className={`h-full transition-[margin] duration-200 ease-out ${mainLeft}`}>
            {children}
          </div>
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
          className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-outline-variant bg-surface-white transition-[width] duration-200 ease-out ${asideCls}`}
        >
          <SidebarInner pathname={pathname} collapsed={collapsed} setCollapsed={setCollapsed} />
        </aside>

        {/* Main content */}
        <main className={`min-h-screen p-margin-desktop transition-[margin] duration-200 ease-out ${mainLeft}`}>
          {children}
        </main>
      </div>
    </SidebarCollapsedContext.Provider>
  );
}

function SidebarInner({
  pathname,
  collapsed,
  setCollapsed,
}: {
  pathname: string;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  return (
    <>
      {/* Brand — aligned with the collapsed 'a' square (h-12) */}
      <div className={`flex h-12 shrink-0 items-center ${collapsed ? "w-12 justify-center px-0" : "justify-between px-md"}`}>
        {collapsed ? (
          <Link
            href="/"
            title="apted"
            onClick={(e) => e.stopPropagation()}
            className="text-[28px] font-medium tracking-tight leading-none flex items-center justify-center pb-1 text-on-surface"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            a
          </Link>
        ) : (
          <>
            <Link href="/" className="text-[28px] font-medium tracking-tight text-on-surface" style={{ fontFamily: "'Outfit', sans-serif" }}>
              apted
            </Link>
            <button
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
            >
              <CollapseIcon />
            </button>
          </>
        )}
      </div>
      {/* Nav */}
      <nav className={`flex-1 ${collapsed ? "pt-0 space-y-0 px-0" : "pt-sm space-y-sm px-sm"}`}>
        {SIDEBAR_NAV.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={collapsed ? (e) => e.stopPropagation() : undefined}
              className={`flex items-center ${collapsed ? "py-1.5" : "py-sm"} transition-colors duration-200 ${
                collapsed ? sideIconBtnCls(isActive) : isActive ? sideActiveBtnCls : sideBtnCls
              } ${collapsed ? "justify-center w-full px-0" : ""}`}
            >
              <MaterialIcon name={item.icon} className={collapsed ? "text-[22px]" : "text-[20px]"} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer: Settings, compact profile */}
      <div className="shrink-0 space-y-sm px-0 pb-md">
        {collapsed ? (
          <div className="flex flex-col items-center gap-xs pt-xs">
            <Link
              href={SETTINGS_NAV.href}
              title={SETTINGS_NAV.label}
              onClick={(e) => e.stopPropagation()}
              className={`rounded p-1.5 transition-colors ${pathname === SETTINGS_NAV.href ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}
            >
              <MaterialIcon name={SETTINGS_NAV.icon} className="text-[22px]" />
            </Link>
            <Link
              href={SETTINGS_NAV.href}
              title="Profile"
              onClick={(e) => e.stopPropagation()}
              className="flex py-sm px-sm items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest text-secondary"
            >
              <span className="text-label-sm font-bold">AU</span>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-sm border-t border-outline-variant px-sm pt-sm">
            <div className="flex py-sm px-sm shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
              <span className="text-label-sm font-bold text-secondary">AU</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-label-md text-label-md truncate leading-tight">Apted User</p>
              <p className="text-label-sm text-on-surface-variant truncate leading-tight">Free Tier</p>
            </div>
            <Link
              href={SETTINGS_NAV.href}
              title={SETTINGS_NAV.label}
              className={`rounded p-1.5 transition-colors ${pathname === SETTINGS_NAV.href ? "bg-surface-container-high text-on-surface" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}
            >
              <MaterialIcon name={SETTINGS_NAV.icon} className="text-[20px]" />
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

function sideIconBtnCls(active: boolean): string {
  return active
    ? "bg-surface-container-high text-on-surface"
    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface";
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
