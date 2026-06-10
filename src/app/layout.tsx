import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "apted",
  description: "Tailor your resume to a job description and refine it via chat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">apted</Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-600">
              <Link href="/" className="hover:text-neutral-900">Library</Link>
              <Link href="/builder" className="hover:text-neutral-900">Builder</Link>
              <Link href="/master"  className="hover:text-neutral-900">Master</Link>
              <Link href="/settings" className="hover:text-neutral-900">Settings</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
