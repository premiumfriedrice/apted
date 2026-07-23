"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { isAuthConfigured } from "@/lib/auth-config";

type Plan = "trial" | "free" | "pro_monthly" | "pro_3month";

type UsageResponse = {
  plan: Plan;
  trialDaysLeft: number | null;
  proExpiresAt: string | null;
  byok: boolean;
  tailorUsed: number;
  tailorLimit: number | null;
  // Echoed server constants so marketing copy interpolates the SAME value the
  // runtime enforces (no hardcoded number that drifts when env vars retune).
  proSubsidizedLimit: number;
  trialSubsidizedLimit: number;
  freeTailorLimit: number;
};

const primaryBtnCls =
  "inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-on-primary-fixed-variant transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
const secondaryBtnCls =
  "inline-flex items-center justify-center gap-2 border border-outline-variant text-on-surface text-label-md font-label-md px-4 py-2 rounded-lg hover:bg-surface-container-low transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

export default function UpgradePage() {
  const authed = !!isAuthConfigured();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data: session, isPending } = authed ? useSession() : { data: null, isPending: false };

  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) setUsage((await res.json()) as UsageResponse);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (authed && isPending && !session) return;
    load();
  }, [authed, isPending, session, load]);

  async function startCheckout(plan: Plan) {
    setError(null);
    setBusy(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || `Checkout failed (HTTP ${res.status})`);
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
      setBusy(null);
    }
  }

  const plan = usage?.plan ?? "free";
  // Drift-proof: every marketing number comes from the server constant, so the
  // copy can never disagree with the runtime cap when env vars retune it.
  const proLimit = usage?.proSubsidizedLimit ?? 30;
  const freeLimit = usage?.freeTailorLimit ?? 3;

  return (
    <div className="mx-auto max-w-6xl px-lg py-xl">
      <div className="mb-8">
        <h2 className="font-headline-xl text-headline-xl text-primary">Upgrade</h2>
      </div>

      {/* Pricing cards */}
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
        <PricingCard
          name="Monthly"
          price="$9.99"
          cadence="/mo"
          tagline="The full apted harness, month to month."
          features={[
            "Full harness: master resume, tailor, edit, application tracking, Chrome extension",
            `${proLimit} AI-tailored resumes / month on apted-provided AI`,
            "Unlimited job description extraction",
            "Bring your own API key for unlimited tailoring (your provider\u2019s cost)",
            "Cancel anytime via Stripe portal",
          ]}
          cta={plan === "pro_monthly" ? "Current plan" : "Get Monthly Plan"}
          disabled={plan === "pro_monthly"}
          featured={false}
          busy={busy === "pro_monthly"}
          onChoose={() => startCheckout("pro_monthly")}
        />
        <PricingCard
          name="3-Month Plan"
          price="$24.99"
          originalPrice="$29.97"
          savings="Save $4.98 vs monthly"
          cadence="/90 days"
          tagline="The full apted harness through recruiting season."
          features={[
            "Everything in Monthly, for 90 days",
            "No recurring billing, drops to Free after 90 days",
          ]}
          badge="Best for recruiting season"
          cta={plan === "pro_3month" ? "Current plan" : "Get 3-Month Plan"}
          disabled={plan === "pro_3month"}
          featured
          busy={busy === "pro_3month"}
          onChoose={() => startCheckout("pro_3month")}
        />
        <PricingCard
          name="Free"
          price="$0"
          cadence="/mo"
          tagline="Everything you need to keep job searching, no card required."
          features={[
            `${freeLimit} free tailored resumes / month`,
            "Unlimited job description extraction",
            "Full harness: master resume, edit, application tracking, Chrome extension",
          ]}
          cta={plan === "free" ? "Current plan" : "Free"}
          disabled
          featured={false}
          busy={false}
          onChoose={() => {}}
        />
      </div>

      {error && (
        <p className="mt-4 text-body-sm text-error" role="alert">{error}</p>
      )}
    </div>
  );
}

function PricingCard({
  name,
  price,
  cadence,
  tagline,
  features,
  cta,
  featured,
  badge,
  originalPrice,
  savings,
  busy,
  disabled,
  onChoose,
}: {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  featured: boolean;
  badge?: string;
  originalPrice?: string;
  savings?: string;
  busy: boolean;
  disabled?: boolean;
  onChoose: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col border p-lg ${
        featured
          ? "border-primary bg-surface-white shadow-sm"
          : "border-border-subtle bg-surface-white"
      }`}
    >
      {badge && (
        <span className="absolute -top-2 left-md rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-on-primary">
          {badge}
        </span>
      )}
      <h3 className="font-headline-md text-headline-md text-on-surface">{name}</h3>
      <div className="mt-1 flex items-baseline gap-sm flex-wrap">
        {originalPrice && (
          <span className="text-body-md text-on-surface-variant line-through">{originalPrice}</span>
        )}
        <span className="font-headline-xl text-headline-xl text-primary">{price}</span>
        <span className="text-body-sm text-on-surface-variant">{cadence}</span>
      </div>
      {savings && (
        <p className="mt-1 text-label-sm font-semibold text-status-success">{savings}</p>
      )}
      <p className="mt-2 text-body-sm text-on-surface-variant">{tagline}</p>
      <ul className="mt-3 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-body-sm text-on-surface-variant">
            <MaterialIcon name="check" className="mt-0.5 shrink-0 text-[18px] text-status-success" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button onClick={onChoose} disabled={busy || disabled} className={`mt-md ${featured ? primaryBtnCls : secondaryBtnCls}`}>
        {busy ? "Redirecting\u2026" : cta}
      </button>
    </div>
  );
}

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{
        fontFamily: "'Material Symbols Outlined', sans-serif",
        fontSize: "20px",
        fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      }}
    >
      {name}
    </span>
  );
}