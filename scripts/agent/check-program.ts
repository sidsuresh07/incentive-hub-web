#!/usr/bin/env tsx
/**
 * Agent check: compare a program's published terms against the web.
 *
 * Usage:
 *   npx tsx scripts/agent/check-program.ts <program-slug>
 *   npx tsx scripts/agent/check-program.ts --jurisdiction MA
 *   npx tsx scripts/agent/check-program.ts --all
 *   npx tsx scripts/agent/check-program.ts --discover MA
 *   npx tsx scripts/agent/check-program.ts --onboard "Program Name" --jurisdiction RI
 *
 * npm run agent:check -- ma-smart-3-0
 * npm run agent:check-all
 * npm run agent:discover -- MA
 */

import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { resolve } from "path";
import { Client } from "pg";

config({ path: resolve(process.cwd(), ".env.local") });

type CitationRow = {
  title: string;
  url: string;
  source_type: string;
};

type CurrentVersionRow = {
  program_id: string;
  jurisdiction_id: string;
  program_name: string;
  jurisdiction_name: string;
  slug: string;
  version_id: string;
  effective_start: string;
  terms: Record<string, unknown>;
  value_summary: string;
  secondary_context: string | null;
  niche_notes: string | null;
  citations: CitationRow[];
};

type AgentCheckResponse = {
  changed: boolean;
  new_value_summary: string | null;
  new_terms: Record<string, unknown> | null;
  change_reason: string | null;
  confidence: "high" | "needs_double_verification";
  conflict_notes: string | null;
  citation_url: string | null;
  citation_title: string | null;
  citation_source_type: string | null;
};

type DiscoveryItem = {
  name: string;
  description: string;
  why_missing: string;
  source_url: string;
};

type OnboardCitation = {
  title: string;
  url: string;
  source_type: string;
};

type OnboardResponse = {
  summary: string;
  secondary_context: string | null;
  technology: string[];
  category: string | null;
  category_review_note: string | null;
  is_interconnection_or_market_rule: boolean;
  value_summary: string;
  terms: Record<string, unknown>;
  niche_notes: string | null;
  unverified: string[];
  confidence: "high" | "needs_double_verification";
  conflict_notes: string | null;
  citations: OnboardCitation[];
};

type CategoryRow = {
  slug: string;
  label: string;
  description: string | null;
};

type CheckResult = {
  program_name: string;
  slug: string;
  result: "changed" | "no change" | "error";
  confidence: string | null;
  error: string | null;
};

type CliArgs =
  | { mode: "single"; slug: string }
  | { mode: "batch-all" }
  | { mode: "batch-jurisdiction"; jurisdiction: string }
  | { mode: "discover"; jurisdiction: string }
  | { mode: "onboard"; programName: string; jurisdiction: string };

const BATCH_DELAY_MS = 2500;

const CATEGORY_FALLBACK_SLUG = "other_regulatory";

const DUPLICATE_SIMILARITY_THRESHOLD = 0.6;

const VALID_TECHNOLOGIES = new Set(["solar", "wind", "storage"]);

const VALID_SOURCE_TYPES = new Set([
  "puc_docket",
  "agency_filing",
  "statute",
  "dsire",
  "nrel",
  "law_firm_alert",
  "trade_press",
  "other",
]);

const PRIMARY_SOURCE_TYPES = new Set([
  "puc_docket",
  "agency_filing",
  "statute",
]);

function usage(): string {
  return (
    "Usage:\n" +
    "  npx tsx scripts/agent/check-program.ts <program-slug>\n" +
    "  npx tsx scripts/agent/check-program.ts --jurisdiction <code-or-name>\n" +
    "  npx tsx scripts/agent/check-program.ts --all\n" +
    "  npx tsx scripts/agent/check-program.ts --discover <code-or-name>\n" +
    '  npx tsx scripts/agent/check-program.ts --onboard "Program Name" --jurisdiction <code-or-name>'
  );
}

function parseCliArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  if (args.length === 0) {
    console.error(usage());
    process.exit(1);
  }

  if (args.includes("--onboard")) {
    const onboardIndex = args.indexOf("--onboard");
    const programName = args[onboardIndex + 1];
    if (!programName || programName.startsWith("--")) {
      console.error(`Missing program name after --onboard\n\n${usage()}`);
      process.exit(1);
    }

    const jurisdictionIndex = args.indexOf("--jurisdiction");
    if (
      jurisdictionIndex === -1 ||
      !args[jurisdictionIndex + 1] ||
      args[jurisdictionIndex + 1].startsWith("--")
    ) {
      console.error(
        `--onboard requires --jurisdiction <code-or-name>\n\n${usage()}`
      );
      process.exit(1);
    }

    return {
      mode: "onboard",
      programName,
      jurisdiction: args[jurisdictionIndex + 1],
    };
  }

  if (args[0] === "--all") {
    if (args.length > 1) {
      console.error(`Unexpected arguments after --all\n\n${usage()}`);
      process.exit(1);
    }
    return { mode: "batch-all" };
  }

  if (args[0] === "--jurisdiction") {
    if (!args[1]) {
      console.error(`Missing jurisdiction value\n\n${usage()}`);
      process.exit(1);
    }
    if (args.length > 2) {
      console.error(`Unexpected arguments after --jurisdiction\n\n${usage()}`);
      process.exit(1);
    }
    return { mode: "batch-jurisdiction", jurisdiction: args[1] };
  }

  if (args[0] === "--discover") {
    if (!args[1]) {
      console.error(`Missing jurisdiction value\n\n${usage()}`);
      process.exit(1);
    }
    if (args.length > 2) {
      console.error(`Unexpected arguments after --discover\n\n${usage()}`);
      process.exit(1);
    }
    return { mode: "discover", jurisdiction: args[1] };
  }

  if (args[0].startsWith("-")) {
    console.error(`Unknown option: ${args[0]}\n\n${usage()}`);
    process.exit(1);
  }

  if (args.length > 1) {
    console.error(`Unexpected extra arguments\n\n${usage()}`);
    process.exit(1);
  }

  return { mode: "single", slug: args[0] };
}

function requireEnv(): void {
  const missing: string[] = [];

  if (!process.env.AGENT_DATABASE_URL?.trim()) {
    missing.push("AGENT_DATABASE_URL");
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    missing.push("ANTHROPIC_API_KEY");
  }

  if (missing.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missing.join(", ")}\n\n` +
        "Add them to .env.local in the project root:\n" +
        "  AGENT_DATABASE_URL=postgresql://...  (Supabase → Database → connection string)\n" +
        "  ANTHROPIC_API_KEY=sk-ant-...         (console.anthropic.com → API keys)"
    );
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const start = candidate.indexOf("{");
  if (start === -1) {
    throw new Error(`No JSON object found in response.\n\nRaw text:\n${text}`);
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return candidate.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Unclosed JSON object in response.\n\nRaw text:\n${text}`);
}

function extractJsonArray(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const start = candidate.indexOf("[");
  if (start === -1) {
    throw new Error(`No JSON array found in response.\n\nRaw text:\n${text}`);
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) {
        return candidate.slice(start, i + 1);
      }
    }
  }

  throw new Error(`Unclosed JSON array in response.\n\nRaw text:\n${text}`);
}

function parseAgentJson(text: string): AgentCheckResponse {
  const jsonText = extractJsonObject(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse error";
    throw new Error(
      `Failed to parse Claude response as JSON: ${message}\n\nExtracted JSON:\n${jsonText}\n\nRaw text:\n${text}`
    );
  }

  const response = parsed as AgentCheckResponse;

  if (typeof response.changed !== "boolean") {
    throw new Error(
      `Claude JSON is missing a boolean "changed" field.\n\nParsed object:\n${JSON.stringify(parsed, null, 2)}`
    );
  }

  if (
    response.confidence !== "high" &&
    response.confidence !== "needs_double_verification"
  ) {
    response.confidence = "needs_double_verification";
  }

  return response;
}

function parseDiscoveryJson(text: string): DiscoveryItem[] {
  const jsonText = extractJsonArray(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse error";
    throw new Error(
      `Failed to parse Claude discovery response as JSON: ${message}\n\nExtracted JSON:\n${jsonText}\n\nRaw text:\n${text}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Discovery response must be a JSON array.");
  }

  return parsed.map((item, index) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as DiscoveryItem).name !== "string" ||
      typeof (item as DiscoveryItem).description !== "string" ||
      typeof (item as DiscoveryItem).why_missing !== "string" ||
      typeof (item as DiscoveryItem).source_url !== "string"
    ) {
      throw new Error(
        `Discovery item at index ${index} is missing required fields.\n\nItem:\n${JSON.stringify(item, null, 2)}`
      );
    }
    return item as DiscoveryItem;
  });
}

/**
 * Coerce a value into a clean string array. LLMs occasionally return
 * list-shaped fields (eligibility.technology, eligibility.sector) as a single
 * prose sentence; a lone string is wrapped so the value is always an array.
 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

/**
 * Guarantee the shape of terms before it is persisted. Today this normalizes
 * the eligibility list fields (technology, sector) to arrays so downstream
 * consumers in the web app can safely call array methods on them.
 */
function normalizeTerms(
  terms: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) {
    return terms ?? null;
  }
  const next: Record<string, unknown> = { ...terms };
  const eligibility = next.eligibility;
  if (
    eligibility &&
    typeof eligibility === "object" &&
    !Array.isArray(eligibility)
  ) {
    const elig = { ...(eligibility as Record<string, unknown>) };
    if ("technology" in elig) {
      elig.technology = toStringArray(elig.technology);
    }
    if ("sector" in elig) {
      elig.sector = toStringArray(elig.sector);
    }
    next.eligibility = elig;
  }
  return next;
}

function parseOnboardJson(text: string): OnboardResponse {
  const jsonText = extractJsonObject(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse error";
    throw new Error(
      `Failed to parse Claude onboard response as JSON: ${message}\n\nExtracted JSON:\n${jsonText}\n\nRaw text:\n${text}`
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Onboard response must be a JSON object.");
  }

  const raw = parsed as Record<string, unknown>;

  if (typeof raw.value_summary !== "string" || !raw.value_summary.trim()) {
    throw new Error('Onboard response is missing a non-empty "value_summary".');
  }

  if (!raw.terms || typeof raw.terms !== "object" || Array.isArray(raw.terms)) {
    throw new Error('Onboard response is missing a "terms" object.');
  }

  if (!Array.isArray(raw.citations) || raw.citations.length === 0) {
    throw new Error(
      'Onboard response must include at least one entry in "citations".'
    );
  }

  const citations: OnboardCitation[] = raw.citations.map((entry, index) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as OnboardCitation).title !== "string" ||
      typeof (entry as OnboardCitation).url !== "string" ||
      typeof (entry as OnboardCitation).source_type !== "string"
    ) {
      throw new Error(
        `Citation at index ${index} is missing required fields (title, url, source_type).`
      );
    }
    return entry as OnboardCitation;
  });

  const technology = Array.isArray(raw.technology)
    ? raw.technology.filter(
        (item): item is string =>
          typeof item === "string" && VALID_TECHNOLOGIES.has(item)
      )
    : [];

  const unverified = Array.isArray(raw.unverified)
    ? raw.unverified.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      )
    : [];

  const confidence =
    raw.confidence === "high" || raw.confidence === "needs_double_verification"
      ? raw.confidence
      : "needs_double_verification";

  const asStringOrNull = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  return {
    summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
    secondary_context: asStringOrNull(raw.secondary_context),
    technology,
    category: asStringOrNull(raw.category),
    category_review_note: asStringOrNull(raw.category_review_note),
    is_interconnection_or_market_rule:
      raw.is_interconnection_or_market_rule === true,
    value_summary: raw.value_summary.trim(),
    terms: normalizeTerms(raw.terms as Record<string, unknown>) ?? {},
    niche_notes: asStringOrNull(raw.niche_notes),
    unverified,
    confidence,
    conflict_notes: asStringOrNull(raw.conflict_notes),
    citations,
  };
}

function extractTextFromMessage(
  content: Anthropic.Messages.ContentBlock[]
): string {
  return content
    .filter(
      (block): block is Anthropic.Messages.TextBlock => block.type === "text"
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function normalizeSourceType(value: string | null): string {
  if (value && VALID_SOURCE_TYPES.has(value)) {
    return value;
  }
  return "other";
}

function reliabilityTierForSourceType(sourceType: string): "primary" | "secondary" {
  return PRIMARY_SOURCE_TYPES.has(sourceType) ? "primary" : "secondary";
}

function jurisdictionFilterClause(alias = "j"): string {
  return `(
    UPPER(${alias}.abbreviation) = UPPER($1)
    OR LOWER(${alias}.name) = LOWER($1)
  )`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function buildSlug(name: string, abbreviation: string): string {
  const base = slugify(name);
  const prefix = abbreviation.toLowerCase();

  if (!prefix || base === prefix || base.startsWith(`${prefix}-`)) {
    return base;
  }
  return `${prefix}-${base}`;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameTokens(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of Array.from(a)) {
    if (b.has(token)) {
      intersection++;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function findJurisdiction(
  client: Client,
  jurisdiction: string
): Promise<{ id: string; name: string; abbreviation: string } | null> {
  const result = await client.query<{
    id: string;
    name: string;
    abbreviation: string;
  }>(
    `
    SELECT id, name, abbreviation
    FROM jurisdictions j
    WHERE ${jurisdictionFilterClause("j")}
    LIMIT 1
    `,
    [jurisdiction]
  );

  return result.rows[0] ?? null;
}

async function fetchCategories(client: Client): Promise<CategoryRow[]> {
  const result = await client.query<CategoryRow>(
    `
    SELECT slug, label, description
    FROM program_categories
    ORDER BY label ASC
    `
  );
  return result.rows;
}

async function findCloseProgramMatch(
  client: Client,
  jurisdictionId: string,
  programName: string,
  candidateSlug: string
): Promise<{ name: string; slug: string; reason: string } | null> {
  const result = await client.query<{ name: string; slug: string }>(
    `
    SELECT name, slug
    FROM programs
    WHERE jurisdiction_id = $1
    `,
    [jurisdictionId]
  );

  const targetTokens = nameTokens(programName);
  const targetNormalized = normalizeName(programName);

  for (const row of result.rows) {
    if (row.slug === candidateSlug) {
      return { name: row.name, slug: row.slug, reason: "identical slug" };
    }
    if (normalizeName(row.name) === targetNormalized) {
      return { name: row.name, slug: row.slug, reason: "identical name" };
    }
    const similarity = jaccardSimilarity(targetTokens, nameTokens(row.name));
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
      return {
        name: row.name,
        slug: row.slug,
        reason: `name similarity ${(similarity * 100).toFixed(0)}%`,
      };
    }
  }

  return null;
}

async function fetchCurrentVersion(
  client: Client,
  slug: string
): Promise<CurrentVersionRow | null> {
  const programResult = await client.query<{
    program_id: string;
    jurisdiction_id: string;
    program_name: string;
    jurisdiction_name: string;
    slug: string;
    version_id: string;
    effective_start: Date;
    terms: Record<string, unknown>;
    value_summary: string;
    secondary_context: string | null;
    niche_notes: string | null;
  }>(
    `
    SELECT
      p.id AS program_id,
      p.jurisdiction_id,
      p.name AS program_name,
      p.secondary_context,
      j.name AS jurisdiction_name,
      p.slug,
      pv.id AS version_id,
      pv.effective_start,
      pv.terms,
      pv.value_summary,
      pv.niche_notes
    FROM programs p
    JOIN jurisdictions j ON j.id = p.jurisdiction_id
    JOIN program_versions pv ON pv.program_id = p.id
    WHERE p.slug = $1
      AND pv.effective_end IS NULL
      AND pv.review_status IN ('approved', 'auto_published')
      AND pv.status = 'active'
    ORDER BY pv.effective_start DESC
    LIMIT 1
    `,
    [slug]
  );

  if (programResult.rows.length === 0) {
    return null;
  }

  const row = programResult.rows[0];

  const citationsResult = await client.query<CitationRow>(
    `
    SELECT title, url, source_type::text
    FROM citations
    WHERE program_version_id = $1
    ORDER BY title ASC
    `,
    [row.version_id]
  );

  return {
    program_id: row.program_id,
    jurisdiction_id: row.jurisdiction_id,
    program_name: row.program_name,
    jurisdiction_name: row.jurisdiction_name,
    slug: row.slug,
    version_id: row.version_id,
    effective_start: row.effective_start.toISOString().slice(0, 10),
    terms: row.terms,
    value_summary: row.value_summary,
    secondary_context: row.secondary_context,
    niche_notes: row.niche_notes,
    citations: citationsResult.rows,
  };
}

async function fetchActiveProgramSlugs(
  client: Client,
  jurisdiction?: string
): Promise<Array<{ slug: string; name: string }>> {
  const jurisdictionClause = jurisdiction
    ? `AND ${jurisdictionFilterClause("j")}`
    : "";

  const params = jurisdiction ? [jurisdiction] : [];

  const result = await client.query<{ slug: string; name: string }>(
    `
    SELECT DISTINCT p.slug, p.name
    FROM programs p
    JOIN jurisdictions j ON j.id = p.jurisdiction_id
    JOIN program_versions pv ON pv.program_id = p.id
    WHERE pv.effective_end IS NULL
      AND pv.review_status IN ('approved', 'auto_published')
      AND pv.status = 'active'
      ${jurisdictionClause}
    ORDER BY p.name ASC
    `,
    params
  );

  return result.rows;
}

async function fetchProgramNamesForJurisdiction(
  client: Client,
  jurisdiction: string
): Promise<{ jurisdiction_name: string; program_names: string[] }> {
  const result = await client.query<{ name: string; jurisdiction_name: string }>(
    `
    SELECT DISTINCT p.name, j.name AS jurisdiction_name
    FROM programs p
    JOIN jurisdictions j ON j.id = p.jurisdiction_id
    JOIN program_versions pv ON pv.program_id = p.id
    WHERE pv.effective_end IS NULL
      AND pv.review_status IN ('approved', 'auto_published')
      AND pv.status = 'active'
      AND ${jurisdictionFilterClause("j")}
    ORDER BY p.name ASC
    `,
    [jurisdiction]
  );

  if (result.rows.length === 0) {
    const jurisdictionLookup = await client.query<{ name: string }>(
      `
      SELECT name
      FROM jurisdictions j
      WHERE ${jurisdictionFilterClause("j")}
      LIMIT 1
      `,
      [jurisdiction]
    );

    if (jurisdictionLookup.rows.length === 0) {
      throw new Error(`No jurisdiction found matching "${jurisdiction}".`);
    }

    return {
      jurisdiction_name: jurisdictionLookup.rows[0].name,
      program_names: [],
    };
  }

  return {
    jurisdiction_name: result.rows[0].jurisdiction_name,
    program_names: result.rows.map((row) => row.name),
  };
}

function formatContextBlock(label: string, value: string | null): string {
  if (!value?.trim()) {
    return `${label}:\n(none)`;
  }
  return `${label}:\n${value.trim()}`;
}

function buildPrompt(current: CurrentVersionRow): string {
  const citationList =
    current.citations.length > 0
      ? current.citations
          .map(
            (c, i) =>
              `${i + 1}. ${c.title}\n   URL: ${c.url}\n   source_type: ${c.source_type}`
          )
          .join("\n")
      : "(no citations on file — search for official sources)";

  return `You are checking whether an incentive/regulatory program's terms have materially changed since they were last published.

Program name: ${current.program_name}
Jurisdiction: ${current.jurisdiction_name}
Slug: ${current.slug}
Current version effective_start: ${current.effective_start}

Current value_summary:
${current.value_summary}

Current terms (JSON):
${JSON.stringify(current.terms, null, 2)}

${formatContextBlock("Secondary context (program-level notes already on file)", current.secondary_context)}

${formatContextBlock("Niche notes (prior corrections and edge-case findings for this version — do not contradict these)", current.niche_notes)}

Existing citation URL(s) to check first:
${citationList}

Instructions:
1. Use web search to determine whether anything about this program's terms has MATERIALLY changed since ${current.effective_start}.
2. Prioritize checking the same official source URL(s) listed above first.
3. Only search more broadly if those sources are stale, unavailable, or inconclusive.
4. Treat secondary_context and niche_notes as authoritative background we already verified — do not contradict them or miss details they already capture.
5. If genuinely nothing has changed, say so clearly — do NOT invent a change to seem useful.
6. Only set changed=true for material changes to incentive value, eligibility, status, or effective rules (not trivial wording).

IMPORTANT: Your entire response must be ONLY a single JSON object — no explanatory text before or after it, no markdown, no code fences, no commentary. Start your response with "{" and end with "}".

Respond in exactly this shape:
{
  "changed": boolean,
  "new_value_summary": string or null,
  "new_terms": object or null,
  "change_reason": string or null,
  "confidence": "high" or "needs_double_verification",
  "conflict_notes": string or null,
  "citation_url": string or null,
  "citation_title": string or null,
  "citation_source_type": string or null
}

Field rules:
- new_terms must match the existing structure when changed=true: incentive_type, value, eligibility, stacking_notes, extra. Within eligibility, technology and sector MUST be JSON arrays of short strings (e.g. ["solar", "storage"]), never a prose sentence — put longer descriptive detail in size_limits or stacking_notes.
- If changed is false: new_value_summary, new_terms, and citation fields must be null; put a one-sentence summary of what you verified in change_reason
- If changed is true: new_value_summary and new_terms are required; change_reason must explain the material change
- citation_source_type must be one of: puc_docket, agency_filing, statute, dsire, nrel, law_firm_alert, trade_press, other
- Use needs_double_verification if sources conflict, dates are ambiguous, or you are uncertain`;
}

function buildDiscoveryPrompt(
  jurisdictionName: string,
  jurisdictionInput: string,
  programNames: string[]
): string {
  const existingList =
    programNames.length > 0
      ? programNames.map((name, index) => `${index + 1}. ${name}`).join("\n")
      : "(no programs currently on file for this jurisdiction)";

  return `You are helping maintain a database of clean energy incentive, tax, and regulatory programs.

Jurisdiction: ${jurisdictionName} (${jurisdictionInput})

Programs already in our database for this jurisdiction:
${existingList}

Use web search to identify state-level (or jurisdiction-level) clean energy incentive, tax credit, rebate, or regulatory programs focused on solar, wind, and/or energy storage that appear to be MISSING from the list above.

Look for programs that are real, currently relevant, and substantively distinct — not minor variants of programs we already track.

IMPORTANT: Your entire response must be ONLY a single JSON array — no explanatory text before or after it, no markdown, no code fences, no commentary. Start your response with "[" and end with "]".

Return an empty array [] if you find no credible missing programs.

Respond in exactly this shape:
[
  {
    "name": string,
    "description": string,
    "why_missing": string,
    "source_url": string
  }
]

Field rules:
- name: official or commonly used program name
- description: one or two sentences on what the program does and who it serves
- why_missing: brief explanation of why this appears absent from our existing list
- source_url: best official or authoritative source URL you found`;
}

function buildOnboardPrompt(
  programName: string,
  jurisdictionName: string,
  jurisdictionAbbreviation: string,
  categories: CategoryRow[]
): string {
  const categoryList = categories
    .map((c) => `- ${c.slug}: ${c.label}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");

  return `You are researching a brand-new clean energy incentive/regulatory program to add to our database for the first time. This is NOT an update to an existing program — we currently have no record of it.

Program name: ${programName}
Jurisdiction: ${jurisdictionName} (${jurisdictionAbbreviation})

Research this specific program thoroughly using web search. Determine:
1. What the program is and who administers it (administering body/agency).
2. Current terms: incentive value, eligibility, size limits, and stacking rules with other programs.
3. Any structural quirks: mutual exclusivity with other programs, size-tiered pricing, declining blocks, capacity caps, sunset dates, etc.
4. Cite PRIMARY sources wherever possible (state agency filings, PUC dockets, statutes, official program pages).

CRITICAL — honesty about certainty:
- Explicitly flag anything you could NOT verify with confidence in the "unverified" array (e.g. "Large-scale/utility pricing requires checking a live docket", "Exact 2026 block rate not confirmed on official source").
- Do NOT present uncertain details as equally certain as confirmed ones.
- If any material term is uncertain, set "confidence" to "needs_double_verification".

Category governance: choose the single best-fitting category slug from this controlled list:
${categoryList}
- If NONE of these fit well, set "category" to null and explain in "category_review_note" what category is actually needed. Do not force a poor fit.

IMPORTANT: Your entire response must be ONLY a single JSON object — no explanatory text before or after it, no markdown, no code fences, no commentary. Start your response with "{" and end with "}".

Respond in exactly this shape:
{
  "summary": string,
  "secondary_context": string or null,
  "technology": array of any of ["solar", "wind", "storage"],
  "category": string (a slug from the list above) or null,
  "category_review_note": string or null,
  "is_interconnection_or_market_rule": boolean,
  "value_summary": string,
  "terms": {
    "incentive_type": string,
    "value": object,
    "eligibility": object,
    "stacking_notes": string,
    "extra": object
  },
  "niche_notes": string or null,
  "unverified": array of strings,
  "confidence": "high" or "needs_double_verification",
  "conflict_notes": string or null,
  "citations": [
    { "title": string, "url": string, "source_type": string }
  ]
}

Field rules:
- summary: one or two sentences describing the program.
- secondary_context: deeper background, program history, or interactions with other programs (or null).
- value_summary: a concise plain-language statement of the headline value/benefit.
- terms.value should capture type, amount, unit, and cap where applicable.
- terms.eligibility should capture technology, sector, size_limits, and any income/EJ qualifications. eligibility.technology and eligibility.sector MUST be JSON arrays of short strings (e.g. "technology": ["solar", "storage"], "sector": ["residential", "commercial"]) — never a prose sentence. Put any longer descriptive detail in size_limits or stacking_notes, not inside those arrays.
- terms.stacking_notes: how this stacks or conflicts with other incentives.
- niche_notes: edge cases, quirks, and caveats worth recording (or null).
- is_interconnection_or_market_rule: true only for interconnection or wholesale-market/net-metering style rules, false for incentives.
- citations: at least one; each source_type must be one of: puc_docket, agency_filing, statute, dsire, nrel, law_firm_alert, trade_press, other.
- Use needs_double_verification if sources conflict, dates are ambiguous, or anything material is unverified.`;
}

async function callClaudeForCheck(prompt: string): Promise<AgentCheckResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractTextFromMessage(response.content);
  if (!text) {
    throw new Error("Claude returned no text content to parse.");
  }

  return parseAgentJson(text);
}

async function callClaudeForDiscovery(prompt: string): Promise<DiscoveryItem[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractTextFromMessage(response.content);
  if (!text) {
    throw new Error("Claude returned no text content to parse.");
  }

  return parseDiscoveryJson(text);
}

async function callClaudeForOnboard(prompt: string): Promise<OnboardResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractTextFromMessage(response.content);
  if (!text) {
    throw new Error("Claude returned no text content to parse.");
  }

  return parseOnboardJson(text);
}

async function insertNoChangeCheck(
  client: Client,
  current: CurrentVersionRow,
  agent: AgentCheckResponse
): Promise<void> {
  const sourceUrl = current.citations[0]?.url;
  if (!sourceUrl) {
    throw new Error(
      "Cannot log source_checks: no existing citation URL on the current version."
    );
  }

  const notes =
    agent.change_reason?.trim() ||
    agent.conflict_notes?.trim() ||
    "No material change detected.";

  await client.query(
    `
    INSERT INTO source_checks (
      program_id, jurisdiction_id, source_url, change_detected, notes
    ) VALUES ($1, $2, $3, false, $4)
    `,
    [current.program_id, current.jurisdiction_id, sourceUrl, notes]
  );
}

async function insertPendingDraft(
  client: Client,
  current: CurrentVersionRow,
  agent: AgentCheckResponse
): Promise<string> {
  if (!agent.new_value_summary || !agent.new_terms) {
    throw new Error(
      "Claude reported changed=true but missing new_value_summary or new_terms."
    );
  }

  const citationUrl =
    agent.citation_url ?? current.citations[0]?.url ?? null;
  if (!citationUrl) {
    throw new Error(
      "Claude reported changed=true but no citation_url is available."
    );
  }

  const sourceType = normalizeSourceType(agent.citation_source_type);
  const reliabilityTier = reliabilityTierForSourceType(sourceType);
  const effectiveStart = new Date().toISOString().slice(0, 10);

  const versionResult = await client.query<{ id: string }>(
    `
    INSERT INTO program_versions (
      program_id,
      effective_start,
      effective_end,
      status,
      terms,
      value_summary,
      change_reason,
      created_by,
      review_status,
      confidence_flag,
      conflict_notes
    ) VALUES (
      $1, $2, NULL, 'proposed', $3, $4, $5, 'agent', 'pending_review', $6, $7
    )
    RETURNING id
    `,
    [
      current.program_id,
      effectiveStart,
      JSON.stringify(normalizeTerms(agent.new_terms)),
      agent.new_value_summary,
      agent.change_reason,
      agent.confidence,
      agent.conflict_notes,
    ]
  );

  const newVersionId = versionResult.rows[0].id;

  await client.query(
    `
    INSERT INTO citations (
      program_version_id,
      source_type,
      reliability_tier,
      title,
      url,
      accessed_date
    ) VALUES (
      $1,
      $2::source_type_enum,
      $3::reliability_tier_enum,
      $4,
      $5,
      CURRENT_DATE
    )
    `,
    [
      newVersionId,
      sourceType,
      reliabilityTier,
      agent.citation_title ?? citationUrl,
      citationUrl,
    ]
  );

  return newVersionId;
}

async function runSingleProgramCheck(
  client: Client,
  slug: string
): Promise<CheckResult> {
  const current = await fetchCurrentVersion(client, slug);

  if (!current) {
    throw new Error(
      `No active published version found for slug "${slug}" ` +
        `(effective_end IS NULL, review_status approved/auto_published, status active).`
    );
  }

  console.log(`Fetched current version for ${current.program_name}`);
  console.log("Calling Claude...");

  const agentResponse = await callClaudeForCheck(buildPrompt(current));

  if (!agentResponse.changed) {
    console.log("Claude response: not changed");
    await insertNoChangeCheck(client, current, agentResponse);
    console.log("Logged source check, no change");
    return {
      program_name: current.program_name,
      slug: current.slug,
      result: "no change",
      confidence: null,
      error: null,
    };
  }

  console.log("Claude response: changed");
  const newVersionId = await insertPendingDraft(client, current, agentResponse);
  console.log(`Inserted draft version (id: ${newVersionId}, pending_review)`);
  return {
    program_name: current.program_name,
    slug: current.slug,
    result: "changed",
    confidence: agentResponse.confidence,
    error: null,
  };
}

async function runBatchChecks(
  client: Client,
  programs: Array<{ slug: string; name: string }>
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  if (programs.length === 0) {
    console.log("No active programs found to check.");
    return results;
  }

  console.log(`Checking ${programs.length} program(s)...\n`);

  for (let index = 0; index < programs.length; index++) {
    const program = programs[index];
    const label = `[${index + 1}/${programs.length}] ${program.name} (${program.slug})`;

    if (index > 0) {
      await sleep(BATCH_DELAY_MS);
    }

    console.log(`${label}`);
    try {
      const current = await fetchCurrentVersion(client, program.slug);
      if (!current) {
        throw new Error(
          `No active published version found for slug "${program.slug}".`
        );
      }

      const agentResponse = await callClaudeForCheck(buildPrompt(current));

      if (!agentResponse.changed) {
        await insertNoChangeCheck(client, current, agentResponse);
        results.push({
          program_name: current.program_name,
          slug: current.slug,
          result: "no change",
          confidence: null,
          error: null,
        });
        console.log("  → no change\n");
        continue;
      }

      const newVersionId = await insertPendingDraft(
        client,
        current,
        agentResponse
      );
      results.push({
        program_name: current.program_name,
        slug: current.slug,
        result: "changed",
        confidence: agentResponse.confidence,
        error: null,
      });
      console.log(
        `  → changed (draft ${newVersionId}, confidence: ${agentResponse.confidence})\n`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      console.error(`  → ERROR: ${message}\n`);
      results.push({
        program_name: program.name,
        slug: program.slug,
        result: "error",
        confidence: null,
        error: message,
      });
    }
  }

  return results;
}

function printBatchSummary(results: CheckResult[]): void {
  if (results.length === 0) {
    return;
  }

  const nameWidth = Math.max(
    "Program".length,
    ...results.map((result) => result.program_name.length)
  );
  const resultWidth = Math.max(
    "Result".length,
    ...results.map((result) => result.result.length)
  );
  const confidenceWidth = Math.max(
    "Confidence".length,
    ...results.map((result) => (result.confidence ?? "—").length)
  );

  console.log("\nBatch summary");
  console.log(
    `${"Program".padEnd(nameWidth)}  ${"Result".padEnd(resultWidth)}  ${"Confidence".padEnd(confidenceWidth)}`
  );
  console.log(
    `${"-".repeat(nameWidth)}  ${"-".repeat(resultWidth)}  ${"-".repeat(confidenceWidth)}`
  );

  for (const result of results) {
    console.log(
      `${result.program_name.padEnd(nameWidth)}  ${result.result.padEnd(resultWidth)}  ${(result.confidence ?? "—").padEnd(confidenceWidth)}`
    );
    if (result.error) {
      console.log(`  error: ${result.error}`);
    }
  }

  const changed = results.filter((result) => result.result === "changed").length;
  const noChange = results.filter((result) => result.result === "no change").length;
  const errors = results.filter((result) => result.result === "error").length;

  console.log(
    `\nTotals: ${changed} changed, ${noChange} no change, ${errors} error(s)`
  );
}

function printDiscoveryReport(
  jurisdictionName: string,
  items: DiscoveryItem[]
): void {
  console.log(`\nDiscovery report for ${jurisdictionName}`);
  console.log("=".repeat(72));

  if (items.length === 0) {
    console.log("No missing programs identified.");
    return;
  }

  items.forEach((item, index) => {
    console.log(`\n${index + 1}. ${item.name}`);
    console.log(`   Description: ${item.description}`);
    console.log(`   Why missing: ${item.why_missing}`);
    console.log(`   Source: ${item.source_url}`);
  });

  console.log(`\n${items.length} potential missing program(s) found.`);
  console.log("No database changes were made — review these manually.");
}

async function runDiscoverMode(
  client: Client,
  jurisdiction: string
): Promise<void> {
  const { jurisdiction_name, program_names } =
    await fetchProgramNamesForJurisdiction(client, jurisdiction);

  console.log(
    `Discovery mode for ${jurisdiction_name} (${program_names.length} program(s) on file)`
  );
  console.log("Calling Claude...");

  const items = await callClaudeForDiscovery(
    buildDiscoveryPrompt(jurisdiction_name, jurisdiction, program_names)
  );

  printDiscoveryReport(jurisdiction_name, items);
}

async function insertOnboardedProgram(
  client: Client,
  jurisdiction: { id: string; name: string; abbreviation: string },
  slug: string,
  programName: string,
  allowedCategories: Set<string>,
  agent: OnboardResponse
): Promise<{
  programId: string;
  versionId: string;
  category: string;
  categoryReviewNote: string | null;
  confidence: string;
  citationCount: number;
}> {
  let category = agent.category;
  let categoryReviewNote = agent.category_review_note;
  if (!category || !allowedCategories.has(category)) {
    categoryReviewNote =
      categoryReviewNote ||
      `Agent could not map to an existing category (suggested: ${agent.category ?? "none"}). Needs human categorization.`;
    category = CATEGORY_FALLBACK_SLUG;
  }

  const unverifiedBlock =
    agent.unverified.length > 0
      ? `Unverified at onboarding (needs human confirmation):\n${agent.unverified
          .map((item) => `- ${item}`)
          .join("\n")}`
      : null;
  const nicheNotes =
    [agent.niche_notes, unverifiedBlock].filter(Boolean).join("\n\n") || null;

  // Cannot claim high confidence when material details are unverified.
  const confidence =
    agent.unverified.length > 0 ? "needs_double_verification" : agent.confidence;

  const effectiveStart = new Date().toISOString().slice(0, 10);

  await client.query("BEGIN");
  try {
    const programResult = await client.query<{ id: string }>(
      `
      INSERT INTO programs (
        jurisdiction_id,
        name,
        slug,
        technology,
        summary,
        secondary_context,
        is_interconnection_or_market_rule,
        category,
        category_review_note
      ) VALUES (
        $1, $2, $3, $4::technology_type[], $5, $6, $7, $8, $9
      )
      RETURNING id
      `,
      [
        jurisdiction.id,
        programName,
        slug,
        agent.technology,
        agent.summary || null,
        agent.secondary_context,
        agent.is_interconnection_or_market_rule,
        category,
        categoryReviewNote,
      ]
    );
    const programId = programResult.rows[0].id;

    const versionResult = await client.query<{ id: string }>(
      `
      INSERT INTO program_versions (
        program_id,
        effective_start,
        effective_end,
        status,
        terms,
        value_summary,
        niche_notes,
        change_reason,
        created_by,
        review_status,
        confidence_flag,
        conflict_notes
      ) VALUES (
        $1, $2, NULL, 'proposed', $3, $4, $5, $6, 'agent', 'pending_review', $7, $8
      )
      RETURNING id
      `,
      [
        programId,
        effectiveStart,
        JSON.stringify(normalizeTerms(agent.terms)),
        agent.value_summary,
        nicheNotes,
        "Initial onboarding of a new program by agent.",
        confidence,
        agent.conflict_notes,
      ]
    );
    const versionId = versionResult.rows[0].id;

    for (const citation of agent.citations) {
      const sourceType = normalizeSourceType(citation.source_type);
      const reliabilityTier = reliabilityTierForSourceType(sourceType);
      await client.query(
        `
        INSERT INTO citations (
          program_version_id,
          source_type,
          reliability_tier,
          title,
          url,
          accessed_date
        ) VALUES (
          $1, $2::source_type_enum, $3::reliability_tier_enum, $4, $5, CURRENT_DATE
        )
        `,
        [versionId, sourceType, reliabilityTier, citation.title, citation.url]
      );
    }

    await client.query("COMMIT");

    return {
      programId,
      versionId,
      category,
      categoryReviewNote,
      confidence,
      citationCount: agent.citations.length,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

function printOnboardSummary(
  programName: string,
  slug: string,
  jurisdictionName: string,
  agent: OnboardResponse,
  result: {
    programId: string;
    versionId: string;
    category: string;
    categoryReviewNote: string | null;
    confidence: string;
    citationCount: number;
  }
): void {
  console.log("\nOnboarding summary");
  console.log("=".repeat(72));
  console.log(`Program:      ${programName}`);
  console.log(`Slug:         ${slug}`);
  console.log(`Jurisdiction: ${jurisdictionName}`);
  console.log(
    `Category:     ${result.category}${result.categoryReviewNote ? " (needs review)" : ""}`
  );
  if (result.categoryReviewNote) {
    console.log(`  category note: ${result.categoryReviewNote}`);
  }
  console.log(
    `Technology:   ${agent.technology.length > 0 ? agent.technology.join(", ") : "—"}`
  );
  console.log(
    `Rule type:    ${agent.is_interconnection_or_market_rule ? "interconnection/market rule" : "incentive"}`
  );
  console.log(`Confidence:   ${result.confidence}`);
  console.log(`Value:        ${agent.value_summary}`);
  console.log(`Citations:    ${result.citationCount}`);
  agent.citations.forEach((citation, index) => {
    console.log(
      `  ${index + 1}. ${citation.title} (${normalizeSourceType(citation.source_type)})`
    );
    console.log(`     ${citation.url}`);
  });

  if (agent.unverified.length > 0) {
    console.log(`Unverified (${agent.unverified.length}) — flagged for review:`);
    agent.unverified.forEach((item) => console.log(`  - ${item}`));
  } else {
    console.log("Unverified:   none flagged");
  }

  console.log(`\nInserted program ${result.programId}`);
  console.log(`Inserted draft version ${result.versionId} (pending_review)`);
  console.log(
    "Landed in the review queue for a human to review — nothing was auto-published."
  );
}

async function runOnboardMode(
  client: Client,
  programName: string,
  jurisdiction: string
): Promise<void> {
  const jurisdictionRow = await findJurisdiction(client, jurisdiction);
  if (!jurisdictionRow) {
    throw new Error(
      `Jurisdiction "${jurisdiction}" not found in the database. ` +
        "Add it to the jurisdictions table first, then re-run onboarding."
    );
  }

  const slug = buildSlug(programName, jurisdictionRow.abbreviation);

  const closeMatch = await findCloseProgramMatch(
    client,
    jurisdictionRow.id,
    programName,
    slug
  );
  if (closeMatch) {
    throw new Error(
      `A similar program already exists in ${jurisdictionRow.name}: ` +
        `"${closeMatch.name}" (${closeMatch.slug}) [${closeMatch.reason}]. ` +
        "Aborting to avoid a duplicate — use check mode to update it, or rename if this is genuinely different."
    );
  }

  const categories = await fetchCategories(client);
  const allowedCategories = new Set(categories.map((category) => category.slug));

  console.log(
    `Onboarding new program "${programName}" for ${jurisdictionRow.name} (slug: ${slug})`
  );
  console.log("Calling Claude...");

  const agent = await callClaudeForOnboard(
    buildOnboardPrompt(
      programName,
      jurisdictionRow.name,
      jurisdictionRow.abbreviation,
      categories
    )
  );

  console.log("Claude response: researched program");

  const result = await insertOnboardedProgram(
    client,
    jurisdictionRow,
    slug,
    programName,
    allowedCategories,
    agent
  );

  printOnboardSummary(programName, slug, jurisdictionRow.name, agent, result);
}

async function main() {
  const cli = parseCliArgs(process.argv);
  requireEnv();

  const client = new Client({ connectionString: process.env.AGENT_DATABASE_URL });
  await client.connect();
  await client.query("SET ROLE incentive_agent;");

  try {
    if (cli.mode === "single") {
      await runSingleProgramCheck(client, cli.slug);
      return;
    }

    if (cli.mode === "discover") {
      await runDiscoverMode(client, cli.jurisdiction);
      return;
    }

    if (cli.mode === "onboard") {
      await runOnboardMode(client, cli.programName, cli.jurisdiction);
      return;
    }

    const programs =
      cli.mode === "batch-all"
        ? await fetchActiveProgramSlugs(client)
        : await fetchActiveProgramSlugs(client, cli.jurisdiction);

    if (cli.mode === "batch-jurisdiction" && programs.length === 0) {
      throw new Error(
        `No active programs found for jurisdiction "${cli.jurisdiction}".`
      );
    }

    const results = await runBatchChecks(client, programs);
    printBatchSummary(results);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  const message =
    err instanceof Error ? err.message : "An unexpected error occurred.";
  console.error(`Error: ${message}`);
  process.exit(1);
});
