import type { Citation } from "./program-types";

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ReviewCitation {
  id: string;
  title: string;
  source_type: string;
  reliability_tier: string;
  url: string;
}

/** A single row in the review queue, enriched for display and actions. */
export interface ReviewQueueItem {
  id: string;
  program_id: string;
  program_name: string;
  jurisdiction: string;
  jurisdiction_id: string;
  category: string;
  created_by: "agent" | "human";
  review_status: ReviewStatus;
  needs_double_verification: boolean;
  /** Current published version summary (null if none exists yet). */
  value_summary: string | null;
  /** Proposed draft summary from the pending version. */
  draft_value_summary: string;
  change_reason: string | null;
  conflict_notes: string | null;
  citations: ReviewCitation[];
  rejection_note: string | null;
  effective_start: string;
}

export type ReviewQueueResult = {
  items: ReviewQueueItem[];
  error: string | null;
};

export type ReviewActionResult = {
  error: string | null;
};

/** Raw row from program_versions + program joins for pending items. */
export type PendingVersionRow = {
  id: string;
  program_id: string;
  value_summary: string;
  change_reason: string | null;
  confidence_flag: "high" | "needs_double_verification";
  conflict_notes: string | null;
  created_by: "agent" | "human";
  effective_start: string;
  review_status: string;
  rejection_note: string | null;
  programs: {
    name: string;
    jurisdiction_id: string;
    category: string;
    program_categories: { label: string } | null;
    jurisdictions: { name: string } | null;
  } | null;
};

export function toReviewCitation(citation: Citation): ReviewCitation {
  return {
    id: citation.id,
    title: citation.title,
    source_type: citation.source_type,
    reliability_tier: citation.reliability_tier,
    url: citation.url,
  };
}
