"use client";

import { useMemo } from "react";
import type { Application } from "@/lib/applications";

type Outcome = Application["outcome"];

const OUTCOMES: Outcome[] = ["draft", "applied", "interview", "offer", "rejected"];

const OUTCOME_FILL: Record<Outcome, string> = {
  draft: "#e5e7eb",
  applied: "#bfdbfe",
  interview: "#fde68a",
  offer: "#bbf7d0",
  rejected: "#fecaca",
};

const OUTCOME_STROKE: Record<Outcome, string> = {
  draft: "#9ca3af",
  applied: "#60a5fa",
  interview: "#fbbf24",
  offer: "#4ade80",
  rejected: "#f87171",
};

const OUTCOME_TEXT: Record<Outcome, string> = {
  draft: "#374151",
  applied: "#1e3a8a",
  interview: "#78350f",
  offer: "#14532d",
  rejected: "#7f1d1d",
};

const APP_PASTELS = [
  "#f3f4f6",
  "#f9fafb",
  "#eef2ff",
  "#f0f9ff",
  "#f0fdf4",
  "#fffbeb",
  "#fff1f2",
];

const WIDTH = 520;
const NODE_WIDTH = 92;
const UNIT = 16;
const GAP = 10;
const PADDING = 20;
const COLUMN_GAP = (WIDTH - PADDING * 2 - NODE_WIDTH * 3) / 2;

interface Node {
  id: string;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  top: number;
  bottom: number;
  value: number;
  fill?: string;
  stroke?: string;
  textColor?: string;
  leftAccent?: string;
}

interface Link {
  sourceTop: number;
  sourceBottom: number;
  targetTop: number;
  targetBottom: number;
  x0: number;
  x1: number;
  fill: string;
  opacity?: number;
}

function linkPath(l: Link) {
  const y0t = l.sourceTop;
  const y0b = l.sourceBottom;
  const y1t = l.targetTop;
  const y1b = l.targetBottom;
  const x0 = l.x0;
  const x1 = l.x1;
  const c0 = x0 + (x1 - x0) * 0.55;
  const c1 = x0 + (x1 - x0) * 0.45;

  return `
    M ${x0} ${y0t}
    C ${c0} ${y0t}, ${c1} ${y1t}, ${x1} ${y1t}
    L ${x1} ${y1b}
    C ${c1} ${y1b}, ${c0} ${y0b}, ${x0} ${y0b}
    Z
  `;
}

export function SankeyDiagram({ applications }: { applications: Application[] }) {
  const { nodes, links, height } = useMemo(() => {
    const total = applications.length || 1;

    // Outcome counts in canonical order.
    const outcomeCounts = OUTCOMES.map((outcome) => ({
      outcome,
      count: applications.filter((a) => a.outcome === outcome).length,
    })).filter((o) => o.count > 0);

    // Column x positions (left edge of each node).
    const x0 = PADDING;
    const x1 = PADDING + NODE_WIDTH + COLUMN_GAP;
    const x2 = PADDING + NODE_WIDTH * 2 + COLUMN_GAP * 2;

    // Compute column heights to vertically center them.
    const versionHeight = total * UNIT;
    const appsHeight = applications.length * UNIT + (applications.length - 1) * GAP;
    const outcomesHeight =
      outcomeCounts.reduce((sum, o) => sum + o.count * UNIT, 0) +
      (outcomeCounts.length - 1) * GAP;

    const maxColHeight = Math.max(versionHeight, appsHeight, outcomesHeight, 64);
    const height = maxColHeight + PADDING * 2;

    const versionTop = (height - versionHeight) / 2;
    const appsTop = (height - appsHeight) / 2;
    const outcomesTop = (height - outcomesHeight) / 2;

    const nodes: Node[] = [];
    const links: Link[] = [];

    // Level 0: Resume version node.
    nodes.push({
      id: "version",
      label: `${total}`,
      sublabel: total === 1 ? "Application" : "Applications",
      x: x0,
      y: versionTop + versionHeight / 2,
      top: versionTop,
      bottom: versionTop + versionHeight,
      value: total,
      fill: "#f3f4f6",
      stroke: "#d1d5db",
      textColor: "#111827",
      leftAccent: "#db2777",
    });

    // Level 1: Application nodes.
    const appNodes: Node[] = [];
    applications.forEach((app, i) => {
      const top = appsTop + i * (UNIT + GAP);
      const node: Node = {
        id: `app-${app.id}`,
        label: app.company,
        sublabel: app.role,
        x: x1,
        y: top + UNIT / 2,
        top,
        bottom: top + UNIT,
        value: 1,
        fill: APP_PASTELS[i % APP_PASTELS.length],
        stroke: "#d1d5db",
        textColor: "#111827",
      };
      appNodes.push(node);
      nodes.push(node);

      links.push({
        sourceTop: versionTop + i * UNIT,
        sourceBottom: versionTop + (i + 1) * UNIT,
        targetTop: top,
        targetBottom: top + UNIT,
        x0: x0 + NODE_WIDTH,
        x1: x1,
        fill: "#9ca3af",
        opacity: 0.35,
      });
    });

    // Level 2: Outcome nodes.
    let outcomeOffset = 0;
    outcomeCounts.forEach(({ outcome, count }) => {
      const top = outcomesTop + outcomeOffset * (UNIT + GAP);
      const nodeHeight = count * UNIT + (count - 1) * GAP;
      const node: Node = {
        id: `outcome-${outcome}`,
        label: `${count}`,
        sublabel: outcome.charAt(0).toUpperCase() + outcome.slice(1),
        x: x2,
        y: top + nodeHeight / 2,
        top,
        bottom: top + nodeHeight,
        value: count,
        fill: OUTCOME_FILL[outcome],
        stroke: OUTCOME_STROKE[outcome],
        textColor: OUTCOME_TEXT[outcome],
      };
      nodes.push(node);

      // Links from matching apps to this outcome.
      let appIndex = 0;
      applications.forEach((app, i) => {
        if (app.outcome !== outcome) return;
        const appTop = appNodes[i].top;
        const appBottom = appNodes[i].bottom;
        const targetTop = top + appIndex * (UNIT + GAP);
        const targetBottom = targetTop + UNIT;
        appIndex += 1;

        links.push({
          sourceTop: appTop,
          sourceBottom: appBottom,
          targetTop,
          targetBottom,
          x0: x1 + NODE_WIDTH,
          x1: x2,
          fill: OUTCOME_STROKE[outcome],
          opacity: 0.5,
        });
      });

      outcomeOffset += count;
    });

    return { nodes, links, height };
  }, [applications]);

  if (applications.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="mx-auto block"
        style={{ minWidth: `${WIDTH}px`, height: `${height}px` }}
        aria-label="Application outcome flow"
      >
        {links.map((l, i) => (
          <path
            key={`link-${i}`}
            d={linkPath(l)}
            fill={l.fill}
            opacity={l.opacity ?? 1}
            stroke="none"
          />
        ))}

        {nodes.map((node) => (
          <g key={node.id}>
            {node.leftAccent && (
              <rect
                x={node.x}
                y={node.top}
                width={4}
                height={node.bottom - node.top}
                rx={2}
                fill={node.leftAccent}
              />
            )}
            <rect
              x={node.x}
              y={node.top}
              width={NODE_WIDTH}
              height={node.bottom - node.top}
              rx={5}
              fill={node.fill}
              stroke={node.stroke}
              strokeWidth={1}
            />
            <text
              x={node.x + NODE_WIDTH / 2}
              y={node.y - 3}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={node.textColor}
              fontSize={11}
              fontWeight={600}
            >
              {node.label}
            </text>
            {node.sublabel && (
              <text
                x={node.x + NODE_WIDTH / 2}
                y={node.y + 9}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={node.textColor}
                fontSize={8}
                fontWeight={500}
              >
                {node.sublabel.length > 16
                  ? `${node.sublabel.slice(0, 16)}…`
                  : node.sublabel}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
