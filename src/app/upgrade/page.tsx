"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { isAuthConfigured } from "@/lib/auth-config";

type Plan = "trial" | "free" | "pro_monthly" | "pro_3month";

// Client-side mirror of isProOrTrial (kept here to avoid importing src/lib/plans,
// which pulls the pg/db pool into the browser bundle).
function isProOrTrial(plan: Plan): boolean {
  return plan === "trial" || plan === "pro_monthly" || plan === "pro_3month";
}

type UsageResponse = {
  plan: Plan;
  trialDaysLeft: number | null;
  proExpiresAt: string | null;
  byok: boolean;            // true when the tailor flow runs on the user's own key
  tailorUsed: number;
  tailorLimit: number | null; // null = unlimited (BYOK pro/trial)
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Plan | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/usage");
      if (res.ok) setUsage((await res.json()) as UsageResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && isPending && !session) return; // wait for session
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

  async function openPortal() {
    setError(null);
    setBusy("portal");
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || `Portal failed (HTTP ${res.status})`);
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portal failed.");
      setBusy(null);
    }
  }

  const plan = usage?.plan ?? "free";
  const isPro = plan === "pro_monthly" || plan === "pro_3month";
  const trialDays = usage?.trialDaysLeft ?? null;
  // Drift-proof: every marketing number comes from the server constant, so the
  // copy can never disagree with the runtime cap when env vars retune it.
  const proLimit = usage?.proSubsidizedLimit ?? 30;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h2 className="font-headline-xl text-headline-xl text-primary">Upgrade</h2>
      </div>

      {/* Current-plan status */}
      <CurrentPlanCard
        loading={loading}
        plan={plan}
        trialDaysLeft={trialDays}
        proExpiresAt={usage?.proExpiresAt ?? null}
        byok={usage?.byok ?? false}
        tailorUsed={usage?.tailorUsed ?? 0}
        tailorLimit={usage?.tailorLimit ?? null}
        isPro={isPro}
        busy={busy}
        onPortal={openPortal}
      />

      {/* Pricing cards */}
      {!isPro && (
        <div className="mt-8 grid gap-md sm:grid-cols-2">
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
            cta="Upgrade"
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
            cta="Buy now"
            featured
            busy={busy === "pro_3month"}
            onChoose={() => startCheckout("pro_3month")}
          />
        </div>
      )}

      {/* Two ways to run the AI */}
      <section className="mt-8 border border-border-subtle bg-surface-white p-md">
        <h3 className="font-label-md text-label-md uppercase tracking-wider text-secondary">
          Two ways to run the AI
        </h3>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Every Pro plan is the full apted harness at a flat rate, and each plan{" "}
          <span className="font-semibold text-on-surface">includes {proLimit} AI-tailored resumes per month</span>{" "}
          on apted-provided AI. Editing, bullet generation, and extraction are always unlimited for everyone. Bring your own provider API key in{" "}
          <Link href="/settings" className="font-semibold text-on-surface underline underline-offset-2 hover:text-primary">Settings</Link>{" "}
          for genuinely unlimited tailoring. You pay your provider directly, and we drop the monthly cap.
        </p>
      </section>

      {error && (
        <p className="mt-4 text-body-sm text-error" role="alert">{error}</p>
      )}
    </div>
  );
}

function CurrentPlanCard({
  loading,
  plan,
  trialDaysLeft,
  proExpiresAt,
  byok,
  tailorUsed,
  tailorLimit,
  isPro,
  busy,
  onPortal,
}: {
  loading: boolean;
  plan: Plan;
  trialDaysLeft: number | null;
  proExpiresAt: string | null;
  byok: boolean;
  tailorUsed: number;
  tailorLimit: number | null;
  isPro: boolean;
  busy: Plan | "portal" | null;
  onPortal: () => void;
}) {
  if (loading) {
    return (
      <section className="border border-border-subtle bg-surface-white p-md">
        <p className="text-body-sm text-on-surface-variant">Loading…</p>
      </section>
    );
  }

  const label: Record<Plan, string> = {
    trial: "Free trial",
    free: "Free",
    pro_monthly: "Pro · Monthly",
    pro_3month: "Pro · 3-Month Pack",
  };

  return (
    <section className="border border-border-subtle bg-surface-white p-md">
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div className="flex items-center gap-md">
          <MaterialIcon name="workspace_premium" className="text-[28px] text-secondary" />
          <div>
            <p className="font-headline-md text-headline-md text-on-surface">Your plan</p>
            <p className="text-body-md text-on-surface-variant">{label[plan]}</p>
          </div>
        </div>
        {isPro && (
          <button onClick={onPortal} disabled={busy === "portal"} className={secondaryBtnCls}>
            {busy === "portal" ? "Opening…" : "Manage subscription"}
          </button>
        )}
      </div>

      {/* Trial countdown */}
      {plan === "trial" && trialDaysLeft !== null && (
        <p className="mt-md rounded-lg bg-surface-container-low p-md text-body-sm text-on-surface">
          <span className="font-semibold">{trialDaysLeft}</span>
          {trialDaysLeft === 1 ? " day" : " days"} left in your free trial.{" "}
          {byok ? (
            "Unlimited tailoring on your own API key."
          ) : (
            <>
              You get <span className="font-semibold">{tailorLimit ?? 0}</span> AI-tailored resumes on apted AI. Add your{" "}
              <Link href="/settings" className="font-semibold underline underline-offset-2 hover:text-primary">API key</Link>{" "}
              for unlimited.
            </>
          )}
        </p>
      )}

      {/* 3-month pack expiry */}
      {plan === "pro_3month" && proExpiresAt && (
        <p className="mt-md rounded-lg bg-surface-container-low p-md text-body-sm text-on-surface">
          Full access until <span className="font-semibold">{formatDate(proExpiresAt)}</span>.
        </p>
      )}

      {/* BYOK unlimited line (pro/trial on their own key) */}
      {isProOrTrial(plan) && byok && (
        <p className="mt-md rounded-lg bg-surface-container-low p-md text-body-sm text-on-surface">
          Unlimited tailored resumes, running on your own API key.
        </p>
      )}

      {/* Subsidized usage (pro/trial on apted tokens, or free) */}
      {((isProOrTrial(plan) && !byok) || plan === "free") && tailorLimit !== null && (
        <p className="mt-md text-body-sm text-on-surface-variant">
          You&apos;ve used <span className="font-semibold text-on-surface">{tailorUsed}</span>{" "}
          of <span className="font-semibold text-on-surface">{tailorLimit}</span> tailored
          resumes this month.
          {isProOrTrial(plan) && !byok && (
            <> Add your API key in{" "}<Link href="/settings" className="font-semibold text-on-surface underline underline-offset-2 hover:text-primary">Settings</Link>{" "}for unlimited usage.</>
          )}
        </p>
      )}
    </section>
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
  onChoose: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col border p-md ${
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
      <button onClick={onChoose} disabled={busy} className={`mt-md ${featured ? primaryBtnCls : secondaryBtnCls}`}>
        {busy ? "Redirecting…" : cta}
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
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