"use client";

import React, { useRef, useState } from "react";
import { Download, Info } from "lucide-react";
import { FunnelStats } from "./types";

interface FunnelChartProps {
  stats: FunnelStats;
  /** Shrink the chart height for compact containers (e.g. resume detail pane). */
  compact?: boolean;
}

/**
 * A proper Sankey funnel diagram.
 *
 * Key principles:
 * - Every node height is proportional to its value (uniform scale).
 * - Every flow ribbon has constant thickness = flowValue * scale at BOTH ends.
 * - Flows are stacked vertically within each source node (pass on top, rejection
 *   below, drop-off below that), so flow conservation is visually exact.
 * - Drop-off buckets (drafts, ghosted, declined) are derived and shown so
 *   that every application is accounted for at every stage.
 */
export default function FunnelChart({ stats, compact = false }: FunnelChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<{
    label: string;
    value: number;
    pct: string;
  } | null>(null);

  // With zero applications every value is 0, so all node heights/flows
  // collapse to zero and the labels render "0" — i.e. a blank Sankey kept
  // in place at the top of the page rather than vanishing.

  // --- Derived drop-off buckets (so flows conserve mass) ---
  const drafts = Math.max(stats.total - stats.screening, 0);
  const ghosted = Math.max(
    stats.screening - stats.screeningRejections - stats.technical,
    0
  );
  const declined = Math.max(
    stats.final - stats.finalRejections - stats.offers,
    0
  );

  // --- Layout constants ---
  const nodeW = 16;
  const topY = 86; // y of the top of every main-chain node (room for larger labels)
  const maxBar = compact ? 160 : 280; // pixel height of the tallest node (total)
  const scale = stats.total > 0 ? maxBar / stats.total : 0;
  const colGap = 200;
  const colX = [70, 70 + colGap, 70 + colGap * 2, 70 + colGap * 3, 70 + colGap * 4];

  // value -> pixels (minimum 3px so nonzero nodes/flows are still visible)
  const hh = (v: number) => (v > 0 ? Math.max(v * scale, 3) : 0);

  // --- Node heights ---
  const hTotal = hh(stats.total);
  const hScreen = hh(stats.screening);
  const hTech = hh(stats.technical);
  const hFinal = hh(stats.final);
  const hOffers = hh(stats.offers);
  const hScreenRej = hh(stats.screeningRejections);
  const hTechRej = hh(stats.technicalRejections);
  const hFinalRej = hh(stats.finalRejections);
  const hDrafts = hh(drafts);
  const hGhosted = hh(ghosted);
  const hDeclined = hh(declined);

  // --- Bottom region: all rejection / drop-off nodes live here ---
  const bottomGap = 50;
  const bottomY = topY + hTotal + bottomGap;
  const rejGap = 10; // gap between stacked rejection nodes in a column

  // Rejection / drop node y-positions (bottom of diagram, stacked per column)
  const draftsNodeY = bottomY; // col 1
  const screenRejNodeY = bottomY; // col 2 (top)
  const ghostedNodeY = bottomY + hScreenRej + rejGap; // col 2 (below screen rej)
  const techRejNodeY = bottomY; // col 3
  const finalRejNodeY = bottomY; // col 4 (top)
  const declinedNodeY = bottomY + hFinalRej + rejGap; // col 4 (below final rej)

  // --- Flow source y-offsets (stacked top-to-bottom within each source node) ---
  // Total -> [drafts (top, precedes submitted), submitted (below)]
  const totalDraftsY = topY;
  const totalPassY = topY + hDrafts; // submitted bends UP to screening top

  // Screening -> [technical (pass, top), screenRej, ghosted]
  const screenPassY = topY;
  const screenRejFlowY = topY + hTech;
  const screenGhostFlowY = topY + hTech + hScreenRej;

  // Technical -> [final (pass, top), techRej]
  const techPassY = topY;
  const techRejFlowY = topY + hFinal;

  // Final -> [offers (pass, top), finalRej, declined]
  const finalPassY = topY;
  const finalRejFlowY = topY + hOffers;
  const finalDeclinedFlowY = topY + hOffers + hFinalRej;

  // SVG dimensions
  const W = colX[4] + nodeW + 130;
  const bottomStack = Math.max(
    hScreenRej + rejGap + hGhosted,
    hFinalRej + rejGap + hDeclined,
    hDrafts,
    hTechRej,
  );
  const H = bottomY + bottomStack + 30;

  // --- Helpers ---
  const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

  // Constant-thickness bezier ribbon (proper Sankey: thickness = value * scale at both ends)
  const ribbon = (x1: number, y1: number, x2: number, y2: number, h: number) => {
    const dx = x2 - x1;
    const cp1x = x1 + dx * 0.6;
    const cp2x = x2 - dx * 0.6;
    return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2} L ${x2} ${y2 + h} C ${cp2x} ${y2 + h}, ${cp1x} ${y1 + h}, ${x1} ${y1 + h} Z`;
  };

  const onHover = (label: string, value: number, p: string) =>
    setHovered({ label, value, pct: p });
  const onLeave = () => setHovered(null);

  // Conversion rates for the summary bar
  const screenRate = pct(stats.screening, stats.total);
  const techRate = pct(stats.technical, stats.screening);
  const offerRate = pct(stats.offers, stats.total);

  function exportSvg() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const data = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apted-funnel.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const data = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = W * scale;
      canvas.height = H * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = "apted-funnel.png";
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, "image/png");
    };
    img.src = url;
  }

  return (
    <div className="relative flex h-full flex-col select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto flex-1"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="fc-pass" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#333" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="fc-rej" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#666" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#888" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="fc-drop" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#999" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#bbb" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* ===== FLOWS (drawn before nodes so nodes sit on top) ===== */}

        {/* Total -> Screening */}
        {stats.screening > 0 && (
          <path
            d={ribbon(colX[0] + nodeW, totalPassY, colX[1], topY, hScreen)}
            fill="url(#fc-pass)"
            opacity={0.85}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Submitted to Screening", stats.screening, `${screenRate}% of total`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Total -> Drafts */}
        {drafts > 0 && (
          <path
            d={ribbon(colX[0] + nodeW, totalDraftsY, colX[1], draftsNodeY, hDrafts)}
            fill="url(#fc-drop)"
            opacity={0.6}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Not Submitted (Drafts)", drafts, `${pct(drafts, stats.total)}% of total`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Screening -> Technical */}
        {stats.technical > 0 && (
          <path
            d={ribbon(colX[1] + nodeW, screenPassY, colX[2], topY, hTech)}
            fill="url(#fc-pass)"
            opacity={0.85}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Passed Screening to Technical", stats.technical, `${techRate}% of screened`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Screening -> Screening Rejections */}
        {stats.screeningRejections > 0 && (
          <path
            d={ribbon(colX[1] + nodeW, screenRejFlowY, colX[2], screenRejNodeY, hScreenRej)}
            fill="url(#fc-rej)"
            opacity={0.7}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Rejected at Screening", stats.screeningRejections, `${pct(stats.screeningRejections, stats.screening)}% of screened`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Screening -> Ghosted */}
        {ghosted > 0 && (
          <path
            d={ribbon(colX[1] + nodeW, screenGhostFlowY, colX[2], ghostedNodeY, hGhosted)}
            fill="url(#fc-drop)"
            opacity={0.5}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Ghosted", ghosted, `${pct(ghosted, stats.screening)}% of screened`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Technical -> Final */}
        {stats.final > 0 && (
          <path
            d={ribbon(colX[2] + nodeW, techPassY, colX[3], topY, hFinal)}
            fill="url(#fc-pass)"
            opacity={0.85}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Passed Technical to Final", stats.final, `${pct(stats.final, stats.technical)}% of technical`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Technical -> Technical Rejections */}
        {stats.technicalRejections > 0 && (
          <path
            d={ribbon(colX[2] + nodeW, techRejFlowY, colX[3], techRejNodeY, hTechRej)}
            fill="url(#fc-rej)"
            opacity={0.7}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Rejected After Technical", stats.technicalRejections, `${pct(stats.technicalRejections, stats.technical)}% of technical`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Final -> Offers */}
        {stats.offers > 0 && (
          <path
            d={ribbon(colX[3] + nodeW, finalPassY, colX[4], topY, hOffers)}
            fill="url(#fc-pass)"
            opacity={0.9}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Offer Received", stats.offers, `${pct(stats.offers, stats.final)}% of final`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Final -> Final Rejections */}
        {stats.finalRejections > 0 && (
          <path
            d={ribbon(colX[3] + nodeW, finalRejFlowY, colX[4], finalRejNodeY, hFinalRej)}
            fill="url(#fc-rej)"
            opacity={0.7}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Rejected After Final", stats.finalRejections, `${pct(stats.finalRejections, stats.final)}% of final`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* Final -> Declined */}
        {declined > 0 && (
          <path
            d={ribbon(colX[3] + nodeW, finalDeclinedFlowY, colX[4], declinedNodeY, hDeclined)}
            fill="url(#fc-drop)"
            opacity={0.5}
            className="cursor-pointer transition-opacity hover:opacity-100"
            onMouseEnter={() =>
              onHover("Declined / Stalled", declined, `${pct(declined, stats.final)}% of final`)
            }
            onMouseLeave={onLeave}
          />
        )}

        {/* ===== NODES ===== */}

        {/* Main chain */}
        <rect
          x={colX[0]} y={topY} width={nodeW} height={hTotal} fill="#000" rx={1}
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onMouseEnter={() => onHover("Total", stats.total, "100%")}
          onMouseLeave={onLeave}
        />
        {stats.screening > 0 && (
          <rect
            x={colX[1]} y={topY} width={nodeW} height={hScreen} fill="#000" rx={1}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onMouseEnter={() => onHover("Screening", stats.screening, `${screenRate}% of total`)}
            onMouseLeave={onLeave}
          />
        )}
        {stats.technical > 0 && (
          <rect
            x={colX[2]} y={topY} width={nodeW} height={hTech} fill="#000" rx={1}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onMouseEnter={() => onHover("Technical Interview", stats.technical, `${techRate}% of screened`)}
            onMouseLeave={onLeave}
          />
        )}
        {stats.final > 0 && (
          <rect
            x={colX[3]} y={topY} width={nodeW} height={hFinal} fill="#000" rx={1}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onMouseEnter={() => onHover("Final Round", stats.final, `${pct(stats.final, stats.technical)}% of technical`)}
            onMouseLeave={onLeave}
          />
        )}
        {stats.offers > 0 && (
          <rect
            x={colX[4]} y={topY} width={nodeW} height={hOffers} fill="#000" rx={1}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onMouseEnter={() => onHover("Offers", stats.offers, `${offerRate}% of total`)}
            onMouseLeave={onLeave}
          />
        )}

        {/* Rejection / drop-off nodes */}
        {drafts > 0 && (
          <rect x={colX[1]} y={draftsNodeY} width={nodeW} height={hDrafts} fill="#555" rx={1} />
        )}
        {stats.screeningRejections > 0 && (
          <rect x={colX[2]} y={screenRejNodeY} width={nodeW} height={hScreenRej} fill="#555" rx={1} />
        )}
        {ghosted > 0 && (
          <rect x={colX[2]} y={ghostedNodeY} width={nodeW} height={hGhosted} fill="#555" rx={1} />
        )}
        {stats.technicalRejections > 0 && (
          <rect x={colX[3]} y={techRejNodeY} width={nodeW} height={hTechRej} fill="#555" rx={1} />
        )}
        {stats.finalRejections > 0 && (
          <rect x={colX[4]} y={finalRejNodeY} width={nodeW} height={hFinalRej} fill="#555" rx={1} />
        )}
        {declined > 0 && (
          <rect x={colX[4]} y={declinedNodeY} width={nodeW} height={hDeclined} fill="#555" rx={1} />
        )}

        {/* ===== LABELS ===== */}

        {/* Main chain labels (above nodes) */}
        <text x={colX[0]} y={topY - 40} className="font-display font-bold text-sm" fill="#171c20">
          Total
        </text>
        <text x={colX[0]} y={topY - 20} className="font-sans text-base font-medium" fill="#4c4546">
          {stats.total}
        </text>

        {stats.screening > 0 && (
          <>
            <text x={colX[1]} y={topY - 40} className="font-display font-bold text-sm" fill="#171c20">
              Screening
            </text>
            <text x={colX[1]} y={topY - 20} className="font-sans text-base font-medium" fill="#4c4546">
              {stats.screening}
            </text>
          </>
        )}
        {stats.technical > 0 && (
          <>
            <text x={colX[2]} y={topY - 40} className="font-display font-bold text-sm" fill="#171c20">
              Technical Interview
            </text>
            <text x={colX[2]} y={topY - 20} className="font-sans text-base font-medium" fill="#4c4546">
              {stats.technical}
            </text>
          </>
        )}
        {stats.final > 0 && (
          <>
            <text x={colX[3]} y={topY - 40} className="font-display font-bold text-sm" fill="#171c20">
              Final Round
            </text>
            <text x={colX[3]} y={topY - 20} className="font-sans text-base font-medium" fill="#4c4546">
              {stats.final}
            </text>
          </>
        )}
        {stats.offers > 0 && (
          <>
            <text x={colX[4]} y={topY - 40} className="font-display font-bold text-sm" fill="#171c20">
              Offers
            </text>
            <text x={colX[4]} y={topY - 20} className="font-sans text-base font-semibold" fill="#10B981">
              {stats.offers}
            </text>
          </>
        )}

        {/* Rejection / drop-off labels (right of node) */}
        {drafts > 0 && (
          <text
            x={colX[1] + nodeW + 8}
            y={draftsNodeY + hDrafts / 2 + 4}
            className="font-sans text-xs"
            fill="#666"
          >
            Drafts ({drafts})
          </text>
        )}
        {stats.screeningRejections > 0 && (
          <text
            x={colX[2] + nodeW + 8}
            y={screenRejNodeY + hScreenRej / 2 + 4}
            className="font-sans text-xs"
            fill="#666"
          >
            Rejected ({stats.screeningRejections})
          </text>
        )}
        {ghosted > 0 && (
          <text
            x={colX[2] + nodeW + 8}
            y={ghostedNodeY + hGhosted / 2 + 4}
            className="font-sans text-xs"
            fill="#666"
          >
            Ghosted ({ghosted})
          </text>
        )}
        {stats.technicalRejections > 0 && (
          <text
            x={colX[3] + nodeW + 8}
            y={techRejNodeY + hTechRej / 2 + 4}
            className="font-sans text-xs"
            fill="#666"
          >
            Rejected ({stats.technicalRejections})
          </text>
        )}
        {stats.finalRejections > 0 && (
          <text
            x={colX[4] + nodeW + 8}
            y={finalRejNodeY + hFinalRej / 2 + 4}
            className="font-sans text-xs"
            fill="#666"
          >
            Rejected ({stats.finalRejections})
          </text>
        )}
        {declined > 0 && (
          <text
            x={colX[4] + nodeW + 8}
            y={declinedNodeY + hDeclined / 2 + 4}
            className="font-sans text-xs"
            fill="#666"
          >
            Declined ({declined})
          </text>
        )}

        {/* apted logo watermark (top-right) */}
        <text
          x={W - 14}
          y={28}
          textAnchor="end"
          style={{ fontFamily: "'Outfit', sans-serif" }}
          fontSize={compact ? 20 : 28}
          fontWeight={500}
          fill="#171c20"
          opacity={0.35}
        >
          apted
        </text>
      </svg>

      {/* Tooltip / summary bar - pinned to bottom of the pane */}
      <div className="mt-3 flex shrink-0 items-center justify-between text-xs">
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
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-4 md:flex">
            <span>
              <strong className="font-mono text-on-surface">{screenRate}%</strong> screen pass
            </span>
            <span>
              <strong className="font-mono text-on-surface">{techRate}%</strong> interview pass
            </span>
            <span className="text-status-success">
              <strong className="font-mono">{offerRate}%</strong> offer rate
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={exportPng} title="Export as PNG" className="inline-flex items-center gap-1 rounded px-2 py-1 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface">
              <Download className="h-3.5 w-3.5" /> PNG
            </button>
            <button onClick={exportSvg} title="Export as SVG" className="inline-flex items-center gap-1 rounded px-2 py-1 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface">
              <Download className="h-3.5 w-3.5" /> SVG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
