"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Option = { name: string; label: string };

export default function SettingsPage() {
  const [options, setOptions] = useState<Option[]>([]);
  const [template, setTemplate] = useState<string>("jake");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { settings: { template: string }; options: Option[] }) => {
        setOptions(d.options);
        setTemplate(d.settings.template);
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template }),
    });
    setSaving(false);
    setMessage(res.ok ? "Saved." : "Save failed.");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/resumes" className="text-sm text-neutral-600 underline">
          Back to library
        </Link>
      </div>

      <section className="mt-8 rounded-md border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Resume template
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Used by every render of your master resume and tailored drafts.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="mt-4 space-y-2">
            {options.map((o) => (
              <label
                key={o.name}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 hover:border-neutral-400"
              >
                <input
                  type="radio"
                  name="template"
                  value={o.name}
                  checked={template === o.name}
                  onChange={() => setTemplate(o.name)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-neutral-500">{o.name}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || loading}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <span className="text-xs text-neutral-500">{message}</span>}
        </div>
      </section>
    </main>
  );
}
