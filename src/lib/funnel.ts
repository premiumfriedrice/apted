import type { Application, Outcome } from "./applications";
import type { SankeyFlows } from "@/components/types";

/**
 * For a single application, determine which stages it reached and where it
 * ended (its terminal).
 *
 * Stages reached (left-to-right):
 *   screening = submitted (not draft)
 *   technical = got to interview round 1
 *   final     = got to interview round 2+
 *
 * `interviewRound` is treated as "furthest round reached" (preserved on
 * offer/declined), so an offer granted right after screening has
 * interviewRound = null -> reachedTech = false -> it skips interviews.
 */
interface Journey {
  reachedScreen: boolean;
  reachedTech: boolean;
  reachedFinal: boolean;
  terminal:
    | "drafts"
    | "ghosted"
    | "pendingScreen"
    | "pendingTech"
    | "pendingFinal"
    | "rejScreen"
    | "rejTech"
    | "rejFinal"
    | "offers"
    | "declined";
}

function journeyOf(a: Application): Journey {
  const outcome: Outcome = a.outcome;
  const intR = a.interviewRound ?? 0;
  const rejR = a.rejectedAfterRound ?? 0;

  if (outcome === "draft") {
    return { reachedScreen: false, reachedTech: false, reachedFinal: false, terminal: "drafts" };
  }

  // Submitted -> at least screening.
  const reachedTech =
    outcome === "rejected" ? rejR >= 1
    : outcome === "interviewing" ? intR >= 1
    : outcome === "applied" || outcome === "ghosted" ? false
    : intR >= 1; // offer / declined: furthest round reached

  const reachedFinal =
    outcome === "rejected" ? rejR >= 2
    : outcome === "interviewing" ? intR >= 2
    : outcome === "applied" || outcome === "ghosted" ? false
    : intR >= 2; // offer / declined

  let terminal: Journey["terminal"];
  if (outcome === "applied") {
    terminal = "pendingScreen"; // submitted, waiting at screening
  } else if (outcome === "interviewing") {
    // In an interview round: pending at the furthest stage reached so far.
    terminal = reachedFinal ? "pendingFinal" : "pendingTech";
  } else if (outcome === "ghosted") {
    terminal = "ghosted";
  } else if (outcome === "rejected") {
    terminal = rejR === 0 ? "rejScreen" : rejR === 1 ? "rejTech" : "rejFinal";
  } else if (outcome === "offer") {
    terminal = "offers";
  } else {
    terminal = "declined"; // covers declined (draft handled by early return)
  }

  return { reachedScreen: true, reachedTech, reachedFinal, terminal };
}

/**
 * Aggregate individual application journeys into Sankey flow values.
 * Each application contributes exactly one unit through its path; flows that
 * skip stages (e.g. offer right after screening) are routed directly to the
 * terminal from the furthest stage reached.
 */
export function applicationsToSankey(apps: Application[]): SankeyFlows {
  const f: SankeyFlows = {
    total: apps.length,
    screening: 0,
    technical: 0,
    final: 0,
    drafts: 0,
    ghosted: 0,
    pending: 0,
    rejScreen: 0,
    rejTech: 0,
    rejFinal: 0,
    offers: 0,
    declined: 0,
    totalToScreen: 0,
    totalToDrafts: 0,
    screenToTech: 0,
    screenToGhosted: 0,
    screenToPending: 0,
    screenToRejScreen: 0,
    screenToOffers: 0,
    screenToDeclined: 0,
    techToFinal: 0,
    techToRejTech: 0,
    techToOffers: 0,
    techToDeclined: 0,
    techToPending: 0,
    finalToRejFinal: 0,
    finalToOffers: 0,
    finalToDeclined: 0,
    finalToPending: 0,
  };

  for (const a of apps) {
    const j = journeyOf(a);

    if (!j.reachedScreen) {
      f.totalToDrafts++;
      f.drafts++;
      continue;
    }

    f.totalToScreen++;
    f.screening++;

    if (!j.reachedTech) {
      // maxStage = screening. Terminal flows out of Screening directly.
      switch (j.terminal) {
        case "ghosted": f.screenToGhosted++; f.ghosted++; break;
        case "pendingScreen": f.screenToPending++; f.pending++; break;
        case "rejScreen": f.screenToRejScreen++; f.rejScreen++; break;
        case "offers": f.screenToOffers++; f.offers++; break;
        case "declined": f.screenToDeclined++; f.declined++; break;
      }
      continue;
    }

    f.screenToTech++;
    f.technical++;

    if (!j.reachedFinal) {
      // maxStage = technical. Terminal flows out of Technical.
      switch (j.terminal) {
        case "rejTech": f.techToRejTech++; f.rejTech++; break;
        case "pendingTech": f.techToPending++; f.pending++; break;
        case "offers": f.techToOffers++; f.offers++; break;
        case "declined": f.techToDeclined++; f.declined++; break;
        case "ghosted": /* shouldn't happen post-tech */ break;
      }
      continue;
    }

    // maxStage = final.
    f.techToFinal++;
    f.final++;
    switch (j.terminal) {
      case "rejFinal": f.finalToRejFinal++; f.rejFinal++; break;
      case "pendingFinal": f.finalToPending++; f.pending++; break;
      case "offers": f.finalToOffers++; f.offers++; break;
      case "declined": f.finalToDeclined++; f.declined++; break;
    }
  }

  return f;
}