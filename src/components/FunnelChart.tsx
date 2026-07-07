"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import type { SankeyFlows } from "./types";

interface FunnelChartProps {
  flows: SankeyFlows;
}

/**
 * Sankey funnel where each application traces its own path through only the
 * stages it reached, then ends at its own terminal. Flows that skip stages
 * (e.g. an offer granted right after screening) draw a direct ribbon from
 * Screening to Offers, bypassing the Technical and Final columns.
 */
export default function FunnelChart({ flows }: FunnelChartProps) {
  const [hovered, setHovered] = useState<{
    label: string;
    value: number;
    pct: string;
  } | null>(null);

  if (flows.total === 0) return null;

  // --- Layout constants ---
  const nodeW = 16;
  const topY = 70; // y of the top of every main-chain node
  const maxBar = 280; // pixel height of the tallest node (total)
  const scale = flows.total > 0 ? maxBar / flows.total : 0;
  const colGap = 200;
  const colX = [70, 70 + colGap, 70 + colGap * 2, 70 + colGap * 3, 70 + colGap * 4];
  // col0 Total | col1 Screening+Drafts | col2 Technical+Ghosted+RejScreen |
  // col3 Final+RejTech | col4 Offers+RejFinal+Declined+Pending

  // value -> pixels (minimum 3px so nonzero nodes/flows are still visible)
  const hh = (v: number) => (v > 0 ? Math.max(v * scale, 3) : 0);

  // --- Main-chain node heights ---
  const hTotal = hh(flows.total);
  const hScreen = hh(flows.screening);
  const hTech = hh(flows.technical);
  const hFinal = hh(flows.final);

  // --- Terminal node heights ---
  const hDrafts = hh(flows.drafts);
  const hGhosted = hh(flows.ghosted);
  const hPending = hh(flows.pending);
  const hRejScreen = hh(flows.rejScreen);
  const hRejTech = hh(flows.rejTech);
  const hRejFinal = hh(flows.rejFinal);
  const hOffers = hh(flows.offers);
  const hDeclined = hh(flows.declined);

  // --- Bottom region: terminal nodes ---
  const bottomGap = 50;
  const bottomY = topY + hTotal + bottomGap;
  const rejGap = 12;

  // Terminal node y-positions (bottom area, stacked per column)
  const draftsNodeY = bottomY; // col1
  const ghostedNodeY = bottomY; // col2 (top)
  const rejScreenNodeY = bottomY + hGhosted + rejGap; // col2 (below ghosted)
  const rejTechNodeY = bottomY; // col3
  // col4 stack: Offers (top), RejFinal, Declined, Pending
  const offersNodeY = bottomY;
  const rejFinalNodeY = bottomY + hOffers + rejGap;
  const declinedNodeY = rejFinalNodeY + hRejFinal + rejGap;
  const pendingNodeY = declinedNodeY + hDeclined + rejGap;

  // --- Source-side stacking: outgoing flows stacked top-to-bottom within
  // each main-chain node. Order: pass flow (to next stage) on top, then
  // terminals ordered to minimize crossings (furthest target gets lower slot
  // so long skip-ribbons bend downward). ---

  // Total -> [Screen (top), Drafts (bottom)]
  const totalScreenY = topY;
  const totalDraftsY = topY + hh(flows.totalToScreen);

  // Screening -> [Tech (top), Offers, RejScreen, Pending, Ghosted (bottom)]
  // Offers goes far right (col4); order it just under the pass flow so its
  // long ribbon sweeps cleanly. Then RejScreen, Pending, Ghosted.
  const screenTechY = topY;
  const screenOffersY = topY + hh(flows.screenToTech);
  const screenRejScreenY = screenOffersY + hh(flows.screenToOffers);
  const screenPendingY = screenRejScreenY + hh(flows.screenToRejScreen);
  const screenGhostedY = screenPendingY + hh(flows.screenToPending);

  // Technical -> [Final (top), Offers, Pending, RejTech, Declined]
  const techFinalY = topY;
  const techOffersY = topY + hh(flows.techToFinal);
  const techPendingY = techOffersY + hh(flows.techToOffers);
  const techRejTechY = techPendingY + hh(flows.techToPending);
  const techDeclinedY = techRejTechY + hh(flows.techToRejTech);

  // Final -> [Offers (top), RejFinal, Pending, Declined]
  const finalOffersY = topY;
  const finalRejFinalY = topY + hh(flows.finalToOffers);
  const finalPendingY = finalRejFinalY + hh(flows.finalToRejFinal);
  const finalDeclinedY = finalPendingY + hh(flows.finalToPending);

  // Offers incoming flows from multiple stages stack vertically at the offers
  // node. Receive: Final (closest, top), then Technical, then Screening (longest, bottom).
  const offersFinalY = offersNodeY;
  const offersTechY = offersFinalY + hh(flows.finalToOffers);
  const offersScreenY = offersTechY + hh(flows.techToOffers);

  // Pending incoming flows from multiple stages stack at the pending node.
  // Receive: Final (top), then Technical, then Screening (bottom).
  const pendingFinalY = pendingNodeY;
  const pendingTechY = pendingFinalY + hh(flows.finalToPending);
  const pendingScreenY = pendingTechY + hh(flows.techToPending);

  // SVG dimensions
  const W = colX[4] + nodeW + 130;
  const bottomStack = Math.max(
    hGhosted + rejGap + hRejScreen,
    hRejTech,
    hOffers + rejGap + hRejFinal + rejGap + hDeclined + rejGap + hPending,
    hDrafts,
  );
  const H = bottomY + bottomStack + 30;

  // --- Helpers ---
  const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

  // Constant-thickness bezier ribbon. Thickness = value * scale at both ends.
  const ribbon = (x1: number, y1: number, x2: number, y2: number, h: number) => {
    const dx = x2 - x1;
    const cp1x = x1 + dx * 0.6;
    const cp2x = x2 - dx * 0.6;
    return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2} L ${x2} ${y2 + h} C ${cp2x} ${y2 + h}, ${cp1x} ${y1 + h}, ${x1} ${y1 + h} Z`;
  };

  const onHover = (label: string, value: number, p: string) =>
    setHovered({ label, value, pct: p });
  const onLeave = () => setHovered(null);

  const screenRate = pct(flows.screening, flows.total);
  const techRate = pct(flows.technical, flows.screening);
  const offerRate = pct(flows.offers, flows.total);

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="fc-pass" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#333" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="fc-offer" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="fc-rej" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#666" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#888" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="fc-drop" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#999" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#bbb" stopOpacity="0.35" />
          </linearGradient>
          <linearGradient id="fc-pending" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* ===== FLOWS ===== */}

        {/* Total -> Screening */}
        {flows.totalToScreen > 0 && (
          <Flow ribbon={ribbon} x1={colX[0] + nodeW} y1={totalScreenY} x2={colX[1]} y2={topY} h={hh(flows.totalToScreen)}
            fill="url(#fc-pass)" op={0.85}
            onEnter={() => onHover("Submitted to Screening", flows.totalToScreen, `${screenRate}% of total`)} onLeave={onLeave} />
        )}
        {/* Total -> Drafts */}
        {flows.totalToDrafts > 0 && (
          <Flow ribbon={ribbon} x1={colX[0] + nodeW} y1={totalDraftsY} x2={colX[1]} y2={draftsNodeY} h={hDrafts}
            fill="url(#fc-drop)" op={0.6}
            onEnter={() => onHover("Not Submitted (Drafts)", flows.totalToDrafts, `${pct(flows.drafts, flows.total)}% of total`)} onLeave={onLeave} />
        )}

        {/* Screening -> Technical */}
        {flows.screenToTech > 0 && (
          <Flow ribbon={ribbon} x1={colX[1] + nodeW} y1={screenTechY} x2={colX[2]} y2={topY} h={hh(flows.screenToTech)}
            fill="url(#fc-pass)" op={0.85}
            onEnter={() => onHover("Reached Technical Interview", flows.screenToTech, `${techRate}% of screened`)} onLeave={onLeave} />
        )}
        {/* Screening -> Offers (skip tech & final) */}
        {flows.screenToOffers > 0 && (
          <Flow ribbon={ribbon} x1={colX[1] + nodeW} y1={screenOffersY} x2={colX[4]} y2={offersScreenY} h={hh(flows.screenToOffers)}
            fill="url(#fc-offer)" op={0.85}
            onEnter={() => onHover("Offer from Screening (no interviews)", flows.screenToOffers, `${pct(flows.screenToOffers, flows.screening)}% of screened`)} onLeave={onLeave} />
        )}
        {/* Screening -> RejScreen */}
        {flows.screenToRejScreen > 0 && (
          <Flow ribbon={ribbon} x1={colX[1] + nodeW} y1={screenRejScreenY} x2={colX[2]} y2={rejScreenNodeY} h={hRejScreen}
            fill="url(#fc-rej)" op={0.7}
            onEnter={() => onHover("Rejected at Screening", flows.screenToRejScreen, `${pct(flows.rejScreen, flows.screening)}% of screened`)} onLeave={onLeave} />
        )}
        {/* Screening -> Pending (applied, waiting at screening) */}
        {flows.screenToPending > 0 && (
          <Flow ribbon={ribbon} x1={colX[1] + nodeW} y1={screenPendingY} x2={colX[4]} y2={pendingScreenY} h={hh(flows.screenToPending)}
            fill="url(#fc-pending)" op={0.55}
            onEnter={() => onHover("In Progress (waiting at screening)", flows.screenToPending, `${pct(flows.screenToPending, flows.screening)}% of screened`)} onLeave={onLeave} />
        )}
        {/* Screening -> Ghosted */}
        {flows.screenToGhosted > 0 && (
          <Flow ribbon={ribbon} x1={colX[1] + nodeW} y1={screenGhostedY} x2={colX[2]} y2={ghostedNodeY} h={hGhosted}
            fill="url(#fc-drop)" op={0.5}
            onEnter={() => onHover("Ghosted / No Response", flows.screenToGhosted, `${pct(flows.ghosted, flows.screening)}% of screened`)} onLeave={onLeave} />
        )}

        {/* Technical -> Final */}
        {flows.techToFinal > 0 && (
          <Flow ribbon={ribbon} x1={colX[2] + nodeW} y1={techFinalY} x2={colX[3]} y2={topY} h={hh(flows.techToFinal)}
            fill="url(#fc-pass)" op={0.85}
            onEnter={() => onHover("Reached Final Round", flows.techToFinal, `${pct(flows.final, flows.technical)}% of technical`)} onLeave={onLeave} />
        )}
        {/* Technical -> Offers (skip final) */}
        {flows.techToOffers > 0 && (
          <Flow ribbon={ribbon} x1={colX[2] + nodeW} y1={techOffersY} x2={colX[4]} y2={offersTechY} h={hh(flows.techToOffers)}
            fill="url(#fc-offer)" op={0.85}
            onEnter={() => onHover("Offer after Technical (no final)", flows.techToOffers, `${pct(flows.techToOffers, flows.technical)}% of technical`)} onLeave={onLeave} />
        )}
        {/* Technical -> Pending (interviewing round 1, in technical) */}
        {flows.techToPending > 0 && (
          <Flow ribbon={ribbon} x1={colX[2] + nodeW} y1={techPendingY} x2={colX[4]} y2={pendingTechY} h={hh(flows.techToPending)}
            fill="url(#fc-pending)" op={0.55}
            onEnter={() => onHover("In Progress (in technical interview)", flows.techToPending, `${pct(flows.techToPending, flows.technical)}% of technical`)} onLeave={onLeave} />
        )}
        {/* Technical -> RejTech */}
        {flows.techToRejTech > 0 && (
          <Flow ribbon={ribbon} x1={colX[2] + nodeW} y1={techRejTechY} x2={colX[3]} y2={rejTechNodeY} h={hRejTech}
            fill="url(#fc-rej)" op={0.7}
            onEnter={() => onHover("Rejected After Technical", flows.techToRejTech, `${pct(flows.rejTech, flows.technical)}% of technical`)} onLeave={onLeave} />
        )}
        {/* Technical -> Declined */}
        {flows.techToDeclined > 0 && (
          <Flow ribbon={ribbon} x1={colX[2] + nodeW} y1={techDeclinedY} x2={colX[4]} y2={declinedNodeY} h={hh(flows.techToDeclined)}
            fill="url(#fc-drop)" op={0.5}
            onEnter={() => onHover("Declined after Technical", flows.techToDeclined, `${pct(flows.techToDeclined, flows.technical)}% of technical`)} onLeave={onLeave} />
        )}

        {/* Final -> Offers */}
        {flows.finalToOffers > 0 && (
          <Flow ribbon={ribbon} x1={colX[3] + nodeW} y1={finalOffersY} x2={colX[4]} y2={offersFinalY} h={hh(flows.finalToOffers)}
            fill="url(#fc-offer)" op={0.9}
            onEnter={() => onHover("Offer after Final", flows.finalToOffers, `${pct(flows.finalToOffers, flows.final)}% of final`)} onLeave={onLeave} />
        )}
        {/* Final -> Pending (interviewing round 2+, in final) */}
        {flows.finalToPending > 0 && (
          <Flow ribbon={ribbon} x1={colX[3] + nodeW} y1={finalPendingY} x2={colX[4]} y2={pendingFinalY} h={hh(flows.finalToPending)}
            fill="url(#fc-pending)" op={0.55}
            onEnter={() => onHover("In Progress (in final round)", flows.finalToPending, `${pct(flows.finalToPending, flows.final)}% of final`)} onLeave={onLeave} />
        )}
        {/* Final -> RejFinal */}
        {flows.finalToRejFinal > 0 && (
          <Flow ribbon={ribbon} x1={colX[3] + nodeW} y1={finalRejFinalY} x2={colX[4]} y2={rejFinalNodeY} h={hRejFinal}
            fill="url(#fc-rej)" op={0.7}
            onEnter={() => onHover("Rejected After Final", flows.finalToRejFinal, `${pct(flows.rejFinal, flows.final)}% of final`)} onLeave={onLeave} />
        )}
        {/* Final -> Declined */}
        {flows.finalToDeclined > 0 && (
          <Flow ribbon={ribbon} x1={colX[3] + nodeW} y1={finalDeclinedY} x2={colX[4]} y2={declinedNodeY} h={hh(flows.finalToDeclined)}
            fill="url(#fc-drop)" op={0.5}
            onEnter={() => onHover("Declined after Final", flows.finalToDeclined, `${pct(flows.finalToDeclined, flows.final)}% of final`)} onLeave={onLeave} />
        )}

        {/* ===== MAIN NODES ===== */}
        <Node x={colX[0]} y={topY} w={nodeW} h={hTotal} fill="#000"
          onEnter={() => onHover("Total Applications", flows.total, "100%")} onLeave={onLeave} />
        {flows.screening > 0 && (
          <Node x={colX[1]} y={topY} w={nodeW} h={hScreen} fill="#000"
            onEnter={() => onHover("Screening", flows.screening, `${screenRate}% of total`)} onLeave={onLeave} />
        )}
        {flows.technical > 0 && (
          <Node x={colX[2]} y={topY} w={nodeW} h={hTech} fill="#000"
            onEnter={() => onHover("Technical Interview", flows.technical, `${techRate}% of screened`)} onLeave={onLeave} />
        )}
        {flows.final > 0 && (
          <Node x={colX[3]} y={topY} w={nodeW} h={hFinal} fill="#000"
            onEnter={() => onHover("Final Round", flows.final, `${pct(flows.final, flows.technical)}% of technical`)} onLeave={onLeave} />
        )}

        {/* ===== TERMINAL NODES ===== */}
        {flows.drafts > 0 && <Node x={colX[1]} y={draftsNodeY} w={nodeW} h={hDrafts} fill="#555" />}
        {flows.ghosted > 0 && <Node x={colX[2]} y={ghostedNodeY} w={nodeW} h={hGhosted} fill="#555" />}
        {flows.rejScreen > 0 && <Node x={colX[2]} y={rejScreenNodeY} w={nodeW} h={hRejScreen} fill="#555" />}
        {flows.rejTech > 0 && <Node x={colX[3]} y={rejTechNodeY} w={nodeW} h={hRejTech} fill="#555" />}
        {flows.offers > 0 && <Node x={colX[4]} y={offersNodeY} w={nodeW} h={hOffers} fill="#000"
          onEnter={() => onHover("Offers", flows.offers, `${offerRate}% of total`)} onLeave={onLeave} />}
        {flows.rejFinal > 0 && <Node x={colX[4]} y={rejFinalNodeY} w={nodeW} h={hRejFinal} fill="#555" />}
        {flows.declined > 0 && <Node x={colX[4]} y={declinedNodeY} w={nodeW} h={hDeclined} fill="#555" />}
        {flows.pending > 0 && <Node x={colX[4]} y={pendingNodeY} w={nodeW} h={hPending} fill="#3b82f6" />}

        {/* ===== MAIN LABELS (above nodes) ===== */}
        <Label x={colX[0]} y={topY - 34} text="Total Applications" />
        <Value x={colX[0]} y={topY - 16} text={String(flows.total)} />
        {flows.screening > 0 && (<><Label x={colX[1]} y={topY - 34} text="Screening" /><Value x={colX[1]} y={topY - 16} text={String(flows.screening)} /></>)}
        {flows.technical > 0 && (<><Label x={colX[2]} y={topY - 34} text="Technical Interview" /><Value x={colX[2]} y={topY - 16} text={String(flows.technical)} /></>)}
        {flows.final > 0 && (<><Label x={colX[3]} y={topY - 34} text="Final Round" /><Value x={colX[3]} y={topY - 16} text={String(flows.final)} /></>)}
        {flows.offers > 0 && (<><Label x={colX[4]} y={topY - 34} text="Offers" /><Value x={colX[4]} y={topY - 16} text={String(flows.offers)} green /></>)}

        {/* ===== TERMINAL LABELS (right of node) ===== */}
        {flows.drafts > 0 && <SideLabel x={colX[1] + nodeW + 8} y={draftsNodeY + hDrafts / 2 + 4} text={`Drafts (${flows.drafts})`} />}
        {flows.ghosted > 0 && <SideLabel x={colX[2] + nodeW + 8} y={ghostedNodeY + hGhosted / 2 + 4} text={`Ghosted (${flows.ghosted})`} />}
        {flows.rejScreen > 0 && <SideLabel x={colX[2] + nodeW + 8} y={rejScreenNodeY + hRejScreen / 2 + 4} text={`Rejected (${flows.rejScreen})`} />}
        {flows.rejTech > 0 && <SideLabel x={colX[3] + nodeW + 8} y={rejTechNodeY + hRejTech / 2 + 4} text={`Rejected (${flows.rejTech})`} />}
        {flows.rejFinal > 0 && <SideLabel x={colX[4] + nodeW + 8} y={rejFinalNodeY + hRejFinal / 2 + 4} text={`Rejected (${flows.rejFinal})`} />}
        {flows.declined > 0 && <SideLabel x={colX[4] + nodeW + 8} y={declinedNodeY + hDeclined / 2 + 4} text={`Declined (${flows.declined})`} />}
        {flows.pending > 0 && <SideLabel x={colX[4] + nodeW + 8} y={pendingNodeY + hPending / 2 + 4} text={`In Progress (${flows.pending})`} />}
      </svg>

      {/* Tooltip / summary bar */}
      <div className="mt-3 flex items-center justify-between text-xs">
        {hovered ? (
          <span className="flex items-center gap-2 font-medium text-on-surface">
            <Info className="h-3.5 w-3.5 text-on-surface-variant" />
            {hovered.label}: <strong>{hovered.value}</strong>
            <span className="text-on-surface-variant">({hovered.pct})</span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-on-surface-variant">
            <Info className="h-3.5 w-3.5" />
            Hover over any node or flow for details.
          </span>
        )}
        <div className="hidden items-center gap-4 md:flex">
          <span><strong className="font-mono text-on-surface">{screenRate}%</strong> screen pass</span>
          <span><strong className="font-mono text-on-surface">{techRate}%</strong> interview pass</span>
          <span className="text-status-success"><strong className="font-mono">{offerRate}%</strong> offer rate</span>
        </div>
      </div>
    </div>
  );
}

// --- Small presentational helpers to keep the JSX readable ---

function Node({
  x, y, w, h, fill, onEnter, onLeave,
}: {
  x: number; y: number; w: number; h: number; fill: string;
  onEnter?: () => void; onLeave?: () => void;
}) {
  return (
    <rect
      x={x} y={y} width={w} height={h} fill={fill} rx={1}
      className={`transition-opacity ${onEnter ? "cursor-pointer hover:opacity-80" : ""}`}
      onMouseEnter={onEnter} onMouseLeave={onLeave}
    />
  );
}

function Flow({
  ribbon, x1, y1, x2, y2, h, fill, op, onEnter, onLeave,
}: {
  ribbon: (x1: number, y1: number, x2: number, y2: number, h: number) => string;
  x1: number; y1: number; x2: number; y2: number; h: number;
  fill: string; op: number; onEnter: () => void; onLeave: () => void;
}) {
  return (
    <path
      d={ribbon(x1, y1, x2, y2, h)}
      fill={fill}
      opacity={op}
      className="cursor-pointer transition-opacity hover:opacity-100"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    />
  );
}

function Label({ x, y, text }: { x: number; y: number; text: string }) {
  return <text x={x} y={y} className="font-display font-bold text-xs" fill="#171c20">{text}</text>;
}

function Value({ x, y, text, green }: { x: number; y: number; text: string; green?: boolean }) {
  return <text x={x} y={y} className="font-sans text-sm font-medium" fill={green ? "#10B981" : "#4c4546"}>{text}</text>;
}

function SideLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return <text x={x} y={y} className="font-sans text-xs" fill="#666">{text}</text>;
}