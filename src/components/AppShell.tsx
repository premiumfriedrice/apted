"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SIDEBAR_NAV = [
  { href: "/", label: "Resumes", icon: "folder_open" },
  { href: "/master", label: "Master Resume", icon: "edit_note" },
  { href: "/applications", label: "Applications", icon: "assignment_turned_in" },
];

const SETTINGS_NAV = { href: "/settings", label: "Settings", icon: "settings" };

const STORAGE_KEY = "apted:sidebar-collapsed";

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

  const sidebarWidth = collapsed ? "w-16" : "w-64";
  const topbarLeft = collapsed ? "left-16" : "left-64";
  const mainLeft = collapsed ? "ml-16" : "ml-64";

  // The master editor keeps the global sidebar but renders full-bleed with
  // its own headers and split pane — no shell topbar or page padding.
  if (pathname === "/master") {
    return (
      <div className="h-screen overflow-hidden bg-surface text-on-background">
        <aside className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-outline-variant bg-surface-white py-lg transition-[width] duration-200 ${sidebarWidth}`}>
          <SidebarInner pathname={pathname} collapsed={collapsed} setCollapsed={setCollapsed} />
        </aside>
        <div className={`h-full transition-[margin] duration-200 ${mainLeft}`}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-on-background">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-outline-variant bg-surface-white py-lg transition-[width] duration-200 ${sidebarWidth}`}>
        <SidebarInner pathname={pathname} collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>

      {/* Top app bar */}
      <header className={`fixed top-0 right-0 z-40 flex h-16 items-center justify-between border-b border-outline-variant bg-surface-white px-margin-desktop transition-[left] duration-200 ${topbarLeft}`}>
        <div className="flex flex-1 items-center gap-4">
          <div className="flex max-w-xl flex-1 items-center gap-4">
            <div className="relative w-full">
              <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search resumes, companies, or roles..."
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest py-2 pl-10 pr-4 text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary transition-colors duration-200 hover:bg-on-primary-fixed-variant">
            Create New
          </button>
          <div className="ml-2 flex items-center gap-1 border-l border-outline-variant pl-4">
            <button className="rounded p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low">
              <MaterialIcon name="notifications" />
            </button>
            <button className="rounded p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low">
              <MaterialIcon name="help_outline" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className={`min-h-screen p-margin-desktop pt-[calc(64px+32px)] transition-[margin] duration-200 ${mainLeft}`}>
        {children}
      </main>
    </div>
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
      {/* Brand + collapse */}
      <div className={`mb-6 flex items-center ${collapsed ? "justify-center px-0" : "justify-between px-6"}`}>
        {collapsed ? (
          <Link href="/" className="text-[22px] font-medium tracking-tight text-on-surface" style={{ fontFamily: "'Outfit', sans-serif" }}>
            a
          </Link>
        ) : (
          <Link href="/" className="text-[22px] font-medium tracking-tight text-on-surface" style={{ fontFamily: "'Outfit', sans-serif" }}>
            apted
          </Link>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            className="rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
          >
            <CollapseIcon />
          </button>
        )}
      </div>
      {!collapsed && (
        <p className="mb-6 px-6 font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">
          Career Manager
        </p>
      )}

      {/* Collapse-expand button when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="mx-auto mb-6 rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
        >
          <ExpandIcon />
        </button>
      )}

      <nav className={`flex-1 space-y-1 ${collapsed ? "px-0" : "px-4"}`}>
        {SIDEBAR_NAV.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group flex items-center rounded border-r-2 py-2 transition-colors duration-200 ${
                collapsed ? "justify-center px-0" : "gap-3 px-3"
              } ${
                isActive
                  ? "border-primary text-on-surface font-semibold"
                  : "border-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
            >
              <MaterialIcon name={item.icon} className={collapsed ? "text-[22px]" : "text-[20px]"} />
              {!collapsed && <span className="font-label-md text-label-md">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-4 px-0">
        {/* Settings */}
        <Link
          href={SETTINGS_NAV.href}
          title={collapsed ? SETTINGS_NAV.label : undefined}
          className={`group flex items-center rounded py-2 transition-colors duration-200 ${
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          } ${
            pathname === SETTINGS_NAV.href
              ? "bg-surface-container-low text-on-surface font-semibold"
              : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
          }`}
        >
          <MaterialIcon name={SETTINGS_NAV.icon} className={collapsed ? "text-[22px]" : "text-[20px]"} />
          {!collapsed && <span className="font-label-md text-label-md">{SETTINGS_NAV.label}</span>}
        </Link>

        {/* New Application */}
        <div className={collapsed ? "flex justify-center" : "px-4"}>
          <button
            title={collapsed ? "New Application" : undefined}
            className={`inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-label-md font-label-md text-on-primary transition-colors duration-200 hover:bg-on-primary-fixed-variant ${collapsed ? "w-10 px-0" : "w-full"}`}
          >
            <MaterialIcon name="add" className="text-[18px]" />
            {!collapsed && <span>New Application</span>}
          </button>
        </div>

        {/* Profile */}
        {collapsed ? (
          <div className="flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
              <span className="text-sm font-bold text-secondary">AU</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 border-t border-outline-variant px-2 pt-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest">
              <span className="text-sm font-bold text-secondary">AU</span>
            </div>
            <div className="overflow-hidden">
              <p className="font-label-md text-label-md truncate">Apted User</p>
              <p className="text-xs text-on-surface-variant truncate">Free Tier</p>
            </div>
          </div>
        )}
      </div>
    </>
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

function ExpandIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <polyline points="11 10 13 12 11 14" transform="translate(2 0)" />
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