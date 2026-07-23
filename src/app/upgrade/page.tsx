"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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

  const router = useRouter();

  return (
    <div className="mx-auto max-w-6xl px-lg pb-xl pt-xl">
      {/* Back to app */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-md inline-flex items-center gap-1 text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <MaterialIcon name="arrow_back" className="text-[20px]" />
        Back to app
      </button>

      <div className="mb-8 mt-lg">
        <h2 className="font-headline-xl text-headline-xl text-primary">Upgrade</h2>
      </div>

      {/* Pricing cards */}
      <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
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
          icon={<PlanSankeyIcon gradId="pi-free" total={20} screening={20} technical={0} ghosted={18} rejected={2} />}
        />
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
          icon={<PlanSankeyIcon gradId="pi-monthly" total={10} screening={10} technical={7} ghosted={1.5} rejected={1.5} />}
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
          icon={<PlanSankeyIcon gradId="pi-pro3m" total={15} screening={15} technical={12} ghosted={1.5} rejected={1.5} />}
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
  icon,
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
  icon?: React.ReactNode;
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
      {/* Icon slot: a fixed-height reserved area at the top of each card for a
          per-plan icon. Pass an <img>/SVG/etc via the `icon` prop; empty for now. */}
      <div className="flex h-16 items-center">
        {icon}
      </div>
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

// Compact Sankey funnel icon for each pricing card. Reuses the FunnelChart's
// visual language (constant-thickness bezi ribbons, gradient fills #000->#333
// pass / #666->#888 rej / #999->#bbb ghost, black main-chain nodes, #555
// drop-off nodes) so the icons read as the same funnel the user sees on the
// applications page, just shrunk and de-labelled.
//
// Three columns: Total -> Screening -> Interview. Flow conservation is exact
// (pass + rej + ghost = screening height) just like the full chart. The three
// plan icons tell a story:
//   - Free (technical=0, ghosted=18/20): everything pours into Ghosted, no
//     interview pipe visible.
//   - Monthly (technical=7/10): a medium interview pipe, thin rej/ghost trails.
//   - 3-Month (technical=12/15): a fatter interview pipe, even thinner trails.
function PlanSankeyIcon({
  gradId,
  total,
  screening,
  technical,
  ghosted,
  rejected,
}: {
  gradId: string;
  total: number;
  screening: number;
  technical: number;
  ghosted: number;
  rejected: number;
}) {
  const W = 128;
  const H = 60;
  const nodeW = 5;
  const colX = [6, 52, 98];
  const topY = 2;
  const maxBar = 24;
  const scale = total > 0 ? maxBar / total : 0;
  const hh = (v: number) => (v > 0 ? Math.max(v * scale, 1.5) : 0);

  const hTotal = hh(total);
  const hScreen = hh(screening);
  const hTech = hh(technical);
  const hRej = hh(rejected);
  const hGhost = hh(ghosted);

  // Stacked flow source offsets on Screening's right edge: pass (top), rej, ghost.
  const screenPassY = topY;
  const screenRejY = topY + hTech;
  const screenGhostY = topY + hTech + hRej;

  // Drop-off destination nodes in col 2, below the interview node.
  const dropGap = 6;
  const dropY = topY + hScreen + dropGap;
  const rejNodeY = dropY;
  const ghostNodeY = dropY + hRej + 2;

  const ribbon = (x1: number, y1: number, x2: number, y2: number, h: number) => {
    const dx = x2 - x1;
    const cp1x = x1 + dx * 0.5;
    const cp2x = x2 - dx * 0.5;
    return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2} L ${x2} ${y2 + h} C ${cp2x} ${y2 + h}, ${cp1x} ${y1 + h}, ${x1} ${y1 + h} Z`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-auto" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`${gradId}-pass`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#000" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#333" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={`${gradId}-rej`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#666" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#888" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={`${gradId}-ghost`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#999" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#bbb" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Flows */}
      <path d={ribbon(colX[0] + nodeW, topY, colX[1], topY, hScreen)} fill={`url(#${gradId}-pass)`} opacity={0.85} />
      {technical > 0 && (
        <path d={ribbon(colX[1] + nodeW, screenPassY, colX[2], topY, hTech)} fill={`url(#${gradId}-pass)`} opacity={0.85} />
      )}
      {rejected > 0 && (
        <path d={ribbon(colX[1] + nodeW, screenRejY, colX[2], rejNodeY, hRej)} fill={`url(#${gradId}-rej)`} opacity={0.6} />
      )}
      {ghosted > 0 && (
        <path d={ribbon(colX[1] + nodeW, screenGhostY, colX[2], ghostNodeY, hGhost)} fill={`url(#${gradId}-ghost)`} opacity={0.5} />
      )}

      {/* Nodes */}
      <rect x={colX[0]} y={topY} width={nodeW} height={hTotal} fill="#000" rx={1} />
      <rect x={colX[1]} y={topY} width={nodeW} height={hScreen} fill="#000" rx={1} />
      {technical > 0 && <rect x={colX[2]} y={topY} width={nodeW} height={hTech} fill="#000" rx={1} />}
      {rejected > 0 && <rect x={colX[2]} y={rejNodeY} width={nodeW} height={hRej} fill="#555" rx={1} />}
      {ghosted > 0 && <rect x={colX[2]} y={ghostNodeY} width={nodeW} height={hGhost} fill="#555" rx={1} />}
    </svg>
  );
}