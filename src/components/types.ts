/**
 * Sankey flow data computed from individual application journeys.
 *
 * Each application traces its OWN path through only the stages it actually
 * reached, then ends at its own terminal. An offer granted right after
 * screening (no interviews) flows Total -> Screening -> Offers, skipping the
 * Technical and Final columns entirely.
 *
 * Stage columns (left to right): Total, Screening, Technical, Final.
 * Terminal nodes sit in the column just after their source stage, except
 * Offers/Declined which live in the rightmost column and may receive flows
 * from any earlier stage.
 */
export interface SankeyFlows {
  // Main-chain node values (count that reached each stage)
  total: number;
  screening: number;
  technical: number;
  final: number;

  // Terminal node values
  drafts: number;
  ghosted: number;
  rejScreen: number;
  rejTech: number;
  rejFinal: number;
  offers: number;
  declined: number;

  // Individual flow values (source -> target). Each = count of applications
  // whose journey follows that exact hop.
  totalToScreen: number;
  totalToDrafts: number;
  screenToTech: number;
  screenToGhosted: number;
  screenToRejScreen: number;
  screenToOffers: number;
  screenToDeclined: number;
  techToFinal: number;
  techToRejTech: number;
  techToOffers: number;
  techToDeclined: number;
  finalToRejFinal: number;
  finalToOffers: number;
  finalToDeclined: number;
}

// Kept for backwards compatibility with any external consumers.
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