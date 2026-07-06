#!/usr/bin/env tsx
/**
 * Agent check: compare a program's published terms against the web.
 *
 * Usage: npx tsx scripts/agent/check-program.ts <program-slug>
 *        npm run agent:check -- ma-smart-3-0
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

function parseAgentJson(text: string): AgentCheckResponse {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse error";
    throw new Error(
      `Failed to parse Claude response as JSON: ${message}\n\nRaw text:\n${text}`
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
  }>(
    `
    SELECT
      p.id AS program_id,
      p.jurisdiction_id,
      p.name AS program_name,
      j.name AS jurisdiction_name,
      p.slug,
      pv.id AS version_id,
      pv.effective_start,
      pv.terms,
      pv.value_summary
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
    citations: citationsResult.rows,
  };
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

Existing citation URL(s) to check first:
${citationList}

Instructions:
1. Use web search to determine whether anything about this program's terms has MATERIALLY changed since ${current.effective_start}.
2. Prioritize checking the same official source URL(s) listed above first.
3. Only search more broadly if those sources are stale, unavailable, or inconclusive.
4. If genuinely nothing has changed, say so clearly — do NOT invent a change to seem useful.
5. Only set changed=true for material changes to incentive value, eligibility, status, or effective rules (not trivial wording).

Respond with ONLY a JSON object (no markdown, no preamble, no code fences) in exactly this shape:
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
- new_terms must match the existing structure when changed=true: incentive_type, value, eligibility, stacking_notes, extra
- If changed is false: new_value_summary, new_terms, and citation fields must be null; put a one-sentence summary of what you verified in change_reason
- If changed is true: new_value_summary and new_terms are required; change_reason must explain the material change
- citation_source_type must be one of: puc_docket, agency_filing, statute, dsire, nrel, law_firm_alert, trade_press, other
- Use needs_double_verification if sources conflict, dates are ambiguous, or you are uncertain`;
}

async function callClaude(prompt: string): Promise<AgentCheckResponse> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  const text = extractTextFromMessage(response.content);
  if (!text) {
    throw new Error("Claude returned no text content to parse.");
  }

  return parseAgentJson(text);
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
      JSON.stringify(agent.new_terms),
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

async function main() {
  const slug = process.argv[2];

  if (!slug) {
    console.error("Usage: npx tsx scripts/agent/check-program.ts <program-slug>");
    process.exit(1);
  }

  requireEnv();

  const client = new Client({ connectionString: process.env.AGENT_DATABASE_URL });
  await client.connect();
  await client.query("SET ROLE incentive_agent;");

  try {
    const current = await fetchCurrentVersion(client, slug);

    if (!current) {
      throw new Error(
        `No active published version found for slug "${slug}" ` +
          `(effective_end IS NULL, review_status approved/auto_published, status active).`
      );
    }

    console.log(`Fetched current version for ${current.program_name}`);

    console.log("Calling Claude...");
    const agentResponse = await callClaude(buildPrompt(current));

    if (!agentResponse.changed) {
      console.log("Claude response: not changed");
      await insertNoChangeCheck(client, current, agentResponse);
      console.log("Logged source check, no change");
      return;
    }

    console.log("Claude response: changed");
    const newVersionId = await insertPendingDraft(client, current, agentResponse);
    console.log(`Inserted draft version (id: ${newVersionId}, pending_review)`);
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
