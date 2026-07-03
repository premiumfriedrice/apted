"use client";

import type { Application } from "@/lib/applications";

type Outcome = Application["outcome"];

const OUTCOME_COLORS: Record<Outcome, string> = {
  draft: "#e5e7eb",      // neutral-200
  applied: "#bfdbfe",    // blue-200
  interview: "#fde68a",  // amber-200
  offer: "#bbf7d0",      // green-200
  rejected: "#fecaca",   // red-200
};

const OUTCOME_TEXT: Record<Outcome, string> = {
  draft: "#374151",
  applied: "#1e40af",
  interview: "#92400e",
  offer: "#166534",
  rejected: "#991b1b",
};

const NODE_WIDTH = 72;
const UNIT_HEIGHT = 20;
const GAP = 6;
const PADDING = 16;

function curvePath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness0: number,
  thickness1: number,
) {
  const midX = (x0 + x1) / 2;
  return `
    M ${x0} ${y0 - thickness0 / 2}
    C ${midX} ${y0 - thickness0 / 2}, ${midX} ${y1 - thickness1 / 2}, ${x1} ${y1 - thickness1 / 2}
    L ${x1} ${y1 + thickness1 / 2}
    C ${midX} ${y1 + thickness1 / 2}, ${midX} ${y0 + thickness0 / 2}, ${x0} ${y0 + thickness0 / 2}
    Z
  `;
}

export function SankeyDiagram({ applications }: { applications: Application[] }) {
  if (applications.length === 0) return null;

  const total = applications.length;

  // Outcome counts and vertical offsets for the right column.
  const outcomeEntries = (
    ["draft", "applied", "interview", "offer", "rejected"] as Outcome[]
  )
    .map((outcome) => ({
      outcome,
      count: applications.filter((a) => a.outcome === outcome).length,
    }))
    .filter((e) => e.count > 0);

  const versionHeight = total * UNIT_HEIGHT;
  const appsHeight = total * UNIT_HEIGHT + (total - 1) * GAP;
  const outcomesHeight =
    outcomeEntries.reduce((sum, e) => sum + e.count * UNIT_HEIGHT, 0) +
    (outcomeEntries.length - 1) * GAP;

  const height = Math.max(versionHeight, appsHeight, outcomesHeight) + PADDING * 2;
  const width = 340;

  const colX = {
    version: PADDING + NODE_WIDTH / 2,
    apps: width / 2,
    outcomes: width - PADDING - NODE_WIDTH / 2,
  };

  // Center each column vertically.
  const startY = (height - appsHeight) / 2;
  const versionY = (height - versionHeight) / 2 + versionHeight / 2;
  const outcomesY = (height - outcomesHeight) / 2;

  // Build app nodes.
  let appAcc = 0;
  const appNodes = applications.map((app, i) => {
    const y = startY + appAcc * (UNIT_HEIGHT + GAP) + UNIT_HEIGHT / 2;
    appAcc += 1;
    return { app, y, index: i };
  });

  // Build outcome nodes with offsets matching the apps that flow into them.
  let outcomeAcc = 0;
  const outcomeNodes = outcomeEntries.map((entry) => {
    const nodeHeight = entry.count * UNIT_HEIGHT;
    const y = outcomesY + outcomeAcc * (UNIT_HEIGHT + GAP) + nodeHeight / 2;
    outcomeAcc += entry.count;
    return { ...entry, y, nodeHeight };
  });

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-outline-variant bg-surface p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ minWidth: `${width}px`, height: `${height}px` }}
        aria-label="Application flow diagram"
      >
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="0" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="#737686" />
          </marker>
        </defs>

        {/* Version → application links */}
        {appNodes.map((node) => (
          <path
            key={`v-${node.index}`}
            d={curvePath(
              colX.version + NODE_WIDTH / 2,
              versionY,
              colX.apps - NODE_WIDTH / 2,
              node.y,
              UNIT_HEIGHT,
              UNIT_HEIGHT,
            )}
            fill="currentColor"
            className="text-outline-variant/60"
          />
        ))}

        {/* Application → outcome links */}
        {appNodes.map((node) => {
          const outcomeNode = outcomeNodes.find((o) => o.outcome === node.app.outcome)!;
          return (
            <path
              key={`a-${node.index}`}
              d={curvePath(
                colX.apps + NODE_WIDTH / 2,
                node.y,
                colX.outcomes - NODE_WIDTH / 2,
                outcomeNode.y,
                UNIT_HEIGHT,
                UNIT_HEIGHT,
              )}
              fill={OUTCOME_COLORS[node.app.outcome]}
              opacity={0.7}
            />
          );
        })}

        {/* Version node */}
        <rect
          x={colX.version - NODE_WIDTH / 2}
          y={versionY - versionHeight / 2}
          width={NODE_WIDTH}
          height={versionHeight}
          rx={6}
          className="fill-surface-container-lowest stroke-outline-variant"
          strokeWidth={1}
        />
        <text
          x={colX.version}
          y={versionY}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-on-surface text-[10px] font-semibold"
        >
          Resume
        </text>

        {/* Application nodes */}
        {appNodes.map((node) => (
          <g key={`app-node-${node.index}`}>
            <rect
              x={colX.apps - NODE_WIDTH / 2}
              y={node.y - UNIT_HEIGHT / 2}
              width={NODE_WIDTH}
              height={UNIT_HEIGHT}
              rx={4}
              className="fill-surface-container-lowest stroke-outline-variant"
              strokeWidth={1}
            />
            <text
              x={colX.apps}
              y={node.y - 1}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-on-surface text-[9px] font-medium"
            >
              {node.app.company}
            </text>
            <text
              x={colX.apps}
              y={node.y + 8}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-on-surface-variant text-[8px]"
            >
              {node.app.role}
            </text>
          </g>
        ))}

        {/* Outcome nodes */}
        {outcomeNodes.map((node) => (
          <g key={`out-node-${node.outcome}`}>
            <rect
              x={colX.outcomes - NODE_WIDTH / 2}
              y={node.y - node.nodeHeight / 2}
              width={NODE_WIDTH}
              height={node.nodeHeight}
              rx={6}
              fill={OUTCOME_COLORS[node.outcome]}
              stroke={OUTCOME_TEXT[node.outcome]}
              strokeWidth={1}
              opacity={0.9}
            />
            <text
              x={colX.outcomes}
              y={node.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={OUTCOME_TEXT[node.outcome]}
              className="text-[10px] font-semibold uppercase tracking-wider"
            >
              {node.outcome}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
