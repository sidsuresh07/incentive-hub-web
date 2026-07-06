export type ProgramTerms = {
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

export type ProgramVersion = {
  id: string;
  effective_start: string;
  effective_end: string | null;
  terms: ProgramTerms;
  value_summary: string;
  change_reason: string | null;
  confidence_flag: "high" | "needs_double_verification";
  conflict_notes: string | null;
  citations: Citation[];
};

export type ProgramDetail = {
  id: string;
  name: string;
  slug: string;
  status: string;
  technology: string[];
  secondary_context: string | null;
  jurisdictions: { name: string } | null;
  program_categories: { label: string } | null;
  program_versions: ProgramVersion[];
};
