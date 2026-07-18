"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { isAuthConfigured } from "@/lib/auth-config";
import ApiKeysSection from "./api-keys-section";

type Option = { name: string; label: string };

const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200 disabled:opacity-50";

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
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h2 className="font-headline-xl text-headline-xl text-primary">Settings</h2>
        <p className="mt-1 text-secondary">Configure your resume template and bring your own API keys.</p>
      </div>

      <section className="border border-border-subtle bg-surface-white p-md">
        <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary">
          Resume template
        </h3>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Used by every render of your master resume and tailored drafts.
        </p>

        {loading ? (
          <p className="mt-4 text-body-sm text-on-surface-variant">Loading...</p>
        ) : (
          <div className="mt-4 space-y-2">
            {options.map((o) => (
              <label
                key={o.name}
                className="flex cursor-pointer items-start gap-3 border border-border-subtle p-3 transition-colors hover:border-primary"
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
                  <span className="block font-headline-md text-headline-md text-on-surface">{o.label}</span>
                  <span className="block text-label-md text-secondary">{o.name}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={saving || loading} className={primaryBtnCls}>
            {saving ? "Saving..." : "Save"}
          </button>
          {message && <span className="text-label-md text-secondary">{message}</span>}
        </div>
      </section>

      <ApiKeysSection />

      {isAuthConfigured() && <ExtensionAccessSection />}
    </div>
  );
}

function ExtensionAccessSection() {
  const { data: session } = useSession();
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mintToken() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/auth/extension-token", { method: "POST" });
      if (!res.ok) throw new Error(`Token request failed (HTTP ${res.status})`);
      const data = (await res.json()) as { token?: string; expiresAt?: string };
      setToken(data.token ?? null);
      setExpiresAt(data.expiresAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mint token.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
 /* clipboard unavailable */ }
  }

  const expiry = expiresAt ? new Date(expiresAt).toLocaleDateString() : null;

  return (
    <section className="border border-border-subtle bg-surface-white p-md">
      <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary">
        Extension access
      </h3>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Generate a token to authenticate the apted Chrome extension. Sign out of the web app any time without affecting it.
      </p>

      {!session && (
        <p className="mt-4 text-body-sm text-red-700">Sign in to generate an extension token.</p>
      )}

      {session && (
        <div className="mt-4 space-y-3">
          <button onClick={mintToken} disabled={loading} className={primaryBtnCls}>
            {loading ? "Generating…" : token ? "Regenerate token" : "Generate token"}
          </button>
          {error && <p className="text-body-sm text-red-700">{error}</p>}
          {token && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <code className="block flex-1 truncate rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-body-sm">
                  {token}
                </code>
                <button onClick={copy} className={primaryBtnCls} title="Copy token">
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              {expiry && (
                <p className="text-label-sm text-on-surface-variant">
                  Token expires on {expiry}. Paste it into the extension options page under Auth token.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}