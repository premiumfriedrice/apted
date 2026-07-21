"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  disabled?: boolean;
  title?: string;
};

const NAV: NavItem[] = [
  { href: "/", label: "Library" },
  { href: "/master", label: "Master" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="bg-surface-container-lowest w-full h-16 border-b border-outline-variant flex items-center px-lg shrink-0">
      <Link
        href="/"
        className="text-[22px] font-medium tracking-tight text-on-surface hover:opacity-80 transition-opacity"
        style={{ fontFamily: "'Outfit', sans-serif" }}
      >
        apted
      </Link>

      <nav className="ml-auto flex items-center gap-1" aria-label="Site">
        {NAV.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const baseCls =
            "relative px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200";
          const activeCls = isActive
            ? "text-on-surface font-semibold"
            : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low";

          if (item.disabled) {
            return (
              <span
                key={item.href}
                title={item.title}
                className={`${baseCls} ${activeCls} cursor-not-allowed opacity-60`}
              >
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${baseCls} ${activeCls}`}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded-full bg-on-surface" />
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
