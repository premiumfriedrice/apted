"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SIDEBAR_NAV = [
  { href: "/", label: "Library", icon: "folder_open" },
  { href: "/master", label: "Editor", icon: "edit_note" },
  { href: "/applications", label: "Applications", icon: "assignment_turned_in", disabled: true },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-surface text-on-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-border-subtle bg-surface-white py-margin-desktop">
        <div className="mb-8 px-6">
          <Link href="/" className="text-[28px] font-black tracking-tighter text-primary" style={{ fontFamily: "'Outfit', sans-serif" }}>
            apted
          </Link>
          <p className="mt-1 font-label-md text-label-md uppercase tracking-widest text-secondary">
            Career Manager
          </p>
        </div>

        <nav className="flex-1 space-y-1 px-4">
          {SIDEBAR_NAV.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return item.disabled ? (
              <span
                key={item.href}
                className="flex cursor-not-allowed items-center gap-3 rounded px-3 py-2 text-secondary opacity-60 transition-colors"
              >
                <MaterialIcon name={item.icon} />
                <span className="font-label-md text-label-md">{item.label}</span>
              </span>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 border-r-2 px-3 py-2 transition-colors ${
                  isActive
                    ? "border-primary font-bold text-primary"
                    : "border-transparent text-secondary hover:bg-surface-container-low hover:text-primary"
                }`}
              >
                <MaterialIcon name={item.icon} />
                <span className="font-label-md text-label-md">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-6 px-4">
          <button className="flex w-full items-center justify-center gap-2 rounded bg-primary py-3 text-label-md font-bold text-on-primary transition-all hover:opacity-90 active:scale-[0.98]">
            <MaterialIcon name="add" className="text-[18px]" />
            New Application
          </button>

          <div className="flex items-center gap-3 border-t border-border-subtle px-2 pt-6">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-container-highest">
              <span className="text-sm font-bold text-secondary">AU</span>
            </div>
            <div className="overflow-hidden">
              <p className="font-label-md text-label-md truncate">Apted User</p>
              <p className="text-xs text-secondary truncate">Free Tier</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Top app bar */}
      <header className="fixed left-64 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border-subtle bg-surface-white px-margin-desktop">
        <div className="flex flex-1 max-w-xl items-center gap-4">
          <div className="relative w-full">
            <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-secondary" />
            <input
              type="text"
              placeholder="Search resumes, companies, or roles..."
              className="w-full rounded-none border border-border-subtle bg-surface-container-lowest py-2 pl-10 pr-4 text-body-md outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 bg-primary px-5 py-2 text-label-md font-bold text-on-primary transition-opacity hover:opacity-90">
            Create New
          </button>
          <div className="ml-2 flex items-center gap-1 border-l border-border-subtle pl-4">
            <button className="p-2 text-secondary transition-colors hover:bg-surface-container-low">
              <MaterialIcon name="notifications" />
            </button>
            <button className="p-2 text-secondary transition-colors hover:bg-surface-container-low">
              <MaterialIcon name="help_outline" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="ml-64 min-h-[calc(100vh-64px)] p-margin-desktop pt-[calc(64px+32px)]">
        {children}
      </main>
    </div>
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
