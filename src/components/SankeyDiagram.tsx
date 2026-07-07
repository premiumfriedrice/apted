"use client";

import { useMemo } from "react";
import type { Application } from "@/lib/applications";

// Sankey funnel matching the reference SVG:
// - Thin black vertical nodes (first node wider at 100px, rest 20px)
// - Flows rendered as stroked paths (not filled), black + gray shades
// - Stage labels above nodes with small icons
// - Rejections branch downward at each stage

const NODE_WIDTH_FIRST = 100;
const NODE_WIDTH = 20;
const COL_GAP = 191; // x distance between column starts
const PADDING_X = 54;
const NODE_TOP_Y = 307; // baseline top for the first node
const MAX_NODE_HEIGHT = 411;
const LABEL_Y_OFFSET = 57; // label above node top
const VALUE_Y_OFFSET = 32; // value below label
const ICON_Y_OFFSET = 82; // icon above label

interface StagePos {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  value: number;
  icon: "total" | "search" | "code" | "users" | "x" | "handshake";
  labelSide: "above" | "right";
}

interface FlowDef {
  d: string;
  strokeWidth: number;
  stroke: string;
  opacity: number;
}

function buildPath(application: Application): {
  screening: boolean;
  technical: boolean;
  final: boolean;
  offer: boolean;
  rejectedAfter: "screen" | "technical" | "final" | null;
} {
  const interviewR = application.interviewRound ?? 0;
  const rejectedR = application.rejectedAfterRound ?? 0;

  if (application.outcome === "draft") {
    return { screening: false, technical: false, final: false, offer: false, rejectedAfter: null };
  }

  const screening = true;
  const technical = interviewR >= 1 || (application.outcome !== "applied" && application.outcome !== "ghosted" && rejectedR >= 1);
  const final = interviewR >= 2 || ((application.outcome === "offer" || application.outcome === "declined") && interviewR >= 2) || rejectedR >= 2;
  const offer = application.outcome === "offer";

  let rejectedAfter: "screen" | "technical" | "final" | null = null;
  if (application.outcome === "rejected") {
    if (rejectedR === 0) rejectedAfter = "screen";
    else if (rejectedR === 1) rejectedAfter = "technical";
    else rejectedAfter = "final";
  }

  return { screening, technical, final, offer, rejectedAfter };
}

export function SankeyDiagram({ applications }: { applications: Application[] }) {
  const { stages, flows, width, height } = useMemo(() => {
    // Count each stage.
    let total = applications.length;
    let screeningCount = 0;
    let technicalCount = 0;
    let finalCount = 0;
    let offerCount = 0;
    let rejScreen = 0;
    let rejTechnical = 0;
    let rejFinal = 0;

    const parsed = applications.map(buildPath);
    for (const p of parsed) {
      if (p.screening) screeningCount++;
      if (p.technical) technicalCount++;
      if (p.final) finalCount++;
      if (p.offer) offerCount++;
      if (p.rejectedAfter === "screen") rejScreen++;
      if (p.rejectedAfter === "technical") rejTechnical++;
      if (p.rejectedAfter === "final") rejFinal++;
    }

    const maxVal = Math.max(1, total);

    function hFor(value: number): number {
      if (value === 0) return 0;
      return Math.max(4, (value / maxVal) * MAX_NODE_HEIGHT);
    }

    const colX = [0, 1, 2, 3, 4].map((c) => PADDING_X + c * COL_GAP);

    // Node positions.
    // Col 0: Total Applications - centered around y=512 (middle of 307..718)
    const totalH = hFor(total);
    const totalY = NODE_TOP_Y + (MAX_NODE_HEIGHT - totalH) / 2;

    // Col 1: Screening top, Rejection-screen bottom
    const screeningH = hFor(screeningCount);
    const rejScreenH = hFor(rejScreen);
    const col1Gap = 20;
    const col1Total = screeningH + rejScreenH + col1Gap;
    const col1Top = NODE_TOP_Y + (MAX_NODE_HEIGHT - col1Total) / 2;
    const screeningY = col1Top;
    const rejScreenY = col1Top + screeningH + col1Gap;

    // Col 2: Technical top, Rejection-technical bottom
    const technicalH = hFor(technicalCount);
    const rejTechH = hFor(rejTechnical);
    const col2Gap = 20;
    const col2Total = technicalH + rejTechH + col2Gap;
    const col2Top = NODE_TOP_Y + (MAX_NODE_HEIGHT - col2Total) / 2;
    const technicalY = col2Top;
    const rejTechY = col2Top + technicalH + col2Gap;

    // Col 3: Final top, Rejection-final bottom
    const finalH = hFor(finalCount);
    const rejFinalH = hFor(rejFinal);
    const col3Gap = 20;
    const col3Total = finalH + rejFinalH + col3Gap;
    const col3Top = NODE_TOP_Y + (MAX_NODE_HEIGHT - col3Total) / 2;
    const finalY = col3Top;
    const rejFinalY = col3Top + finalH + col3Gap;

    // Col 4: Offers top, Rejection-final-right bottom
    const offerH = hFor(offerCount);
    const offerY = NODE_TOP_Y + (MAX_NODE_HEIGHT - offerH) / 2 - 30;

    const stageList: StagePos[] = [
      { x: colX[0], y: totalY, w: NODE_WIDTH_FIRST, h: totalH, label: "Total Applications", value: total, icon: "total", labelSide: "above" },
      { x: colX[1], y: screeningY, w: NODE_WIDTH, h: screeningH, label: "Screening", value: screeningCount, icon: "search", labelSide: "above" },
      { x: colX[1], y: rejScreenY, w: NODE_WIDTH, h: rejScreenH, label: "Rejections", value: rejScreen, icon: "x", labelSide: "right" },
      { x: colX[2], y: technicalY, w: NODE_WIDTH, h: technicalH, label: "Technical Interview", value: technicalCount, icon: "code", labelSide: "above" },
      { x: colX[2], y: rejTechY, w: NODE_WIDTH, h: rejTechH, label: "Rejections", value: rejTechnical, icon: "x", labelSide: "right" },
      { x: colX[3], y: finalY, w: NODE_WIDTH, h: finalH, label: "Final Round", value: finalCount, icon: "users", labelSide: "above" },
      { x: colX[3], y: rejFinalY, w: NODE_WIDTH, h: rejFinalH, label: "Rejections", value: rejFinal, icon: "x", labelSide: "right" },
      { x: colX[4], y: offerY, w: NODE_WIDTH, h: offerH, label: "Offers", value: offerCount, icon: "handshake", labelSide: "above" },
    ];

    // Build flows as stroked paths.
    const flowList: FlowDef[] = [];

    // Slot tracking for even distribution within each node.
    const sourceSlots = new Map<string, { idx: number; total: number }>();
    const targetSlots = new Map<string, { idx: number; total: number }>();

    function initSlots(key: string, total: number) {
      if (!sourceSlots.has(key)) sourceSlots.set(key, { idx: 0, total });
      if (!targetSlots.has(key)) targetSlots.set(key, { idx: 0, total });
    }

    // Initialize slot counts.
    initSlots("total", total);
    initSlots("screening", screeningCount);
    initSlots("technical", technicalCount);
    initSlots("final", finalCount);
    initSlots("rejScreen", rejScreen);
    initSlots("rejTechnical", rejTechnical);
    initSlots("rejFinal", rejFinal);
    initSlots("offer", offerCount);

    function sourceY(key: string, stage: StagePos): number {
      const s = sourceSlots.get(key)!;
      const slot = s.idx++;
      const t = s.total || 1;
      return stage.y + (stage.h * (slot + 0.5)) / t;
    }

    function targetY(key: string, stage: StagePos): number {
      const s = targetSlots.get(key)!;
      const slot = s.idx++;
      const t = s.total || 1;
      return stage.y + (stage.h * (slot + 0.5)) / t;
    }

    const totalStage = stageList[0];
    const screeningStage = stageList[1];
    const rejScreenStage = stageList[2];
    const technicalStage = stageList[3];
    const rejTechStage = stageList[4];
    const finalStage = stageList[5];
    const rejFinalStage = stageList[6];
    const offerStage = stageList[7];

    const flowThickness = (fromVal: number, toVal: number) => {
      if (toVal === 0) return 0;
      return Math.max(3, (toVal / Math.max(fromVal, 1)) * Math.min(totalStage.h, 80));
    };

    for (const p of parsed) {
      if (!p.screening) continue;

      // Total -> Screening
      const sy0 = sourceY("total", totalStage);
      const ty0 = targetY("screening", screeningStage);
      flowList.push({
        d: `M ${totalStage.x + totalStage.w} ${sy0} C ${(totalStage.x + totalStage.w + screeningStage.x) / 2} ${sy0}, ${(totalStage.x + totalStage.w + screeningStage.x) / 2} ${ty0}, ${screeningStage.x} ${ty0}`,
        strokeWidth: flowThickness(total, screeningCount),
        stroke: "black",
        opacity: 0.9,
      });

      if (p.rejectedAfter === "screen") {
        // Screening -> Rejection (screen)
        const sy1 = sourceY("screening", screeningStage);
        const ty1 = targetY("rejScreen", rejScreenStage);
        flowList.push({
          d: `M ${screeningStage.x + screeningStage.w} ${sy1} C ${(screeningStage.x + screeningStage.w + rejScreenStage.x) / 2} ${sy1}, ${(screeningStage.x + screeningStage.w + rejScreenStage.x) / 2} ${ty1}, ${rejScreenStage.x} ${ty1}`,
          strokeWidth: flowThickness(screeningCount, rejScreen),
          stroke: "#555",
          opacity: 0.8,
        });
        continue;
      }

      if (p.technical) {
        // Screening -> Technical
        const sy1 = sourceY("screening", screeningStage);
        const ty1 = targetY("technical", technicalStage);
        flowList.push({
          d: `M ${screeningStage.x + screeningStage.w} ${sy1} C ${(screeningStage.x + screeningStage.w + technicalStage.x) / 2} ${sy1}, ${(screeningStage.x + screeningStage.w + technicalStage.x) / 2} ${ty1}, ${technicalStage.x} ${ty1}`,
          strokeWidth: flowThickness(screeningCount, technicalCount),
          stroke: "#888",
          opacity: 0.9,
        });

        if (p.rejectedAfter === "technical") {
          // Technical -> Rejection (technical)
          const sy2 = sourceY("technical", technicalStage);
          const ty2 = targetY("rejTechnical", rejTechStage);
          flowList.push({
            d: `M ${technicalStage.x + technicalStage.w} ${sy2} C ${(technicalStage.x + technicalStage.w + rejTechStage.x) / 2} ${sy2}, ${(technicalStage.x + technicalStage.w + rejTechStage.x) / 2} ${ty2}, ${rejTechStage.x} ${ty2}`,
            strokeWidth: flowThickness(technicalCount, rejTechnical),
            stroke: "#666",
            opacity: 0.8,
          });
          continue;
        }

        if (p.final) {
          // Technical -> Final
          const sy2 = sourceY("technical", technicalStage);
          const ty2 = targetY("final", finalStage);
          flowList.push({
            d: `M ${technicalStage.x + technicalStage.w} ${sy2} C ${(technicalStage.x + technicalStage.w + finalStage.x) / 2} ${sy2}, ${(technicalStage.x + technicalStage.w + finalStage.x) / 2} ${ty2}, ${finalStage.x} ${ty2}`,
            strokeWidth: flowThickness(technicalCount, finalCount),
            stroke: "#aaa",
            opacity: 0.9,
          });

          if (p.rejectedAfter === "final") {
            // Final -> Rejection (final)
            const sy3 = sourceY("final", finalStage);
            const ty3 = targetY("rejFinal", rejFinalStage);
            flowList.push({
              d: `M ${finalStage.x + finalStage.w} ${sy3} C ${(finalStage.x + finalStage.w + rejFinalStage.x) / 2} ${sy3}, ${(finalStage.x + finalStage.w + rejFinalStage.x) / 2} ${ty3}, ${rejFinalStage.x} ${ty3}`,
              strokeWidth: flowThickness(finalCount, rejFinal),
              stroke: "#999",
              opacity: 0.8,
            });
            continue;
          }

          if (p.offer) {
            // Final -> Offers
            const sy3 = sourceY("final", finalStage);
            const ty3 = targetY("offer", offerStage);
            flowList.push({
              d: `M ${finalStage.x + finalStage.w} ${sy3} C ${(finalStage.x + finalStage.w + offerStage.x) / 2} ${sy3}, ${(finalStage.x + finalStage.w + offerStage.x) / 2} ${ty3}, ${offerStage.x} ${ty3}`,
              strokeWidth: flowThickness(finalCount, offerCount),
              stroke: "#ccc",
              opacity: 0.9,
            });
          }
        }
      }
    }

    const w = colX[4] + NODE_WIDTH + PADDING_X + 160;
    const h = 768;

    return { stages: stageList, flows: flowList, width: w, height: h };
  }, [applications]);

  if (applications.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block" style={{ minWidth: `${width}px`, height: `${height}px` }}>
        {/* Flows */}
        {flows.map((flow, i) => (
          <path
            key={`flow-${i}`}
            d={flow.d}
            stroke={flow.stroke}
            strokeWidth={flow.strokeWidth}
            fill="none"
            opacity={flow.opacity}
          />
        ))}

        {/* Nodes */}
        {stages.map((stage, i) => {
          if (stage.h === 0) return null;
          const labelX = stage.labelSide === "right" ? stage.x + stage.w + 26 : stage.x;
          const labelY = stage.y - LABEL_Y_OFFSET;
          const valueY = stage.y - VALUE_Y_OFFSET;
          const iconY = stage.y - ICON_Y_OFFSET;
          return (
            <g key={`stage-${i}`}>
              <rect x={stage.x} y={stage.y} width={stage.w} height={stage.h} fill="black" />

              {/* Icon */}
              {stage.icon === "search" && (
                <g transform={`translate(${stage.x - 5} ${iconY})`}>
                  <circle cx="10" cy="10" r="10" stroke="black" strokeWidth="2" fill="none" />
                  <line x1="17" y1="17" x2="25" y2="25" stroke="black" strokeWidth="2" />
                </g>
              )}
              {stage.icon === "code" && (
                <text x={stage.x} y={iconY + 14} fontFamily="monospace" fontSize="14" fontWeight="bold" fill="black">&lt;/&gt;</text>
              )}
              {stage.icon === "users" && (
                <g transform={`translate(${stage.x} ${iconY})`}>
                  <circle cx="7" cy="8" r="5" stroke="black" strokeWidth="2" fill="none" />
                  <path d="M0 18 Q 7 12 14 18" stroke="black" strokeWidth="2" fill="none" />
                </g>
              )}
              {stage.icon === "x" && (
                <g transform={`translate(${stage.x + 23} ${iconY})`}>
                  <circle cx="10" cy="10" r="10" stroke="black" strokeWidth="1.5" fill="none" />
                  <line x1="5" y1="5" x2="15" y2="15" stroke="black" strokeWidth="1.5" />
                  <line x1="15" y1="5" x2="5" y2="15" stroke="black" strokeWidth="1.5" />
                </g>
              )}
              {stage.icon === "handshake" && (
                <g transform={`translate(${stage.x - 8} ${iconY})`}>
                  <path d="M0 10 Q 10 5 20 10 M 5 20 Q 15 15 25 20" stroke="black" strokeWidth="1.5" fill="none" />
                </g>
              )}
              {stage.icon === "total" && (
                <g transform={`translate(${stage.x} ${iconY})`}>
                  <rect x="0" y="2" width="18" height="4" fill="black" />
                  <rect x="0" y="10" width="18" height="4" fill="black" />
                  <rect x="0" y="18" width="12" height="4" fill="black" />
                </g>
              )}

              {/* Label */}
              <text x={labelX} y={labelY} fontFamily="Inter, sans-serif" fontSize="16" fontWeight="600" fill="black">
                {stage.label}
              </text>
              {/* Value */}
              <text x={labelX} y={valueY} fontFamily="Inter, sans-serif" fontSize="20" fontWeight="400" fill="black">
                {stage.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
