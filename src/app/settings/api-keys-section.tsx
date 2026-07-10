"use client";

import { useEffect, useState } from "react";

// API keys that can be brought by the user. Keep in sync with the backend
// KeyedProvider list (src/lib/api-keys.ts).
type KeyedProvider = "opencode" | "anthropic" | "openai" | "deepseek";

type KeyStatus = Record<KeyedProvider, boolean>;

const PROVIDERS: { id: KeyedProvider; label: string; hint: string }[] = [
  { id: "opencode", label: "OpenCode Zen", hint: "Proxy routing to Claude / DeepSeek models" },
  { id: "anthropic", label: "Anthropic", hint: "Direct Claude API access" },
  { id: "openai", label: "OpenAI", hint: "Direct GPT API access" },
  { id: "deepseek", label: "DeepSeek", hint: "DeepSeek chat / structure models" },
];

type TestState = Record<KeyedProvider, { testing: boolean; result?: { ok: boolean; error?: string } }>;

const initialTest: TestState = {
  opencode: { testing: false },
  anthropic: { testing: false },
  openai: { testing: false },
  deepseek: { testing: false },
};

const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200 disabled:opacity-50";
const smallBtnCls =
  "inline-flex items-center gap-1 px-3 py-2 text-on-surface-variant text-label-md font-label-md hover:bg-surface-container-low transition-colors duration-200 rounded disabled:opacity-50";
const inputCls =
  "flex-1 min-w-0 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary";

export default function ApiKeysSection() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [inputs, setInputs] = useState<Record<KeyedProvider, string>>({
    opencode: "",
    anthropic: "",
    openai: "",
    deepseek: "",
  });
  const [test, setTest] = useState<TestState>(initialTest);
  const [error, setError] = useState<string>("");

  async function load() {
    const r = await fetch("/api/settings/api-keys");
    const data = (await r.json()) as KeyStatus;
    setStatus(data);
    setTest(initialTest);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(provider: KeyedProvider) {
    setError("");
    const r = await fetch("/api/settings/api-keys", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, key: inputs[provider] }),
    });
    if (!r.ok) {
      const m = await r.json().catch(() => ({}));
      setError(m.error ?? "Save failed.");
      return;
    }
    setInputs((s) => ({ ...s, [provider]: "" }));
    await load();
  }

  async function remove(provider: KeyedProvider) {
    setError("");
    const r = await fetch(`/api/settings/api-keys?provider=${provider}`, { method: "DELETE" });
    if (!r.ok) {
      const m = await r.json().catch(() => ({}));
      setError(m.error ?? "Remove failed.");
      return;
    }
    await load();
  }

  async function runTest(provider: KeyedProvider) {
    setTest((s) => ({ ...s, [provider]: { testing: true, result: undefined } }));
    const r = await fetch("/api/settings/api-keys/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setTest((s) => ({
      ...s,
      [provider]: { testing: false, result: { ok: !!data.ok, error: data.error } },
    }));
  }

  return (
    <section className="mt-8 border border-border-subtle bg-surface-white p-md">
      <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary">
        API Keys
      </h3>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Bring your own keys. Stored keys take precedence over the server&apos;s
        environment variables. The app never sends key values back to the browser.
      </p>

      {status === null ? (
        <p className="mt-4 text-body-sm text-on-surface-variant">Loading...</p>
      ) : (
        <div className="mt-4 space-y-4">
          {PROVIDERS.map((p) => {
            const set = status[p.id];
            const t = test[p.id];
            return (
              <div key={p.id} className="border border-border-subtle p-md">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-headline-md text-headline-md text-on-surface">{p.label}</div>
                    <div className="text-label-md text-secondary">{p.hint}</div>
                  </div>
                  {set ? (
                    <span className="text-label-sm font-label-sm font-semibold text-status-success">
                      &#10003; Key set
                    </span>
                  ) : null}
                </div>

                {set ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button onClick={() => runTest(p.id)} disabled={t.testing} className={smallBtnCls}>
                      {t.testing ? "Testing..." : "Test"}
                    </button>
                    <button
                      onClick={() => remove(p.id)}
                      className={`${smallBtnCls} hover:text-error`}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="password"
                      value={inputs[p.id]}
                      onChange={(e) =>
                        setInputs((s) => ({ ...s, [p.id]: e.target.value }))
                      }
                      placeholder={`${p.label} API key`}
                      className={inputCls}
                    />
                    <button onClick={() => save(p.id)} className={primaryBtnCls}>
                      Save
                    </button>
                    <button onClick={() => runTest(p.id)} disabled={t.testing} className={smallBtnCls}>
                      {t.testing ? "Testing..." : "Test"}
                    </button>
                  </div>
                )}

                {t.result ? (
                  <div
                    className={`mt-2 text-label-sm font-label-sm ${
                      t.result.ok ? "text-status-success" : "text-status-alert"
                    }`}
                  >
                    {t.result.ok
                      ? "\u2713 Working"
                      : `\u2717 Failed: ${t.result.error ?? "unknown error"}`}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="mt-3 text-label-sm text-status-alert">{error}</p> : null}
    </section>
  );
}