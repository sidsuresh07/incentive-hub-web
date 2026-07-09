export type ProgramTerms = {
  stub?: boolean;
  incentive_type?: string;
  value?: {
    type?: string;
    amount?: number | string | null;
    unit?: string | null;
    cap?: number | string | null;
  };
  eligibility?: {
    technology?: string[];
    sector?: string[];
    size_limits?: string | null;
    income_qualified?: boolean;
    environmental_justice_qualified?: boolean;
  };
  stacking_notes?: string;
  extra?: Record<string, unknown>;
};

export type Citation = {
  id: string;
  title: string;
  source_type: string;
  reliability_tier: string;
  url: string;
};

export type ReviewStatus =
  | "pending_review"
  | "approved"
  | "auto_published"
  | "rejected";

export type ProgramVersion = {
  id: string;
  effective_start: string;
  effective_end: string | null;
  terms: ProgramTerms;
  value_summary: string;
  change_reason: string | null;
  confidence_flag: "high" | "needs_double_verification";
  conflict_notes: string | null;
  review_status: ReviewStatus;
  status: string;
  citations: Citation[];
};

export const PUBLISHED_REVIEW_STATUSES: ReviewStatus[] = [
  "approved",
  "auto_published",
];

export type ProgramDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  technology: string[];
  secondary_context: string | null;
  parent_program_id: string | null;
  jurisdictions: { name: string; abbreviation: string } | null;
  program_categories: { label: string } | null;
  program_versions: ProgramVersion[];
};

export type ProgramResourceType =
  | "form"
  | "compliance_checklist"
  | "internal_note"
  | "box_link"
  | "other";

export type ProgramNote = {
  id: string;
  program_id: string;
  author_name: string;
  note_text: string;
  created_at: string;
};

export type ProgramResource = {
  id: string;
  program_id: string;
  resource_type: ProgramResourceType;
  title: string;
  url: string | null;
  notes: string | null;
};

/** One row from the program_hierarchy view (a top-level parent + optional child). */
export type ProgramHierarchyRow = {
  parent_id: string;
  parent_name: string;
  parent_slug: string;
  child_id: string | null;
  child_name: string | null;
  child_slug: string | null;
};

export type HierarchyLink = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Resolved hierarchy context for a program's detail sidebar.
 * - parent is null when the program is itself a top-level parent.
 * - children holds the full set of modules in the family (a parent's children,
 *   or, for a child page, all of that child's siblings including itself).
 */
export type ProgramHierarchy = {
  parent: HierarchyLink | null;
  children: HierarchyLink[];
};
