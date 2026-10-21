"use client";

// Connect page — the extension's sign-in handoff (PRE-88).
//
// Flow: the extension opens {API_BASE}/connect (signed-out surfaces show a
// Connect CTA). The user signs in here (or is already signed in), clicks
// "Connect extension", and the page fetches a long-lived extension token
// (POST /api/auth/extension-token) and hands it to the extension via
// chrome.runtime.sendMessage(EXTENSION_ID, { type: "apted-connect", token }).
//
// chrome.runtime.sendMessage from a web page can only reach a PUBLISHED
// extension id (from externally_connectable in the manifest). For dev /
// unpacked installs, the page also shows the token with a copy button —
// paste it into the extension's Options page (the documented dev fallback).

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { isAuthConfigured } from "@/lib/auth-config";

// Set to the published Chrome Web Store item id once it exists
// (e.g. "abcdefghijklmnopqrstuvwxyzabcdef"). A ?ext=<id> URL param overrides
// it for testing against an unpacked build with a known dev id.
const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || "";

// Minimal typing for the two chrome APIs we use (the web app doesn't ship
// @types/chrome).
type RuntimeSendMessage = (
  extensionId: string,
  message: unknown,
  callback?: (response: unknown) => void,
) => void;
type ChromeGlobal = { runtime?: { sendMessage?: RuntimeSendMessage } };

function getExtensionId(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = new URLSearchParams(window.location.search).get("ext");
  return fromUrl || EXTENSION_ID;
}

const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-body-md font-label-md px-6 py-3 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
const secondaryBtnCls =
  "inline-flex items-center justify-center gap-2 border border-outline-variant text-on-surface text-body-md font-label-md px-6 py-3 rounded-lg hover:bg-surface-container-low transition-colors duration-200 disabled:opacity-50";

export default function ConnectPage() {
  const authed = !!isAuthConfigured();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: session, isPending } = authed ? useSession() : { data: null, isPending: false };

  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "manual">("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    try {
      const res = await fetch("/api/auth/extension-token", { method: "POST" });
      if (!res.ok) throw new Error(`Couldn't create an extension token (HTTP ${res.status}).`);
      const data = (await res.json()) as { token: string };
      setToken(data.token);

      const extensionId = getExtensionId();
      const chromeGlobal = (window as unknown as { chrome?: ChromeGlobal }).chrome;
      if (!extensionId || !chromeGlobal?.runtime?.sendMessage) {
        // No extension id configured (or not a Chromium browser) — the
        // manual paste flow below covers it.
        setStatus("manual");
        return;
      }
      chromeGlobal.runtime.sendMessage(extensionId, { type: "apted-connect", token: data.token }, (response: unknown) => {
        if (response && typeof response === "object" && "ok" in response && (response as { ok: unknown }).ok) {
          setStatus("connected");
        } else {
          // Page → extension messaging only reaches a PUBLISHED id; dev
          // installs fall back to pasting the token in Options.
          setStatus("manual");
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect the extension.");
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (status === "manual") setCopied(false);
  }, [status]);

  async function copyToken(): Promise<void> {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      /* clipboard unavailable — the token is visible for manual selection */
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h2 className="font-headline-xl text-headline-xl text-primary">Connect the extension</h2>
        <p className="mt-1 text-secondary">
          Link the apted Tracker extension to this account so job applications you submit sync
          automatically.
        </p>
      </div>

      {!authed ? (
        <section className="border border-border-subtle bg-surface-white p-md">
          <p className="text-body-md text-on-surface-variant">
            This instance runs without accounts, so there is nothing to connect — the extension
            already works with it.
          </p>
        </section>
      ) : isPending ? (
        <p className="text-body-md text-secondary">Loading…</p>
      ) : !session ? (
        <section className="border border-border-subtle bg-surface-white p-md space-y-4">
          <p className="text-body-md text-on-surface-variant">
            Sign in first, then come back to connect the extension.
          </p>
          <a href="/login" className={primaryBtnCls}>
            Sign in
          </a>
        </section>
      ) : status === "connected" ? (
        <section className="border border-border-subtle bg-surface-white p-md space-y-2">
          <h3 className="font-headline-md text-headline-md text-on-surface">Connected ✓</h3>
          <p className="text-body-md text-on-surface-variant">
            The apted Tracker extension is now linked to{" "}
            <span className="text-on-surface">{session.user.email}</span>. Your pipeline syncs
            automatically — you can close this tab.
          </p>
        </section>
      ) : (
        <section className="border border-border-subtle bg-surface-white p-md space-y-4">
          <p className="text-body-md text-on-surface-variant">
            Signed in as <span className="text-on-surface">{session.user.email}</span>.
          </p>
          <button onClick={() => void connect()} disabled={status === "connecting"} className={primaryBtnCls}>
            {status === "connecting" ? "Connecting…" : "Connect extension"}
          </button>
          {error && <p className="text-body-md text-error">{error}</p>}
          {status === "manual" && (
            <div className="space-y-3 border-t border-border-subtle pt-4">
              <p className="text-body-md text-on-surface-variant">
                Automatic handoff didn&apos;t reach the extension (it only works with the published
                version). Copy the token below and paste it into the extension&apos;s Options page.
              </p>
              {token && (
                <div className="flex items-center gap-3">
                  <code className="flex-1 truncate rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-body-sm">
                    {token}
                  </code>
                  <button onClick={() => void copyToken()} className={secondaryBtnCls}>
                    {copied ? "Copied ✓" : "Copy token"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
