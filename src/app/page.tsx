"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Version = {
  id: string;
  company: string;
  role: string;
  jobDescription: string;
  tailoredContent: unknown;
  outcome: "draft" | "applied" | "interview" | "offer" | "rejected";
  createdAt: string;
};

const OUTCOMES = ["all", "draft", "applied", "interview", "offer", "rejected"] as const;

export default function Home() {
  const [filter, setFilter] = useState<(typeof OUTCOMES)[number]>("all");
  const [items, setItems] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);

  useEffect(() => {
    const url = filter === "all" ? "/api/versions" : `/api/versions?outcome=${filter}`;
    fetch(url).then((r) => r.json()).then(setItems);
  }, [filter]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Library</h1>
          <div className="flex gap-1">
            {OUTCOMES.map((o) => (
              <button
                key={o}
                onClick={() => setFilter(o)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  filter === o
                    ? "bg-neutral-900 text-white"
                    : "border border-neutral-300"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className="rounded-md border border-neutral-200 bg-white p-4 text-left hover:border-neutral-400"
            >
              <div className="text-sm font-semibold">{v.company}</div>
              <div className="text-sm text-neutral-600">{v.role}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-neutral-500">
                <span className="capitalize">{v.outcome}</span>
                <span>{new Date(v.createdAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
          {items.length === 0 && (
            <div className="col-span-full rounded-md border border-dashed border-neutral-300 p-8 text-center">
              <p className="text-sm text-neutral-500">No saved versions yet.</p>
              <Link
                href="/builder"
                className="mt-3 inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
              >
                Start your first tailor
              </Link>
            </div>
          )}
        </div>

        {selected && (
          <div
            className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-6"
            onClick={() => setSelected(null)}
          >
            <div
              className="grid h-full max-h-[90vh] w-full max-w-5xl grid-cols-[1fr_1fr] gap-0 overflow-hidden rounded-lg bg-white"
              onClick={(e) => e.stopPropagation()}
            >
              <section className="overflow-auto border-r border-neutral-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{selected.company}</div>
                    <div className="text-xs text-neutral-600">{selected.role}</div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-xs text-neutral-500"
                  >
                    Close
                  </button>
                </div>
                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Job description
                </h3>
                <pre className="mt-1 whitespace-pre-wrap text-xs">
                  {selected.jobDescription}
                </pre>
              </section>
              <section className="overflow-auto bg-neutral-100">
                <pre className="p-3 text-[11px]">
                  {JSON.stringify(selected.tailoredContent, null, 2)}
                </pre>
              </section>
            </div>
          </div>
        )}
    </main>
  );
}
