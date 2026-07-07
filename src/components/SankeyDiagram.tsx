"use client";

import { useMemo } from "react";
import type { Application } from "@/lib/applications";

type Outcome = Application["outcome"];

const STAGE_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  draft: { fill: "#f3f4f6", stroke: "#d1d5db", text: "#374151" },
  applied: { fill: "#dbeafe", stroke: "#93c5fd", text: "#1e3a8a" },
  ghosted: { fill: "#e2e8f0", stroke: "#94a3b8", text: "#475569" },
  interviewing: { fill: "#fef3c7", stroke: "#fbbf24", text: "#78350f" },
  rejected: { fill: "#fee2e2", stroke: "#f87171", text: "#7f1d1d" },
  offer: { fill: "#dcfce7", stroke: "#4ade80", text: "#14532d" },
  declined: { fill: "#f3e8ff", stroke: "#c084fc", text: "#581c87" },
};

const UNIT = 22;
const GAP = 6;
const PADDING = 24;
const NODE_WIDTH = 100;
const MIN_WIDTH = 420;

interface Stage {
  id: string;
  label: string;
  sublabel?: string;
  col: number;
  value: number;
  top: number;
  bottom: number;
  x: number;
  y: number;
  fill: string;
  stroke: string;
  text: string;
  appSlots: { appIndex: number; y: number }[];
}

interface Link {
  sourceStage: string;
  targetStage: string;
  appIndex: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  fill: string;
}

function stageColor(stageId: string) {
  if (stageId === "draft") return STAGE_COLORS.draft;
  if (stageId === "applied") return STAGE_COLORS.applied;
  if (stageId === "ghosted") return STAGE_COLORS.ghosted;
  if (stageId.startsWith("interview-")) return STAGE_COLORS.interviewing;
  if (stageId.startsWith("rejected-")) return STAGE_COLORS.rejected;
  if (stageId === "offer") return STAGE_COLORS.offer;
  if (stageId === "declined") return STAGE_COLORS.declined;
  return STAGE_COLORS.draft;
}

function stageIdAndCol(app: Application) {
  const interviewR = app.interviewRound ?? 0;
  const rejectedR = app.rejectedAfterRound ?? 0;

  switch (app.outcome) {
    case "draft":
      return [{ id: "draft", col: 0, label: "Draft" }];
    case "applied":
      return [
        { id: "draft", col: 0, label: "Draft" },
        { id: "applied", col: 1, label: "Applied" },
      ];
    case "ghosted":
      return [
        { id: "draft", col: 0, label: "Draft" },
        { id: "applied", col: 1, label: "Applied" },
        { id: "ghosted", col: 2, label: "Ghosted" },
      ];
    case "rejected":
      if (rejectedR === 0) {
        return [
          { id: "draft", col: 0, label: "Draft" },
          { id: "applied", col: 1, label: "Applied" },
          { id: "rejected-0", col: 2, label: "Rejected", sublabel: "after applied" },
        ];
      }
      return [
        { id: "draft", col: 0, label: "Draft" },
        { id: "applied", col: 1, label: "Applied" },
        ...Array.from({ length: rejectedR }, (_, i) => ({
          id: `interview-${i + 1}`,
          col: i + 2,
          label: `Round ${i + 1}`,
        })),
        { id: `rejected-${rejectedR}`, col: rejectedR + 2, label: "Rejected", sublabel: `after round ${rejectedR}` },
      ];
    case "interviewing":
      return [
        { id: "draft", col: 0, label: "Draft" },
        { id: "applied", col: 1, label: "Applied" },
        ...Array.from({ length: interviewR }, (_, i) => ({
          id: `interview-${i + 1}`,
          col: i + 2,
          label: `Round ${i + 1}`,
        })),
      ];
    case "offer":
    case "declined": {
      const terminal = app.outcome;
      const rounds = interviewR;
      const base = [
        { id: "draft", col: 0, label: "Draft" },
        { id: "applied", col: 1, label: "Applied" },
      ];
      if (rounds > 0) {
        return [
          ...base,
          ...Array.from({ length: rounds }, (_, i) => ({
            id: `interview-${i + 1}`,
            col: i + 2,
            label: `Round ${i + 1}`,
          })),
          { id: terminal, col: rounds + 2, label: terminal.charAt(0).toUpperCase() + terminal.slice(1) },
        ];
      }
      return [...base, { id: terminal, col: 2, label: terminal.charAt(0).toUpperCase() + terminal.slice(1) }];
    }
    default:
      return [{ id: "draft", col: 0, label: "Draft" }];
  }
}

function linkPath(x0: number, y0: number, x1: number, y1: number, thickness: number) {
  const c0 = x0 + (x1 - x0) * 0.5;
  const c1 = x0 + (x1 - x0) * 0.5;
  const ht = thickness / 2;
  return `
    M ${x0} ${y0 - ht}
    C ${c0} ${y0 - ht}, ${c1} ${y1 - ht}, ${x1} ${y1 - ht}
    L ${x1} ${y1 + ht}
    C ${c1} ${y1 + ht}, ${c0} ${y0 + ht}, ${x0} ${y0 + ht}
    Z
  `;
}

export function SankeyDiagram({ applications }: { applications: Application[] }) {
  const { stages, links, width, height } = useMemo(() => {
    // 1. Build per-application paths.
    const paths = applications.map((app, appIndex) => ({
      appIndex,
      stages: stageIdAndCol(app),
    }));

    // 2. Aggregate stage values and collect app slots.
    const stageMap = new Map<string, Stage>();
    paths.forEach(({ appIndex, stages }) => {
      stages.forEach((s) => {
        if (!stageMap.has(s.id)) {
          stageMap.set(s.id, {
            id: s.id,
            label: s.label,
            sublabel: (s as { sublabel?: string }).sublabel,
            col: s.col,
            value: 0,
            top: 0,
            bottom: 0,
            x: 0,
            y: 0,
            ...stageColor(s.id),
            appSlots: [],
          });
        }
        stageMap.get(s.id)!.value += 1;
        stageMap.get(s.id)!.appSlots.push({ appIndex, y: 0 });
      });
    });

    // 3. Determine max column and overall width/height.
    const maxCol = Math.max(0, ...Array.from(stageMap.values()).map((s) => s.col));
    const colCount = maxCol + 1;
    const width = Math.max(MIN_WIDTH, PADDING * 2 + NODE_WIDTH * colCount + 40 * maxCol);
    const colGap = (width - PADDING * 2 - NODE_WIDTH * colCount) / Math.max(1, maxCol);

    // 4. Position stages within columns and assign vertical slots.
    const stagesByCol: Stage[][] = Array.from({ length: colCount }, () => []);
    stageMap.forEach((stage) => stagesByCol[stage.col].push(stage));

    stagesByCol.forEach((colStages) => {
      const colHeight = colStages.reduce((sum, s) => sum + s.value * UNIT + (s.value - 1) * GAP, 0) +
        (colStages.length - 1) * GAP * 2;
      let y = (Math.max(...Array.from(stageMap.values()).map((s) => s.value * UNIT + (s.value - 1) * GAP + GAP * 2), 64) - colHeight) / 2;
      if (y < PADDING) y = PADDING;

      colStages.forEach((stage) => {
        const nodeHeight = stage.value * UNIT + (stage.value - 1) * GAP;
        stage.x = PADDING + stage.col * (NODE_WIDTH + colGap);
        stage.top = y;
        stage.bottom = y + nodeHeight;
        stage.y = y + nodeHeight / 2;

        // Assign y positions to each app slot within this stage.
        stage.appSlots.forEach((slot, i) => {
          slot.y = stage.top + i * (UNIT + GAP) + UNIT / 2;
        });

        y += nodeHeight + GAP * 2;
      });
    });

    const height = Math.max(
      120,
      ...Array.from(stageMap.values()).map((s) => s.bottom),
    ) + PADDING;

    // 5. Build links using slot positions.
    const links: Link[] = [];
    paths.forEach(({ appIndex, stages }) => {
      for (let i = 0; i < stages.length - 1; i++) {
        const source = stageMap.get(stages[i].id)!;
        const target = stageMap.get(stages[i + 1].id)!;
        const sSlot = source.appSlots.find((slot) => slot.appIndex === appIndex)!;
        const tSlot = target.appSlots.find((slot) => slot.appIndex === appIndex)!;
        links.push({
          sourceStage: source.id,
          targetStage: target.id,
          appIndex,
          x0: source.x + NODE_WIDTH,
          x1: target.x,
          y0: sSlot.y,
          y1: tSlot.y,
          fill: target.fill,
        });
      }
    });

    return {
      stages: Array.from(stageMap.values()).sort((a, b) => a.col - b.col || a.top - b.top),
      links,
      width,
      height,
    };
  }, [applications]);

  if (applications.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block"
        style={{ minWidth: `${width}px`, height: `${height}px` }}
        aria-label="Application funnel"
      >
        <defs>
          {links.map((link, i) => (
            <linearGradient key={`grad-${i}`} id={`grad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={stages.find((s) => s.id === link.sourceStage)?.fill ?? "#e5e7eb"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={link.fill} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>

        {links.map((link, i) => (
          <path
            key={`link-${i}`}
            d={linkPath(link.x0, link.y0, link.x1, link.y1, UNIT)}
            fill={`url(#grad-${i})`}
            opacity={0.7}
            stroke="none"
          />
        ))}

        {stages.map((stage) => (
          <g key={stage.id}>
            <rect
              x={stage.x}
              y={stage.top}
              width={NODE_WIDTH}
              height={stage.bottom - stage.top}
              rx={6}
              fill={stage.fill}
              stroke={stage.stroke}
              strokeWidth={1.5}
            />
            <text
              x={stage.x + NODE_WIDTH / 2}
              y={stage.y - (stage.sublabel ? 6 : 0)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={stage.text}
              fontSize={11}
              fontWeight={700}
            >
              {stage.label}
            </text>
            <text
              x={stage.x + NODE_WIDTH / 2}
              y={stage.y + 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={stage.text}
              fontSize={9}
              opacity={0.85}
            >
              {stage.value}
            </text>
            {stage.sublabel && (
              <text
                x={stage.x + NODE_WIDTH / 2}
                y={stage.y + 18}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={stage.text}
                fontSize={8}
                opacity={0.7}
              >
                {stage.sublabel}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
