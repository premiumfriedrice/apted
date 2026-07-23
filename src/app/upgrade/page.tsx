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
          icon={<PlanSankeyIcon gradId="pi-free" stages={[20, 20, 0, 0, 0]} />}
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
          icon={<PlanSankeyIcon gradId="pi-monthly" stages={[10, 10, 7, 4, 2]} />}
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
          icon={<PlanSankeyIcon gradId="pi-pro3m" stages={[15, 15, 12, 10, 7]} />}
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
      <div className="flex h-16 items-center justify-center">
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
// visual language (constant-thickness bezi ribbons, #000->#333 pass gradient,
// #999->#bbb drop gradient, black main-chain nodes, #555 drop-off nodes) so the
// icons read as the same funnel the user sees on the applications page, just
// shrunk and de-labelled.
//
// One `stages` array lays the funnel on a fixed 5-column grid mirroring the
// real funnel: [Total, Screening, Technical, Final, Offers]. Each consecutive
// pair has a dark pass flow (value = next stage); the leftover between them is
// a thin drop pipe bending to a small #555 drop node below the next stage.
// Flow conservation is visually exact (pass + drop = source height). Zero
// stages produce no node/flow, so a tier that stops early just leaves its
// right-hand columns empty.
//
// The three plan icons tell a story on the SAME grid so they're comparable:
//   - Free    [20, 20, 0, 0, 0]  : everything pours into a fat drop at
//                                  Screening; no interview/final/offer pipes.
//   - Monthly [10, 10, 7, 4, 2]  : runs the whole funnel to Offers with thin
//                                  drop trails.
//   - 3-Month [15, 15, 12, 10, 7]: same shape but fatter pass pipes all the
//                                  way down and a fatter Offers node.
function PlanSankeyIcon({
  gradId,
  stages,
}: {
  gradId: string;
  stages: number[];
}) {
  const n = stages.length;
  const H = 60;
  const nodeW = 5;
  const colGap = 42;
  const colX = Array.from({ length: n }, (_, i) => 7 + i * colGap);
  const topY = 2;
  const maxBar = 28;
  const peak = stages.length ? Math.max(...stages) : 0;
  const scale = peak > 0 ? maxBar / peak : 0;
  const hh = (v: number) => (v > 0 ? Math.max(v * scale, 1.5) : 0);

  const dropGap = 5;
  const dropVal = (i: number) => Math.max(stages[i] - stages[i + 1], 0);
  // Pale (ghosted/drafts) sources land in their own per-column drop node (col i+1).
  const dropNodeY = (i: number) => topY + hh(stages[i + 1]) + dropGap;
  // Rejected sources (Technical=2, Final=3 ... up to n-2) CONVERGE onto a single
  // shared rejected node below the Offers node (col n-1), so rejections from the
  // interview stages collect into one bucket.
  const rejSrcs: number[] = [];
  for (let i = 2; i <= n - 2; i++) rejSrcs.push(i);
  const rejTotal = rejSrcs.reduce((s, i) => s + dropVal(i), 0);
  const rejDstX = colX[n - 1];
  const rejBaseY = topY + hh(stages[n - 1]) + dropGap;
  const rejH = hh(rejTotal);

  // Shrink the viewBox to the rightmost column that actually has content (a
  // main-chain node > 0, a pale drop, or the shared rejected node) so centered
  // icons whose later columns are empty (e.g. Free) aren't pushed off-center by
  // dead space. Icons with full funnels (Monthly/3-Month) keep the full width.
  let lastCol = 0;
  for (let i = 0; i < n; i++) if (stages[i] > 0) lastCol = Math.max(lastCol, i);
  for (let i = 0; i < n - 1; i++) if (dropVal(i) > 0) lastCol = Math.max(lastCol, i + 1);
  if (rejTotal > 0) lastCol = Math.max(lastCol, n - 1);
  const W = colX[lastCol] + nodeW + 6;

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
        <linearGradient id={`${gradId}-drop`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#999" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#bbb" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`${gradId}-rej`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#666" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#888" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {/* Pass flows (main chain, all consecutive pairs) */}
      {stages.slice(0, -1).map((_, i) => stages[i + 1] > 0 && (
        <path
          key={`p${i}`}
          d={ribbon(colX[i] + nodeW, topY, colX[i + 1], topY, hh(stages[i + 1]))}
          fill={`url(#${gradId}-pass)`}
          opacity={0.85}
        />
      ))}

      {/* Pale drop flows (drafts at i=0, screening-ghosted at i=1): own per-col node */}
      {[0, 1].filter((i) => i < n - 1).map((i) => dropVal(i) > 0 && (
        <path
          key={`g${i}`}
          d={ribbon(colX[i] + nodeW, topY + hh(stages[i + 1]), colX[i + 1], dropNodeY(i), hh(dropVal(i)))}
          fill={`url(#${gradId}-drop)`}
          opacity={0.55}
        />
      ))}

      {/* Shared rejected flows: Technical (i=2) + Final (i=3) converge onto one node */}
      {(() => {
        let cursor = rejBaseY;
        return rejSrcs.map((i) => {
          const h = hh(dropVal(i));
          const srcY = topY + hh(stages[i + 1]);
          const dstY = cursor;
          cursor += h;
          return dropVal(i) > 0 ? (
            <path
              key={`r${i}`}
              d={ribbon(colX[i] + nodeW, srcY, rejDstX, dstY, h)}
              fill={`url(#${gradId}-rej)`}
              opacity={0.7}
            />
          ) : null;
        });
      })()}

      {/* Main-chain nodes (top of each column) */}
      {stages.map((v, i) => v > 0 && (
        <rect key={`n${i}`} x={colX[i]} y={topY} width={nodeW} height={hh(v)} fill="#000" rx={1} />
      ))}

      {/* Pale drop nodes (drafts, ghosted) */}
      {[0, 1].filter((i) => i < n - 1).map((i) => dropVal(i) > 0 && (
        <rect key={`d${i}`} x={colX[i + 1]} y={dropNodeY(i)} width={nodeW} height={hh(dropVal(i))} fill="#555" rx={1} />
      ))}

      {/* Shared rejected node (Technical + Final converge here) */}
      {rejTotal > 0 && (
        <rect key="rej" x={rejDstX} y={rejBaseY} width={nodeW} height={rejH} fill="#555" rx={1} />
      )}
    </svg>
  );
}