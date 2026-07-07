"use client";

import { useMemo } from "react";
import type { Application } from "@/lib/applications";

type Outcome = Application["outcome"];

// Monochrome palette matching the screenshot: black nodes, gray flows,
// dark terminals, light text labels.
const PALETTE = {
  source: { fill: "#111827", stroke: "#1f2937", text: "#ffffff", flow: "#111827" },
  screen: { fill: "#111827", stroke: "#1f2937", text: "#ffffff", flow: "#111827" },
  interview: { fill: "#1f2937", stroke: "#374151", text: "#ffffff", flow: "#4b5563" },
  final: { fill: "#111827", stroke: "#1f2937", text: "#ffffff", flow: "#4b5563" },
  offer: { fill: "#065f46", stroke: "#047857", text: "#ffffff", flow: "#6b7280" },
  rejection: { fill: "#dc2626", stroke: "#b91c1c", text: "#ffffff", flow: "#9ca3af" },
  ghosted: { fill: "#6b7280", stroke: "#4b5563", text: "#ffffff", flow: "#9ca3af" },
};

const NODE_WIDTH = 24;
const NODE_GAP = 140;
const MIN_NODE_HEIGHT = 48;
const PADDING_X = 40;
const PADDING_Y = 56;
const LINK_CURVE = 0.5;

type StageKey =
  | "applied"
  | "screening"
  | "technical"
  | "final"
  | "offer"
  | "rejection-after-screen"
  | "rejection-after-technical"
  | "rejection-after-final"
  | "ghosted";

interface StageDef {
  key: StageKey;
  col: number;
  label: string;
  sublabel?: string;
  palette: typeof PALETTE.source;
  terminal?: "down" | "right";
}

const STAGES: StageDef[] = [
  { key: "applied", col: 0, label: "Total Applications", palette: PALETTE.source },
  { key: "screening", col: 1, label: "Screening", palette: PALETTE.screen },
  { key: "rejection-after-screen", col: 1, label: "Rejection", palette: PALETTE.rejection, terminal: "down" },
  { key: "technical", col: 2, label: "Technical Interview", palette: PALETTE.interview },
  { key: "rejection-after-technical", col: 2, label: "Rejection", palette: PALETTE.rejection, terminal: "down" },
  { key: "final", col: 3, label: "Final Round", palette: PALETTE.final },
  { key: "rejection-after-final", col: 3, label: "Rejection", palette: PALETTE.rejection, terminal: "down" },
  { key: "offer", col: 4, label: "Offers", palette: PALETTE.offer },
];

function buildPath(application: Application): StageKey[] {
  const path: StageKey[] = ["applied", "screening"];
  const interviewR = application.interviewRound ?? 0;
  const rejectedR = application.rejectedAfterRound ?? 0;

  if (application.outcome === "draft") return ["applied"];
  if (application.outcome === "applied") return path;
  if (application.outcome === "ghosted") return [...path, "ghosted"];
  if (application.outcome === "rejected") {
    if (rejectedR === 0) return [...path, "rejection-after-screen"];
    if (rejectedR === 1) return [...path, "technical", "rejection-after-technical"];
    return [...path, "technical", "final", "rejection-after-final"];
  }
  if (application.outcome === "interviewing") {
    if (interviewR <= 1) return [...path, "technical"];
    return [...path, "technical", "final"];
  }
  // offer / declined
  return [...path, "technical", "final", "offer"];
}

function linkPath(x0: number, y0: number, x1: number, y1: number, thickness: number) {
  const c0x = x0 + (x1 - x0) * LINK_CURVE;
  const c1x = x1 - (x1 - x0) * LINK_CURVE;
  const ht = thickness / 2;
  return `
    M ${x0} ${y0 - ht}
    C ${c0x} ${y0 - ht}, ${c1x} ${y1 - ht}, ${x1} ${y1 - ht}
    L ${x1} ${y1 + ht}
    C ${c1x} ${y1 + ht}, ${c0x} ${y0 + ht}, ${x0} ${y0 + ht}
    Z
  `;
}

export function SankeyDiagram({ applications }: { applications: Application[] }) {
  const { width, height, stages, links } = useMemo(() => {
    // Count per stage.
    const counts = new Map<StageKey, number>();
    const paths: { appIndex: number; keys: StageKey[] }[] = [];

    applications.forEach((app, appIndex) => {
      const keys = buildPath(app);
      paths.push({ appIndex, keys });
      keys.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
    });

    const maxValue = Math.max(1, ...Array.from(counts.values()));
    const totalHeight = 320;
    const availableHeight = totalHeight - PADDING_Y * 2;

    function nodeHeight(value: number) {
      const ratio = value / maxValue;
      return Math.max(MIN_NODE_HEIGHT, availableHeight * ratio);
    }

    // X positions for each column.
    const colX = [0, 1, 2, 3, 4].map((col) => PADDING_X + col * (NODE_WIDTH + NODE_GAP));

    // Compute stage positions.
    const stageMap = new Map<StageKey, { x: number; y: number; w: number; h: number; def: StageDef; value: number }>();

    // Column 0: applied (centered vertically).
    const appliedH = nodeHeight((counts.get("applied") ?? applications.length) || 1);
    stageMap.set("applied", {
      x: colX[0],
      y: PADDING_Y + (availableHeight - appliedH) / 2,
      w: NODE_WIDTH,
      h: appliedH,
      def: STAGES.find((s) => s.key === "applied")!,
      value: (counts.get("applied") ?? applications.length) || 0,
    });

    // Column 1: screening top, rejection-after-screen bottom.
    const screeningH = nodeHeight(counts.get("screening") ?? 0);
    const rejScreenH = nodeHeight(counts.get("rejection-after-screen") ?? 0);
    const gap1 = 24;
    const col1Total = screeningH + rejScreenH + gap1;
    const col1Top = PADDING_Y + (availableHeight - col1Total) / 2;
    stageMap.set("screening", {
      x: colX[1],
      y: col1Top,
      w: NODE_WIDTH,
      h: screeningH,
      def: STAGES.find((s) => s.key === "screening")!,
      value: counts.get("screening") ?? 0,
    });
    if (counts.get("rejection-after-screen")) {
      stageMap.set("rejection-after-screen", {
        x: colX[1],
        y: col1Top + screeningH + gap1,
        w: NODE_WIDTH,
        h: rejScreenH,
        def: STAGES.find((s) => s.key === "rejection-after-screen")!,
        value: counts.get("rejection-after-screen") ?? 0,
      });
    }

    // Column 2: technical top, rejection-after-technical bottom.
    const technicalH = nodeHeight(counts.get("technical") ?? 0);
    const rejTechH = nodeHeight(counts.get("rejection-after-technical") ?? 0);
    const gap2 = 24;
    const col2Total = technicalH + rejTechH + gap2;
    const col2Top = PADDING_Y + (availableHeight - col2Total) / 2;
    stageMap.set("technical", {
      x: colX[2],
      y: col2Top,
      w: NODE_WIDTH,
      h: technicalH,
      def: STAGES.find((s) => s.key === "technical")!,
      value: counts.get("technical") ?? 0,
    });
    if (counts.get("rejection-after-technical")) {
      stageMap.set("rejection-after-technical", {
        x: colX[2],
        y: col2Top + technicalH + gap2,
        w: NODE_WIDTH,
        h: rejTechH,
        def: STAGES.find((s) => s.key === "rejection-after-technical")!,
        value: counts.get("rejection-after-technical") ?? 0,
      });
    }

    // Column 3: final top, rejection-after-final bottom.
    const finalH = nodeHeight(counts.get("final") ?? 0);
    const rejFinalH = nodeHeight(counts.get("rejection-after-final") ?? 0);
    const gap3 = 24;
    const col3Total = finalH + rejFinalH + gap3;
    const col3Top = PADDING_Y + (availableHeight - col3Total) / 2;
    stageMap.set("final", {
      x: colX[3],
      y: col3Top,
      w: NODE_WIDTH,
      h: finalH,
      def: STAGES.find((s) => s.key === "final")!,
      value: counts.get("final") ?? 0,
    });
    if (counts.get("rejection-after-final")) {
      stageMap.set("rejection-after-final", {
        x: colX[3],
        y: col3Top + finalH + gap3,
        w: NODE_WIDTH,
        h: rejFinalH,
        def: STAGES.find((s) => s.key === "rejection-after-final")!,
        value: counts.get("rejection-after-final") ?? 0,
      });
    }

    // Column 4: offer.
    const offerH = nodeHeight(counts.get("offer") ?? 0);
    stageMap.set("offer", {
      x: colX[4],
      y: PADDING_Y + (availableHeight - offerH) / 2,
      w: NODE_WIDTH,
      h: offerH,
      def: STAGES.find((s) => s.key === "offer")!,
      value: counts.get("offer") ?? 0,
    });

    // Build links with slot-based positions for clean routing.
    const links: { x0: number; y0: number; x1: number; y1: number; thickness: number; fill: string }[] = [];

    // For each source stage, evenly distribute outgoing apps across its height.
    const sourceSlotIndex = new Map<string, number>();
    const getSourceY = (key: StageKey) => {
      const s = stageMap.get(key)!;
      const idx = sourceSlotIndex.get(key) ?? 0;
      sourceSlotIndex.set(key, idx + 1);
      return s.y + (s.h * (idx + 0.5)) / (counts.get(key) || 1);
    };

    const targetSlotIndex = new Map<string, number>();
    const getTargetY = (key: StageKey) => {
      const s = stageMap.get(key)!;
      const idx = targetSlotIndex.get(key) ?? 0;
      targetSlotIndex.set(key, idx + 1);
      return s.y + (s.h * (idx + 0.5)) / (counts.get(key) || 1);
    };

    paths.forEach(({ keys }) => {
      for (let i = 0; i < keys.length - 1; i++) {
        const sourceKey = keys[i];
        const targetKey = keys[i + 1];
        const source = stageMap.get(sourceKey)!;
        const target = stageMap.get(targetKey)!;
        const thickness = Math.max(2, Math.min(source.h, target.h) / (counts.get(sourceKey) || 1));
        links.push({
          x0: source.x + source.w,
          y0: getSourceY(sourceKey),
          x1: target.x,
          y1: getTargetY(targetKey),
          thickness,
          fill: target.def.palette.flow,
        });
      }
    });

    const width = colX[4] + NODE_WIDTH + PADDING_X;
    const height = totalHeight;

    return { width, height, stages: Array.from(stageMap.values()), links };
  }, [applications]);

  if (applications.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block" style={{ minWidth: `${width}px`, height: `${height}px` }}>
        {links.map((link, i) => (
          <path
            key={`link-${i}`}
            d={linkPath(link.x0, link.y0, link.x1, link.y1, link.thickness)}
            fill={link.fill}
            opacity={0.6}
          />
        ))}

        {stages.map((stage) => (
          <g key={stage.def.key}>
            <rect
              x={stage.x}
              y={stage.y}
              width={stage.w}
              height={stage.h}
              rx={6}
              fill={stage.def.palette.fill}
              stroke={stage.def.palette.stroke}
              strokeWidth={1}
            />
            <text
              x={stage.x + stage.w / 2}
              y={stage.y + stage.h / 2 - 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={stage.def.palette.text}
              fontSize={11}
              fontWeight={700}
            >
              {stage.def.label}
            </text>
            <text
              x={stage.x + stage.w / 2}
              y={stage.y + stage.h / 2 + 9}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={stage.def.palette.text}
              fontSize={10}
              opacity={0.9}
            >
              {stage.value}
            </text>
          </g>
        ))}

        {/* Stage labels above nodes */}
        {stages.map((stage) => (
          <text
            key={`label-${stage.def.key}`}
            x={stage.x + stage.w / 2}
            y={stage.y - 12}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#374151"
            fontSize={11}
            fontWeight={500}
          >
            {stage.def.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
