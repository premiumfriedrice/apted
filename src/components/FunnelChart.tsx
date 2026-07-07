"use client";

import React, { useState } from 'react';
import { FunnelStats } from './types';

interface FunnelChartProps {
  stats: FunnelStats;
  className?: string;
}

/**
 * Pure background Sankey funnel. Renders an absolutely-positioned SVG that
 * fills its parent container. Node heights are proportional to actual data
 * values (max value = full available height). No card wrapper, no tooltip bar.
 */
export default function FunnelChart({ stats, className = '' }: FunnelChartProps) {
  const [, setHovered] = useState<string | null>(null);

  // SVG internal coordinate space (will scale to fill container via preserveAspectRatio).
  const width = 1000;
  const height = 480;

  // The tallest node (total) defines the scale. All other nodes are proportional.
  const maxVal = Math.max(stats.total, 1);
  const totalHeight = 300; // total node occupies this many SVG units
  const scale = totalHeight / maxVal;

  // Node x positions spread across the width.
  const xCoords = {
    total: 60,
    screening: 340,
    technical: 520,
    final: 700,
    offers: 880,
    screeningRejections: 700,
    technicalRejections: 700,
    finalRejections: 880,
  };

  const nodeWidth = 14;

  // Node heights proportional to data (minimum sizes so they stay visible).
  const heights = {
    total: totalHeight,
    screening: Math.max(stats.screening * scale, 6),
    technical: Math.max(stats.technical * scale, 5),
    final: Math.max(stats.final * scale, 4),
    offers: Math.max(stats.offers * scale, 3),
    screeningRejections: Math.max(stats.screeningRejections * scale, 12),
    technicalRejections: Math.max(stats.technicalRejections * scale, 6),
    finalRejections: Math.max(stats.finalRejections * scale, 4),
  };

  // Y coordinates for top of each node.
  const yCoords = {
    total: 90,
    screening: 90,
    technical: 90,
    final: 90,
    offers: 90,
    screeningRejections: 250,
    technicalRejections: 170,
    finalRejections: 170,
  };

  const getCurvePath = (x1: number, y1: number, h1: number, x2: number, y2: number, h2: number) => {
    const cpX1 = x1 + (x2 - x1) * 0.45;
    const cpX2 = x1 + (x2 - x1) * 0.55;
    return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2} L ${x2} ${y2 + h2} C ${cpX2} ${y2 + h2}, ${cpX1} ${y1 + h1}, ${x1} ${y1 + h1} Z`;
  };

  const getLineCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
    const cpX1 = x1 + (x2 - x1) * 0.45;
    const cpX2 = x1 + (x2 - x1) * 0.55;
    return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}`;
  };

  const fineLines = [
    { sY: yCoords.total + heights.total * 0.45, eY: yCoords.screening + heights.screening * 0.70 },
    { sY: yCoords.total + heights.total * 0.50, eY: yCoords.screening + heights.screening * 0.85 },
    { sY: yCoords.total + heights.total * 0.55, eY: yCoords.screening + heights.screening * 0.60 },
    { sY: yCoords.total + heights.total * 0.65, eY: yCoords.screening + heights.screening * 0.90 },
    { sY: yCoords.total + heights.total * 0.75, eY: yCoords.screening + heights.screening * 0.75 },
    { sY: yCoords.total + heights.total * 0.82, eY: yCoords.screening + heights.screening * 0.95 },
    { sY: yCoords.total + heights.total * 0.90, eY: yCoords.screening + heights.screening * 0.80 },
    { sY: yCoords.total + heights.total * 0.98, eY: yCoords.screening + heights.screening * 0.98 },
  ];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className={`absolute inset-0 h-full w-full ${className}`}
    >
      <defs>
        <linearGradient id="fc-blackToGray" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#2c3135" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="fc-screeningToTech" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2c3135" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#5f5e5e" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="fc-techToFinal" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#5f5e5e" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#7e7576" stopOpacity="0.7" />
        </linearGradient>
        <linearGradient id="fc-finalToOffers" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7e7576" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id="fc-rejectionGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5f5e5e" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#2c3135" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* ====== FLOW CURVES ====== */}

      {/* Total -> Screening */}
      <path
        d={getCurvePath(xCoords.total + nodeWidth + 6, yCoords.total, heights.total * 0.40, xCoords.screening, yCoords.screening, heights.screening)}
        fill="url(#fc-blackToGray)"
        opacity={0.9}
        onMouseEnter={() => setHovered('total-to-screening')}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Fine-line mesh */}
      {fineLines.map((line, i) => (
        <path
          key={`fc-fine-${i}`}
          d={getLineCurvePath(xCoords.total + nodeWidth + 6, line.sY, xCoords.screening, line.eY)}
          fill="none"
          stroke="#171c20"
          strokeWidth={1.5 + (i % 2) * 1}
          strokeOpacity={0.6 - i * 0.05}
        />
      ))}

      {/* Screening -> Technical */}
      <path
        d={getCurvePath(xCoords.screening + nodeWidth, yCoords.screening, heights.screening * 0.35, xCoords.technical, yCoords.technical, heights.technical)}
        fill="url(#fc-screeningToTech)"
        opacity={0.85}
        onMouseEnter={() => setHovered('screening-to-tech')}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Screening -> Screening Rejections */}
      <path
        d={getCurvePath(xCoords.screening + nodeWidth, yCoords.screening + heights.screening * 0.35, heights.screening * 0.65, xCoords.screeningRejections, yCoords.screeningRejections, heights.screeningRejections)}
        fill="url(#fc-rejectionGrad)"
        opacity={0.8}
        onMouseEnter={() => setHovered('screening-rej')}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Technical -> Final */}
      <path
        d={getCurvePath(xCoords.technical + nodeWidth, yCoords.technical, heights.technical * 0.30, xCoords.final, yCoords.final, heights.final)}
        fill="url(#fc-techToFinal)"
        opacity={0.85}
        onMouseEnter={() => setHovered('tech-to-final')}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Technical -> Technical Rejections */}
      <path
        d={getCurvePath(xCoords.technical + nodeWidth, yCoords.technical + heights.technical * 0.30, heights.technical * 0.70, xCoords.technicalRejections, yCoords.technicalRejections, heights.technicalRejections)}
        fill="#5f5e5e"
        fillOpacity={0.6}
        onMouseEnter={() => setHovered('tech-rej')}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Final -> Offers */}
      <path
        d={getCurvePath(xCoords.final + nodeWidth, yCoords.final, heights.final * 0.25, xCoords.offers, yCoords.offers, heights.offers)}
        fill="url(#fc-finalToOffers)"
        opacity={0.9}
        onMouseEnter={() => setHovered('final-to-offers')}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Final -> Final Rejections */}
      <path
        d={getCurvePath(xCoords.final + nodeWidth, yCoords.final + heights.final * 0.25, heights.final * 0.75, xCoords.finalRejections, yCoords.finalRejections, heights.finalRejections)}
        fill="#7e7576"
        fillOpacity={0.6}
        onMouseEnter={() => setHovered('final-rej')}
        onMouseLeave={() => setHovered(null)}
      />

      {/* ====== NODES ====== */}

      {/* Total Applications (dual-bar) */}
      <g onMouseEnter={() => setHovered('total')} onMouseLeave={() => setHovered(null)}>
        <rect x={xCoords.total} y={yCoords.total} width={36} height={heights.total} fill="#000000" rx={1} />
        <rect x={xCoords.total + 42} y={yCoords.total} width={8} height={heights.total} fill="#000000" rx={1} />
      </g>

      <rect x={xCoords.screening} y={yCoords.screening} width={nodeWidth} height={heights.screening} fill="#000000" rx={1} />
      <rect x={xCoords.technical} y={yCoords.technical} width={nodeWidth} height={heights.technical} fill="#000000" rx={1} />
      <rect x={xCoords.final} y={yCoords.final} width={nodeWidth} height={heights.final} fill="#000000" rx={1} />
      <rect x={xCoords.offers} y={yCoords.offers} width={nodeWidth + 6} height={heights.offers} fill="#000000" rx={1} />
      <rect x={xCoords.screeningRejections} y={yCoords.screeningRejections} width={nodeWidth} height={heights.screeningRejections} fill="#000000" rx={1} />
      <rect x={xCoords.technicalRejections} y={yCoords.technicalRejections} width={nodeWidth} height={heights.technicalRejections} fill="#000000" rx={1} />
      <rect x={xCoords.finalRejections} y={yCoords.finalRejections} width={nodeWidth} height={heights.finalRejections} fill="#000000" rx={1} />

      {/* ====== LABELS ====== */}

      <text x={xCoords.total} y={yCoords.total - 34} className="font-display font-bold text-xs" fill="#171c20">
        Total Applications
      </text>
      <text x={xCoords.total} y={yCoords.total - 16} className="font-sans text-sm font-medium" fill="#4c4546">
        {stats.total}
      </text>

      <g transform={`translate(${xCoords.screening}, ${yCoords.screening - 44})`}>
        <path d="M 0 0 L 10 0 M 3 3 L 7 7" stroke="#171c20" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="5" cy="5" r="3.5" stroke="#171c20" strokeWidth="1.5" fill="none" />
        <text x={18} y={10} className="font-display font-bold text-xs" fill="#171c20">Screening</text>
        <text x={18} y={26} className="font-sans text-sm font-medium" fill="#4c4546">{stats.screening}</text>
      </g>

      <g transform={`translate(${xCoords.technical}, ${yCoords.technical - 44})`}>
        <path d="M 0 4 L 4 0 L 0 -4 M 8 4 L 4 0 L 8 -4" stroke="#171c20" strokeWidth="1.5" strokeLinecap="round" fill="none" transform="translate(4,6) scale(0.8)" />
        <text x={18} y={10} className="font-display font-bold text-xs" fill="#171c20">Technical Interview</text>
        <text x={18} y={26} className="font-sans text-sm font-medium" fill="#4c4546">{stats.technical}</text>
      </g>

      <g transform={`translate(${xCoords.final}, ${yCoords.final - 44})`}>
        <circle cx="5" cy="4" r="2.5" stroke="#171c20" strokeWidth="1.2" fill="none" />
        <path d="M 1 10 C 1 8, 9 8, 9 10" stroke="#171c20" strokeWidth="1.2" fill="none" />
        <text x={16} y={10} className="font-display font-bold text-xs" fill="#171c20">Final Round</text>
        <text x={16} y={26} className="font-sans text-sm font-medium" fill="#4c4546">{stats.final}</text>
      </g>

      <g transform={`translate(${xCoords.offers}, ${yCoords.offers - 44})`}>
        <path d="M 0 5 L 8 1 L 11 4 L 5 8 Z" stroke="#171c20" strokeWidth="1" fill="none" />
        <path d="M 4 8 L 9 12" stroke="#171c20" strokeWidth="1" />
        <text x={16} y={10} className="font-display font-bold text-xs" fill="#171c20">Offers</text>
        <text x={16} y={26} className="font-sans text-sm font-semibold" fill="#10B981">{stats.offers}</text>
      </g>

      <g transform={`translate(${xCoords.screeningRejections + 20}, ${yCoords.screeningRejections + 12})`}>
        <circle cx="-10" cy="-3" r="5" stroke="#7e7576" strokeWidth="1.2" fill="none" />
        <path d="M -12 -5 L -8 -1 M -8 -5 L -12 -1" stroke="#7e7576" strokeWidth="1.2" />
        <text x="0" y="2" className="font-display font-bold text-xs" fill="#171c20">Rejections</text>
        <text x="0" y="18" className="font-sans text-sm font-medium" fill="#4c4546">{stats.screeningRejections}</text>
      </g>

      <g transform={`translate(${xCoords.technicalRejections + 20}, ${yCoords.technicalRejections + 10})`}>
        <circle cx="-10" cy="-3" r="5" stroke="#7e7576" strokeWidth="1.2" fill="none" />
        <path d="M -12 -5 L -8 -1 M -8 -5 L -12 -1" stroke="#7e7576" strokeWidth="1.2" />
        <text x="0" y="2" className="font-display font-bold text-xs" fill="#171c20">Rejections</text>
        <text x="0" y="18" className="font-sans text-sm font-medium" fill="#4c4546">{stats.technicalRejections}</text>
      </g>

      <g transform={`translate(${xCoords.finalRejections + 20}, ${yCoords.finalRejections + 10})`}>
        <circle cx="-10" cy="-3" r="5" stroke="#7e7576" strokeWidth="1.2" fill="none" />
        <path d="M -12 -5 L -8 -1 M -8 -5 L -12 -1" stroke="#7e7576" strokeWidth="1.2" />
        <text x="0" y="2" className="font-display font-bold text-xs" fill="#171c20">Rejections</text>
        <text x="0" y="18" className="font-sans text-sm font-medium" fill="#4c4546">{stats.finalRejections}</text>
      </g>
    </svg>
  );
}
