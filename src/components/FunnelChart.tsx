"use client";

import React, { useState } from 'react';
import { RefreshCw, Info, Sliders } from 'lucide-react';
import { FunnelStats } from './types';

interface FunnelChartProps {
  stats: FunnelStats;
  onUpdateStats?: (newStats: FunnelStats) => void;
  isSynced: boolean;
  onToggleSync: () => void;
}

export default function FunnelChart({ stats, onUpdateStats, isSynced, onToggleSync }: FunnelChartProps) {
  const [hoveredElement, setHoveredElement] = useState<{ name: string; value: string; rate?: string } | null>(null);
  const [showControls, setShowControls] = useState(false);

  // SVG dimensions
  const width = 1000;
  const height = 480;

  // Proportional scaling factor based on the Total Applications
  const totalHeight = 300;
  const scale = stats.total > 0 ? totalHeight / stats.total : 0;

  // Node position coordinates
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

  // Calculate Node Heights (minimum 4px so they don't disappear)
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

  // Y coordinates for top of each node
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

  // Helper to generate cubic bezier curve path
  const getCurvePath = (
    x1: number,
    y1: number,
    h1: number,
    x2: number,
    y2: number,
    h2: number
  ) => {
    const cpX1 = x1 + (x2 - x1) * 0.45;
    const cpX2 = x1 + (x2 - x1) * 0.55;
    return `
      M ${x1} ${y1}
      C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}
      L ${x2} ${y2 + h2}
      C ${cpX2} ${y2 + h2}, ${cpX1} ${y1 + h1}, ${x1} ${y1 + h1}
      Z
    `;
  };

  // Helper for drawing a simple line curve (for fine lines)
  const getLineCurvePath = (x1: number, y1: number, x2: number, y2: number) => {
    const cpX1 = x1 + (x2 - x1) * 0.45;
    const cpX2 = x1 + (x2 - x1) * 0.55;
    return `M ${x1} ${y1} C ${cpX1} ${y1}, ${cpX2} ${y2}, ${x2} ${y2}`;
  };

  // Conversion rates calculations
  const rates = {
    screening: stats.total > 0 ? ((stats.screening / stats.total) * 100).toFixed(1) : '0',
    technical: stats.screening > 0 ? ((stats.technical / stats.screening) * 100).toFixed(1) : '0',
    final: stats.technical > 0 ? ((stats.final / stats.technical) * 100).toFixed(1) : '0',
    offers: stats.final > 0 ? ((stats.offers / stats.final) * 100).toFixed(1) : '0',
    overall: stats.total > 0 ? ((stats.offers / stats.total) * 100).toFixed(1) : '0',
  };

  // Handle local state updates for manual controls
  const handleStatChange = (key: keyof FunnelStats, val: number) => {
    if (!onUpdateStats) return;
    const cleanVal = Math.max(0, val);
    const updated = { ...stats, [key]: cleanVal };

    // Automatically recalculate dependent values to maintain consistency if desired
    if (key === 'total') {
      updated.screening = Math.min(updated.screening, cleanVal);
      updated.screeningRejections = Math.min(updated.screeningRejections, cleanVal - updated.screening);
    } else if (key === 'screening') {
      updated.screening = Math.min(cleanVal, updated.total);
      updated.technical = Math.min(updated.technical, updated.screening);
    } else if (key === 'technical') {
      updated.technical = Math.min(cleanVal, updated.screening);
      updated.final = Math.min(updated.final, updated.technical);
    } else if (key === 'final') {
      updated.final = Math.min(cleanVal, updated.technical);
      updated.offers = Math.min(updated.offers, updated.final);
    } else if (key === 'offers') {
      updated.offers = Math.min(cleanVal, updated.final);
    }

    onUpdateStats(updated);
  };

  // Pre-calculated fine lines (representing the individual weaving threads in the screenshot)
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
    <div className="bg-white border border-[#E5E7EB] rounded-md p-6 relative select-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl font-bold text-[#171c20] tracking-tight">
            Job Application Funnel
          </h2>
          <p className="text-xs text-gray-500 font-sans mt-1">
            Visualizing conversion metrics and dropout volumes across candidate stages.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={onToggleSync}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
              isSynced
                ? 'bg-[#1b1b1b] text-white border-black'
                : 'bg-white text-gray-700 border-[#E5E7EB] hover:bg-gray-50'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSynced ? 'animate-spin-slow' : ''}`} />
            {isSynced ? 'Synced to Tracker' : 'Manual Demo Mode'}
          </button>

          <button
            onClick={() => setShowControls(!showControls)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border bg-white text-gray-700 border-[#E5E7EB] hover:bg-gray-50"
          >
            <Sliders className="w-3.5 h-3.5" />
            {showControls ? 'Hide Controls' : 'Edit Stats'}
          </button>
        </div>
      </div>

      {/* Manual Controls Panel */}
      {showControls && (
        <div className="bg-[#f0f4f9] border border-[#dfe3e8] rounded-md p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4 transition-all duration-200">
          <div className="col-span-2 md:col-span-4 flex items-center justify-between border-b border-gray-200 pb-2 mb-1">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              {isSynced ? 'Funnel Values (Locked in Auto-Sync)' : 'Adjust Funnel Values'}
            </span>
            {isSynced && (
              <span className="text-[10px] bg-white text-[#171c20] border border-gray-300 px-1.5 py-0.5 rounded font-mono">
                ACTIVE
              </span>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Total Applications</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.total}
              onChange={(e) => handleStatChange('total', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Screening Passed</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.screening}
              onChange={(e) => handleStatChange('screening', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Technical Interviews</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.technical}
              onChange={(e) => handleStatChange('technical', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Final Rounds</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.final}
              onChange={(e) => handleStatChange('final', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Offers Received</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.offers}
              onChange={(e) => handleStatChange('offers', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Screen Rejections</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.screeningRejections}
              onChange={(e) => handleStatChange('screeningRejections', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Tech Rejections</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.technicalRejections}
              onChange={(e) => handleStatChange('technicalRejections', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase">Final Rejections</label>
            <input
              type="number"
              disabled={isSynced}
              value={stats.finalRejections}
              onChange={(e) => handleStatChange('finalRejections', parseInt(e.target.value) || 0)}
              className="mt-1 w-full bg-white border border-[#E5E7EB] rounded p-1 text-xs font-mono disabled:opacity-60"
            />
          </div>
        </div>
      )}

      {/* Funnel SVG Render Area */}
      <div className="w-full overflow-x-auto">
        <div className="min-w-[950px] relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto"
            style={{ maxHeight: '480px' }}
          >
            {/* DEFINES FOR GRADIENTS AND FILTERS */}
            <defs>
              <linearGradient id="blackToGray" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#2c3135" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="screeningToTech" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2c3135" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#5f5e5e" stopOpacity="0.75" />
              </linearGradient>
              <linearGradient id="techToFinal" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#5f5e5e" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#7e7576" stopOpacity="0.7" />
              </linearGradient>
              <linearGradient id="finalToOffers" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#7e7576" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="rejectionGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#5f5e5e" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#2c3135" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* ====== FLOW CURVES (Sankey Links) ====== */}

            {/* 1. Total -> Screening (Top main flow) */}
            <path
              d={getCurvePath(
                xCoords.total + nodeWidth + 6,
                yCoords.total,
                heights.total * 0.40, // Top 40% of the bar represents the main screening flow
                xCoords.screening,
                yCoords.screening,
                heights.screening
              )}
              fill="url(#blackToGray)"
              className="transition-all duration-300 cursor-pointer hover:opacity-100 opacity-90"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Applications Advanced to Screening',
                  value: `${stats.screening} candidates`,
                  rate: `${rates.screening}% of total applications`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 1b. Total -> Screening Crisscrossing Fine Lines (Aesthetic bottom mesh) */}
            {fineLines.map((line, i) => (
              <path
                key={`fine-line-${i}`}
                d={getLineCurvePath(
                  xCoords.total + nodeWidth + 6,
                  line.sY,
                  xCoords.screening,
                  line.eY
                )}
                fill="none"
                stroke="#171c20"
                strokeWidth={1.5 + (i % 2) * 1}
                strokeOpacity={0.6 - (i * 0.05)}
                className="transition-all duration-300"
              />
            ))}

            {/* 2. Screening -> Technical Interview */}
            <path
              d={getCurvePath(
                xCoords.screening + nodeWidth,
                yCoords.screening,
                heights.screening * 0.35, // Proportional flow
                xCoords.technical,
                yCoords.technical,
                heights.technical
              )}
              fill="url(#screeningToTech)"
              className="transition-all duration-300 cursor-pointer hover:opacity-100 opacity-85"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Screening to Technical Interview',
                  value: `${stats.technical} candidates`,
                  rate: `${rates.technical}% screening pass rate`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 3. Screening -> Screening Rejections */}
            <path
              d={getCurvePath(
                xCoords.screening + nodeWidth,
                yCoords.screening + (heights.screening * 0.35),
                heights.screening * 0.65,
                xCoords.screeningRejections,
                yCoords.screeningRejections,
                heights.screeningRejections
              )}
              fill="url(#rejectionGrad)"
              className="transition-all duration-300 cursor-pointer hover:opacity-100 opacity-80"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Pre-interview Rejections',
                  value: `${stats.screeningRejections} candidates`,
                  rate: `${((stats.screeningRejections / stats.total) * 100).toFixed(1)}% of total applications`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 4. Technical Interview -> Final Round */}
            <path
              d={getCurvePath(
                xCoords.technical + nodeWidth,
                yCoords.technical,
                heights.technical * 0.30,
                xCoords.final,
                yCoords.final,
                heights.final
              )}
              fill="url(#techToFinal)"
              className="transition-all duration-300 cursor-pointer hover:opacity-100 opacity-85"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Technical to Final Round',
                  value: `${stats.final} candidates`,
                  rate: `${rates.final}% tech pass rate`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 5. Technical Interview -> Technical Rejections */}
            <path
              d={getCurvePath(
                xCoords.technical + nodeWidth,
                yCoords.technical + (heights.technical * 0.30),
                heights.technical * 0.70,
                xCoords.technicalRejections,
                yCoords.technicalRejections,
                heights.technicalRejections
              )}
              fill="#5f5e5e"
              fillOpacity="0.6"
              className="transition-all duration-300 cursor-pointer hover:opacity-100"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Technical Interview Rejections',
                  value: `${stats.technicalRejections} candidates`,
                  rate: `${((stats.technicalRejections / stats.screening) * 100).toFixed(1)}% of screened candidates`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 6. Final Round -> Offers */}
            <path
              d={getCurvePath(
                xCoords.final + nodeWidth,
                yCoords.final,
                heights.final * 0.25,
                xCoords.offers,
                yCoords.offers,
                heights.offers
              )}
              fill="url(#finalToOffers)"
              className="transition-all duration-300 cursor-pointer hover:opacity-100 opacity-90"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Final Round to Offers',
                  value: `${stats.offers} offers`,
                  rate: `${rates.offers}% offer rate from final`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 7. Final Round -> Final Rejections */}
            <path
              d={getCurvePath(
                xCoords.final + nodeWidth,
                yCoords.final + (heights.final * 0.25),
                heights.final * 0.75,
                xCoords.finalRejections,
                yCoords.finalRejections,
                heights.finalRejections
              )}
              fill="#7e7576"
              fillOpacity="0.6"
              className="transition-all duration-300 cursor-pointer hover:opacity-100"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Final Round Rejections',
                  value: `${stats.finalRejections} candidates`,
                  rate: `${((stats.finalRejections / stats.technical) * 100).toFixed(1)}% of tech interviewees`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />


            {/* ====== NODES (Sankey Bars) ====== */}

            {/* 1. Total Applications Node Block (replicates the dual-line aesthetic) */}
            <g
              className="cursor-pointer hover:opacity-90 transition-opacity"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Total Job Applications',
                  value: `${stats.total} total`,
                  rate: 'Beginning of career search funnel',
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            >
              {/* Outer Thick Bar */}
              <rect
                x={xCoords.total}
                y={yCoords.total}
                width={36}
                height={heights.total}
                fill="#000000"
                rx={1}
              />
              {/* Secondary Accent Line */}
              <rect
                x={xCoords.total + 42}
                y={yCoords.total}
                width={8}
                height={heights.total}
                fill="#000000"
                rx={1}
              />
            </g>

            {/* 2. Screening Node */}
            <rect
              x={xCoords.screening}
              y={yCoords.screening}
              width={nodeWidth}
              height={heights.screening}
              fill="#000000"
              rx={1}
              className="cursor-pointer hover:opacity-80 transition-all duration-200"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Screening Stage',
                  value: `${stats.screening} active`,
                  rate: `${rates.screening}% overall conversion`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 3. Technical Interview Node */}
            <rect
              x={xCoords.technical}
              y={yCoords.technical}
              width={nodeWidth}
              height={heights.technical}
              fill="#000000"
              rx={1}
              className="cursor-pointer hover:opacity-80 transition-all duration-200"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Technical Interview Stage',
                  value: `${stats.technical} active`,
                  rate: `${rates.technical}% conversion from screening`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 4. Final Round Node */}
            <rect
              x={xCoords.final}
              y={yCoords.final}
              width={nodeWidth}
              height={heights.final}
              fill="#000000"
              rx={1}
              className="cursor-pointer hover:opacity-80 transition-all duration-200"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Final Round Stage',
                  value: `${stats.final} active`,
                  rate: `${rates.final}% conversion from tech interview`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* 5. Offers Node */}
            <rect
              x={xCoords.offers}
              y={yCoords.offers}
              width={nodeWidth + 6}
              height={heights.offers}
              fill="#000000"
              rx={1}
              className="cursor-pointer hover:opacity-80 transition-all duration-200"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Job Offers Issued',
                  value: `${stats.offers} offers`,
                  rate: `${rates.overall}% overall conversion rate`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* Rejections 900 Node (Screening Rejections) */}
            <rect
              x={xCoords.screeningRejections}
              y={yCoords.screeningRejections}
              width={nodeWidth}
              height={heights.screeningRejections}
              fill="#000000"
              rx={1}
              className="cursor-pointer hover:opacity-80 transition-all duration-200"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Screening Rejections',
                  value: `${stats.screeningRejections} rejected`,
                  rate: `${((stats.screeningRejections / stats.total) * 100).toFixed(1)}% of total applications`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* Rejections 130 Node (Technical Rejections) */}
            <rect
              x={xCoords.technicalRejections}
              y={yCoords.technicalRejections}
              width={nodeWidth}
              height={heights.technicalRejections}
              fill="#000000"
              rx={1}
              className="cursor-pointer hover:opacity-80 transition-all duration-200"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Technical Round Rejections',
                  value: `${stats.technicalRejections} rejected`,
                  rate: `${((stats.technicalRejections / stats.screening) * 100).toFixed(1)}% of screened candidates`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />

            {/* Rejections 38 Node (Final Rejections) */}
            <rect
              x={xCoords.finalRejections}
              y={yCoords.finalRejections}
              width={nodeWidth}
              height={heights.finalRejections}
              fill="#000000"
              rx={1}
              className="cursor-pointer hover:opacity-80 transition-all duration-200"
              onMouseEnter={() =>
                setHoveredElement({
                  name: 'Final Round Rejections',
                  value: `${stats.finalRejections} rejected`,
                  rate: `${((stats.finalRejections / stats.technical) * 100).toFixed(1)}% of tech interviewees`,
                })
              }
              onMouseLeave={() => setHoveredElement(null)}
            />


            {/* ====== LABELS AND VALUES (Styled text) ====== */}

            {/* 1. Total Applications Label */}
            <text x={xCoords.total} y={yCoords.total - 34} className="font-display font-bold text-xs" fill="#171c20">
              Total Applications
            </text>
            <text x={xCoords.total} y={yCoords.total - 16} className="font-sans text-sm font-medium" fill="#4c4546">
              {stats.total}
            </text>

            {/* 2. Screening Label with search icon placeholder position */}
            <g transform={`translate(${xCoords.screening}, ${yCoords.screening - 44})`}>
              <path d="M 0 0 L 10 0 M 3 3 L 7 7" stroke="#171c20" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="5" cy="5" r="3.5" stroke="#171c20" strokeWidth="1.5" fill="none" />
              <text x={18} y={10} className="font-display font-bold text-xs" fill="#171c20">Screening</text>
              <text x={18} y={26} className="font-sans text-sm font-medium" fill="#4c4546">{stats.screening}</text>
            </g>

            {/* 3. Technical Interview Label with coding icon placeholder */}
            <g transform={`translate(${xCoords.technical}, ${yCoords.technical - 44})`}>
              <path d="M 0 4 L 4 0 L 0 -4 M 8 4 L 4 0 L 8 -4" stroke="#171c20" strokeWidth="1.5" strokeLinecap="round" fill="none" transform="translate(4,6) scale(0.8)" />
              <text x={18} y={10} className="font-display font-bold text-xs" fill="#171c20">Technical Interview</text>
              <text x={18} y={26} className="font-sans text-sm font-medium" fill="#4c4546">{stats.technical}</text>
            </g>

            {/* 4. Final Round Label with group icon */}
            <g transform={`translate(${xCoords.final}, ${yCoords.final - 44})`}>
              {/* Small SVG Users Icon representation */}
              <circle cx="5" cy="4" r="2.5" stroke="#171c20" strokeWidth="1.2" fill="none" />
              <path d="M 1 10 C 1 8, 9 8, 9 10" stroke="#171c20" strokeWidth="1.2" fill="none" />
              <text x={16} y={10} className="font-display font-bold text-xs" fill="#171c20">Final Round</text>
              <text x={16} y={26} className="font-sans text-sm font-medium" fill="#4c4546">{stats.final}</text>
            </g>

            {/* 5. Offers Label with handshake icon */}
            <g transform={`translate(${xCoords.offers}, ${yCoords.offers - 44})`}>
              {/* Handshake line representation */}
              <path d="M 0 5 L 8 1 L 11 4 L 5 8 Z" stroke="#171c20" strokeWidth="1" fill="none" />
              <path d="M 4 8 L 9 12" stroke="#171c20" strokeWidth="1" />
              <text x={16} y={10} className="font-display font-bold text-xs" fill="#171c20">Offers</text>
              <text x={16} y={26} className="font-sans text-sm font-semibold" fill="#10B981">{stats.offers}</text>
            </g>

            {/* Rejections 900 Label */}
            <g transform={`translate(${xCoords.screeningRejections + 20}, ${yCoords.screeningRejections + 12})`}>
              <circle cx="-10" cy="-3" r="5" stroke="#7e7576" strokeWidth="1.2" fill="none" />
              <path d="M -12 -5 L -8 -1 M -8 -5 L -12 -1" stroke="#7e7576" strokeWidth="1.2" />
              <text x="0" y="2" className="font-display font-bold text-xs" fill="#171c20">Rejections</text>
              <text x="0" y="18" className="font-sans text-sm font-medium" fill="#4c4546">{stats.screeningRejections}</text>
            </g>

            {/* Rejections 130 Label */}
            <g transform={`translate(${xCoords.technicalRejections + 20}, ${yCoords.technicalRejections + 10})`}>
              <circle cx="-10" cy="-3" r="5" stroke="#7e7576" strokeWidth="1.2" fill="none" />
              <path d="M -12 -5 L -8 -1 M -8 -5 L -12 -1" stroke="#7e7576" strokeWidth="1.2" />
              <text x="0" y="2" className="font-display font-bold text-xs" fill="#171c20">Rejections</text>
              <text x="0" y="18" className="font-sans text-sm font-medium" fill="#4c4546">{stats.technicalRejections}</text>
            </g>

            {/* Rejections 38 Label */}
            <g transform={`translate(${xCoords.finalRejections + 20}, ${yCoords.finalRejections + 10})`}>
              <circle cx="-10" cy="-3" r="5" stroke="#7e7576" strokeWidth="1.2" fill="none" />
              <path d="M -12 -5 L -8 -1 M -8 -5 L -12 -1" stroke="#7e7576" strokeWidth="1.2" />
              <text x="0" y="2" className="font-display font-bold text-xs" fill="#171c20">Rejections</text>
              <text x="0" y="18" className="font-sans text-sm font-medium" fill="#4c4546">{stats.finalRejections}</text>
            </g>

          </svg>
        </div>
      </div>

      {/* Dynamic Interactive Tooltip */}
      <div className="mt-4 min-h-[52px] bg-[#F6FAFF] border border-[#E5E7EB] rounded p-3 flex items-center justify-between">
        {hoveredElement ? (
          <div className="flex items-center gap-3">
            <div className="bg-[#1b1b1b] text-white p-1.5 rounded">
              <Info className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#171c20] font-display uppercase tracking-wide">
                {hoveredElement.name}
              </div>
              <div className="text-sm font-sans font-medium text-gray-700">
                {hoveredElement.value} <span className="text-xs text-gray-500 font-normal">({hoveredElement.rate})</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <Info className="w-4 h-4 text-gray-400" />
            <span>Hover over any stage node or flow path to view specific volumes and conversion percentages.</span>
          </div>
        )}

        <div className="hidden md:flex items-center gap-6 text-right">
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase">Screen Pass</div>
            <div className="text-xs font-mono font-bold text-black">{rates.screening}%</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase">Interview Pass</div>
            <div className="text-xs font-mono font-bold text-black">{rates.technical}%</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase">Offer Yield</div>
            <div className="text-xs font-mono font-bold text-green-600">{rates.offers}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
