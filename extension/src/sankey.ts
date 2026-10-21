// Vanilla-TS Sankey funnel for the side panel — a faithful port of the web
// app's FunnelChart.tsx (src/components/FunnelChart.tsx). Same geometry, same
// ribbon math, same hover semantics; renders into a container element and
// reports hover info through a callback so the host page can display it.
//
// Every node height is proportional to its value (uniform scale), every flow
// ribbon has constant thickness = value * scale at BOTH ends, and drop-off
// buckets (drafts, ghosted, declined) are derived so flow conservation is
// visually exact.

export interface FunnelStats {
  total: number;
  screening: number;
  technical: number;
  final: number;
  offers: number;
  screeningRejections: number;
  technicalRejections: number;
  finalRejections: number;
}

export type FunnelInput = {
  outcome: string;
  interviewRound?: number | null;
  rejectedAfterRound?: number | null;
};

/** Port of the funnel computation in src/app/applications/page.tsx. */
export function computeFunnelStats(applications: FunnelInput[]): FunnelStats {
  let screening = 0;
  let technical = 0;
  let final = 0;
  let offers = 0;
  let screeningRejections = 0;
  let technicalRejections = 0;
  let finalRejections = 0;
  for (const a of applications) {
    if (a.outcome === "draft") continue;
    screening++;
    const rejR = a.rejectedAfterRound ?? 0;
    const intR = a.interviewRound ?? 0;
    if (a.outcome === "rejected") {
      if (rejR === 0) { screeningRejections++; continue; }
      technical++;
      if (rejR === 1) { technicalRejections++; continue; }
      final++;
      finalRejections++; continue;
    }
    if (a.outcome === "ghosted" || a.outcome === "applied") continue;
    technical++;
    if (intR >= 2 || a.outcome === "offer" || a.outcome === "declined") final++;
    if (a.outcome === "offer") offers++;
  }
  return {
    total: applications.length,
    screening,
    technical,
    final,
    offers,
    screeningRejections,
    technicalRejections,
    finalRejections,
  };
}

export type HoverInfo = { label: string; value: number; pct: string } | null;

// ── layout constants (identical to FunnelChart.tsx, compact mode) ──────────
const NODE_W = 16;
const TOP_Y = 86;
const MAX_BAR = 160; // compact
const COL_GAP = 200;
const COL_X: [number, number, number, number, number] = [70, 70 + COL_GAP, 70 + COL_GAP * 2, 70 + COL_GAP * 3, 70 + COL_GAP * 4];
const BOTTOM_GAP = 50;
const REJ_GAP = 10;

const NS = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Constant-thickness bezier ribbon (proper Sankey). */
function ribbon(x1: number, y1: number, x2: number, y2: number, h: number): string {
  const dx = x2 - x1;
  const cp1x = x1 + dx * 0.6;
  const cp2x = x2 - dx * 0.6;
  return `M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2} L ${x2} ${y2 + h} C ${cp2x} ${y2 + h}, ${cp1x} ${y1 + h}, ${x1} ${y1 + h} Z`;
}

const pct = (v: number, t: number) => (t > 0 ? Math.round((v / t) * 100) : 0);

/**
 * Render the funnel into `container` (cleared first). Returns an update
 * function so the host can re-render with fresh stats without rebuilding.
 */
export function renderSankey(
  container: HTMLElement,
  stats: FunnelStats,
  onHover: (info: HoverInfo) => void,
): (next: FunnelStats) => void {
  let current = stats;

  function draw(): void {
    container.textContent = "";

    // Derived drop-off buckets (so flows conserve mass)
    const drafts = Math.max(current.total - current.screening, 0);
    const ghosted = Math.max(
      current.screening - current.screeningRejections - current.technical,
      0,
    );
    const declined = Math.max(
      current.final - current.finalRejections - current.offers,
      0,
    );

    const scale = current.total > 0 ? MAX_BAR / current.total : 0;
    const hh = (v: number) => (v > 0 ? Math.max(v * scale, 3) : 0);

    const hTotal = hh(current.total);
    const hScreen = hh(current.screening);
    const hTech = hh(current.technical);
    const hFinal = hh(current.final);
    const hOffers = hh(current.offers);
    const hScreenRej = hh(current.screeningRejections);
    const hTechRej = hh(current.technicalRejections);
    const hFinalRej = hh(current.finalRejections);
    const hDrafts = hh(drafts);
    const hGhosted = hh(ghosted);
    const hDeclined = hh(declined);

    const bottomY = TOP_Y + hTotal + BOTTOM_GAP;
    const draftsNodeY = bottomY;
    const screenRejNodeY = bottomY;
    const ghostedNodeY = bottomY + hScreenRej + REJ_GAP;
    const techRejNodeY = bottomY;
    const finalRejNodeY = bottomY;
    const declinedNodeY = bottomY + hFinalRej + REJ_GAP;

    // Flow source y-offsets (stacked top-to-bottom within each source node)
    const totalDraftsY = TOP_Y;
    const totalPassY = TOP_Y + hDrafts;
    const screenPassY = TOP_Y;
    const screenRejFlowY = TOP_Y + hTech;
    const screenGhostFlowY = TOP_Y + hTech + hScreenRej;
    const techPassY = TOP_Y;
    const techRejFlowY = TOP_Y + hFinal;
    const finalPassY = TOP_Y;
    const finalRejFlowY = TOP_Y + hOffers;
    const finalDeclinedFlowY = TOP_Y + hOffers + hFinalRej;

    const W = COL_X[4] + NODE_W + 130;
    const bottomStack = Math.max(
      hScreenRej + REJ_GAP + hGhosted,
      hFinalRej + REJ_GAP + hDeclined,
      hDrafts,
      hTechRej,
    );
    const H = bottomY + bottomStack + 30;

    const svg = svgEl("svg", {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
    }) as SVGSVGElement;
    svg.style.width = "100%";
    svg.style.height = "auto";

    const defs = svgEl("defs", {});
    const grad = (id: string, from: string, fo: number, to: string, to2: number) => {
      const g = svgEl("linearGradient", { id, x1: "0%", y1: "0%", x2: "100%", y2: "0%" });
      g.append(svgEl("stop", { offset: "0%", "stop-color": from, "stop-opacity": fo }));
      g.append(svgEl("stop", { offset: "100%", "stop-color": to, "stop-opacity": to2 }));
      defs.append(g);
    };
    grad("apted-fc-pass", "#000", 0.9, "#333", 0.8);
    grad("apted-fc-rej", "#666", 0.7, "#888", 0.55);
    grad("apted-fc-drop", "#999", 0.5, "#bbb", 0.35);
    svg.append(defs);

    const hover = (label: string, value: number, p: string) => () =>
      onHover({ label, value, pct: p });
    const leave = () => onHover(null);

    type FlowSpec = {
      show: boolean;
      d: string;
      fill: string;
      opacity: number;
      label: string;
      value: number;
      pctText: string;
    };
    const flows: FlowSpec[] = [
      {
        show: current.screening > 0,
        d: ribbon(COL_X[0] + NODE_W, totalPassY, COL_X[1], TOP_Y, hScreen),
        fill: "url(#apted-fc-pass)", opacity: 0.85,
        label: "Submitted to Screening", value: current.screening,
        pctText: `${pct(current.screening, current.total)}% of total`,
      },
      {
        show: drafts > 0,
        d: ribbon(COL_X[0] + NODE_W, totalDraftsY, COL_X[1], draftsNodeY, hDrafts),
        fill: "url(#apted-fc-drop)", opacity: 0.6,
        label: "Not Submitted (Drafts)", value: drafts,
        pctText: `${pct(drafts, current.total)}% of total`,
      },
      {
        show: current.technical > 0,
        d: ribbon(COL_X[1] + NODE_W, screenPassY, COL_X[2], TOP_Y, hTech),
        fill: "url(#apted-fc-pass)", opacity: 0.85,
        label: "Passed Screening to Technical", value: current.technical,
        pctText: `${pct(current.technical, current.screening)}% of screened`,
      },
      {
        show: current.screeningRejections > 0,
        d: ribbon(COL_X[1] + NODE_W, screenRejFlowY, COL_X[2], screenRejNodeY, hScreenRej),
        fill: "url(#apted-fc-rej)", opacity: 0.7,
        label: "Rejected at Screening", value: current.screeningRejections,
        pctText: `${pct(current.screeningRejections, current.screening)}% of screened`,
      },
      {
        show: ghosted > 0,
        d: ribbon(COL_X[1] + NODE_W, screenGhostFlowY, COL_X[2], ghostedNodeY, hGhosted),
        fill: "url(#apted-fc-drop)", opacity: 0.5,
        label: "Ghosted", value: ghosted,
        pctText: `${pct(ghosted, current.screening)}% of screened`,
      },
      {
        show: current.final > 0,
        d: ribbon(COL_X[2] + NODE_W, techPassY, COL_X[3], TOP_Y, hFinal),
        fill: "url(#apted-fc-pass)", opacity: 0.85,
        label: "Passed Technical to Final", value: current.final,
        pctText: `${pct(current.final, current.technical)}% of technical`,
      },
      {
        show: current.technicalRejections > 0,
        d: ribbon(COL_X[2] + NODE_W, techRejFlowY, COL_X[3], techRejNodeY, hTechRej),
        fill: "url(#apted-fc-rej)", opacity: 0.7,
        label: "Rejected After Technical", value: current.technicalRejections,
        pctText: `${pct(current.technicalRejections, current.technical)}% of technical`,
      },
      {
        show: current.offers > 0,
        d: ribbon(COL_X[3] + NODE_W, finalPassY, COL_X[4], TOP_Y, hOffers),
        fill: "url(#apted-fc-pass)", opacity: 0.9,
        label: "Offer Received", value: current.offers,
        pctText: `${pct(current.offers, current.final)}% of final`,
      },
      {
        show: current.finalRejections > 0,
        d: ribbon(COL_X[3] + NODE_W, finalRejFlowY, COL_X[4], finalRejNodeY, hFinalRej),
        fill: "url(#apted-fc-rej)", opacity: 0.7,
        label: "Rejected After Final", value: current.finalRejections,
        pctText: `${pct(current.finalRejections, current.final)}% of final`,
      },
      {
        show: declined > 0,
        d: ribbon(COL_X[3] + NODE_W, finalDeclinedFlowY, COL_X[4], declinedNodeY, hDeclined),
        fill: "url(#apted-fc-drop)", opacity: 0.5,
        label: "Declined / Stalled", value: declined,
        pctText: `${pct(declined, current.final)}% of final`,
      },
    ];

    for (const f of flows) {
      if (!f.show) continue;
      const p = svgEl("path", { d: f.d, fill: f.fill, opacity: f.opacity });
      p.style.cursor = "pointer";
      p.addEventListener("mouseenter", hover(f.label, f.value, f.pctText));
      p.addEventListener("mouseleave", leave);
      svg.append(p);
    }

    type NodeSpec = {
      x: number; y: number; h: number; fill: string;
      label: string; value: number; pctText: string;
    };
    const nodes: NodeSpec[] = [
      { x: COL_X[0], y: TOP_Y, h: hTotal, fill: "#000", label: "Total", value: current.total, pctText: "100%" },
    ];
    if (current.screening > 0)
      nodes.push({ x: COL_X[1], y: TOP_Y, h: hScreen, fill: "#000", label: "Screening", value: current.screening, pctText: `${pct(current.screening, current.total)}% of total` });
    if (current.technical > 0)
      nodes.push({ x: COL_X[2], y: TOP_Y, h: hTech, fill: "#000", label: "Technical Interview", value: current.technical, pctText: `${pct(current.technical, current.screening)}% of screened` });
    if (current.final > 0)
      nodes.push({ x: COL_X[3], y: TOP_Y, h: hFinal, fill: "#000", label: "Final Round", value: current.final, pctText: `${pct(current.final, current.technical)}% of technical` });
    if (current.offers > 0)
      nodes.push({ x: COL_X[4], y: TOP_Y, h: hOffers, fill: "#000", label: "Offers", value: current.offers, pctText: `${pct(current.offers, current.total)}% of total` });
    // Rejection / drop-off nodes (no hover)
    const plainNodes: Array<[number, number, number]> = [];
    if (drafts > 0) plainNodes.push([COL_X[1], draftsNodeY, hDrafts]);
    if (current.screeningRejections > 0) plainNodes.push([COL_X[2], screenRejNodeY, hScreenRej]);
    if (ghosted > 0) plainNodes.push([COL_X[2], ghostedNodeY, hGhosted]);
    if (current.technicalRejections > 0) plainNodes.push([COL_X[3], techRejNodeY, hTechRej]);
    if (current.finalRejections > 0) plainNodes.push([COL_X[4], finalRejNodeY, hFinalRej]);
    if (declined > 0) plainNodes.push([COL_X[4], declinedNodeY, hDeclined]);

    for (const n of nodes) {
      const r = svgEl("rect", { x: n.x, y: n.y, width: NODE_W, height: n.h, fill: n.fill, rx: 1 });
      r.style.cursor = "pointer";
      r.addEventListener("mouseenter", hover(n.label, n.value, n.pctText));
      r.addEventListener("mouseleave", leave);
      svg.append(r);
    }
    for (const [x, y, h] of plainNodes) {
      svg.append(svgEl("rect", { x, y, width: NODE_W, height: h, fill: "#555", rx: 1 }));
    }

    // Main chain labels (above nodes)
    const labels: Array<[number, string, string]> = [
      [COL_X[0], "Total", String(current.total)],
    ];
    if (current.screening > 0) labels.push([COL_X[1], "Screening", String(current.screening)]);
    if (current.technical > 0) labels.push([COL_X[2], "Technical", String(current.technical)]);
    if (current.final > 0) labels.push([COL_X[3], "Final", String(current.final)]);
    if (current.offers > 0) labels.push([COL_X[4], "Offers", String(current.offers)]);
    for (const [x, name, value] of labels) {
      const t1 = svgEl("text", { x, y: TOP_Y - 40, fill: "#171c20" });
      t1.setAttribute("font-size", "26");
      t1.setAttribute("font-weight", "700");
      t1.setAttribute("style", "font-family: Outfit, system-ui, sans-serif");
      t1.textContent = name;
      svg.append(t1);
      const t2 = svgEl("text", { x, y: TOP_Y - 20, fill: "#4c4546" });
      t2.setAttribute("font-size", "28");
      t2.setAttribute("font-weight", "500");
      t2.setAttribute("style", "font-family: Outfit, system-ui, sans-serif");
      t2.textContent = value;
      svg.append(t2);
    }

    // Drop-off labels (right of node)
    const dropLabels: Array<[number, number, number, string]> = [];
    if (drafts > 0) dropLabels.push([COL_X[1] + NODE_W + 8, draftsNodeY + hDrafts / 2, hDrafts, `Drafts (${drafts})`]);
    if (current.screeningRejections > 0) dropLabels.push([COL_X[2] + NODE_W + 8, screenRejNodeY + hScreenRej / 2, hScreenRej, `Rejected (${current.screeningRejections})`]);
    if (ghosted > 0) dropLabels.push([COL_X[2] + NODE_W + 8, ghostedNodeY + hGhosted / 2, hGhosted, `Ghosted (${ghosted})`]);
    if (current.technicalRejections > 0) dropLabels.push([COL_X[3] + NODE_W + 8, techRejNodeY + hTechRej / 2, hTechRej, `Rejected (${current.technicalRejections})`]);
    if (current.finalRejections > 0) dropLabels.push([COL_X[4] + NODE_W + 8, finalRejNodeY + hFinalRej / 2, hFinalRej, `Rejected (${current.finalRejections})`]);
    if (declined > 0) dropLabels.push([COL_X[4] + NODE_W + 8, declinedNodeY + hDeclined / 2, hDeclined, `Declined (${declined})`]);
    for (const [x, y, , text] of dropLabels) {
      const t = svgEl("text", { x, y: y + 4, fill: "#666" });
      t.setAttribute("font-size", "22");
      t.setAttribute("style", "font-family: Outfit, system-ui, sans-serif");
      t.textContent = text;
      svg.append(t);
    }

    container.append(svg);
  }

  draw();
  return (next: FunnelStats) => {
    current = next;
    draw();
  };
}
