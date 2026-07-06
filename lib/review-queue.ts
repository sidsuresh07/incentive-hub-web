import "server-only";

import { createAdminClient } from "./supabase-admin";
import type { Citation } from "./program-types";
import {
  type PendingVersionRow,
  type ReviewActionResult,
  type ReviewQueueItem,
  type ReviewQueueResult,
  toReviewCitation,
} from "./review-types";

type CurrentVersion = {
  id: string;
  program_id: string;
  value_summary: string;
};

/**
 * Loads pending program versions for the review queue.
 *
 * Primary query (no boolean filter — only pending_review):
 *
 *   supabase
 *     .from("program_versions")
 *     .select(`
 *       id, program_id, value_summary, change_reason, confidence_flag,
 *       conflict_notes, created_by, effective_start, review_status, rejection_note,
 *       programs ( name, jurisdiction_id, category,
 *         program_categories ( label ), jurisdictions ( name ) )
 *     `)
 *     .eq("review_status", "pending_review")
 *     .order("confidence_flag", { ascending: false })
 *     .order("created_at", { ascending: true })
 *
 * `confidence_flag` ('high' | 'needs_double_verification') is used only for
 * sorting and the display badge — never as a WHERE filter.
 */
export async function fetchReviewQueue(): Promise<ReviewQueueResult> {
  try {
    const supabase = createAdminClient();

    const { data: versions, error: queueError } = await supabase
      .from("program_versions")
      .select(
        `
        id,
        program_id,
        value_summary,
        change_reason,
        confidence_flag,
        conflict_notes,
        created_by,
        effective_start,
        review_status,
        rejection_note,
        programs (
          name,
          jurisdiction_id,
          category,
          program_categories ( label ),
          jurisdictions ( name )
        )
      `
      )
      .eq("review_status", "pending_review")
      .order("confidence_flag", { ascending: false })
      .order("created_at", { ascending: true });

    if (queueError) {
      return { items: [], error: queueError.message };
    }

    const rows = (versions ?? []) as unknown as PendingVersionRow[];

    if (rows.length === 0) {
      return { items: [], error: null };
    }

    const programIds = Array.from(new Set(rows.map((row) => row.program_id)));
    const versionIds = rows.map((row) => row.id);

    const [citationsResult, currentVersionsResult] = await Promise.all([
      supabase
        .from("citations")
        .select(
          "id, title, source_type, reliability_tier, url, program_version_id"
        )
        .in("program_version_id", versionIds),
      supabase
        .from("program_versions")
        .select("id, program_id, value_summary")
        .in("program_id", programIds)
        .is("effective_end", null)
        .in("review_status", ["approved", "auto_published"]),
    ]);

    const citationsByVersion = new Map<string, ReviewQueueItem["citations"]>();
    for (const row of citationsResult.data ?? []) {
      const citation = row as Citation & { program_version_id: string };
      const existing = citationsByVersion.get(citation.program_version_id) ?? [];
      existing.push(toReviewCitation(citation));
      citationsByVersion.set(citation.program_version_id, existing);
    }

    const currentByProgram = new Map<string, CurrentVersion>();
    for (const version of (currentVersionsResult.data ?? []) as CurrentVersion[]) {
      currentByProgram.set(version.program_id, version);
    }

    const items: ReviewQueueItem[] = rows.map((row) => {
      const program = Array.isArray(row.programs)
        ? row.programs[0]
        : row.programs;
      const categoryLabel = Array.isArray(program?.program_categories)
        ? program.program_categories[0]?.label
        : program?.program_categories?.label;
      const jurisdictionName = Array.isArray(program?.jurisdictions)
        ? program.jurisdictions[0]?.name
        : program?.jurisdictions?.name;
      const currentVersion = currentByProgram.get(row.program_id) ?? null;

      return {
        id: row.id,
        program_id: row.program_id,
        program_name: program?.name ?? "Unknown program",
        jurisdiction: jurisdictionName ?? "—",
        jurisdiction_id: program?.jurisdiction_id ?? "",
        category: categoryLabel ?? program?.category ?? "—",
        created_by: row.created_by,
        review_status: "pending",
        needs_double_verification:
          row.confidence_flag === "needs_double_verification",
        value_summary:
          currentVersion && currentVersion.id !== row.id
            ? currentVersion.value_summary
            : null,
        draft_value_summary: row.value_summary,
        change_reason: row.change_reason,
        conflict_notes: row.conflict_notes,
        citations: citationsByVersion.get(row.id) ?? [],
        rejection_note: row.rejection_note,
        effective_start: row.effective_start,
      };
    });

    return { items, error: null };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : "Failed to load review queue",
    };
  }
}

/**
 * Approves a pending program version using the service-role client (bypasses RLS).
 * Supersedes the prior active version and writes a changelog entry.
 */
export async function approveReviewItem(id: string): Promise<ReviewActionResult> {
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: draft, error: draftError } = await supabase
      .from("program_versions")
      .select(
        `
        id,
        program_id,
        effective_start,
        change_reason,
        review_status,
        programs ( name, jurisdiction_id )
      `
      )
      .eq("id", id)
      .single();

    if (draftError) {
      return { error: draftError.message };
    }

    if (draft.review_status !== "pending_review") {
      return { error: "This item is no longer pending review." };
    }

    const program = draft.programs as unknown as {
      name: string;
      jurisdiction_id: string;
    };

    const { data: priorVersions, error: priorFetchError } = await supabase
      .from("program_versions")
      .select("id")
      .eq("program_id", draft.program_id)
      .is("effective_end", null)
      .in("review_status", ["approved", "auto_published"])
      .neq("id", id);

    if (priorFetchError) {
      return { error: priorFetchError.message };
    }

    for (const prior of priorVersions ?? []) {
      const { error } = await supabase
        .from("program_versions")
        .update({
          effective_end: draft.effective_start,
          status: "superseded",
          superseded_by_version_id: id,
        })
        .eq("id", prior.id);

      if (error) {
        return { error: error.message };
      }
    }

    const { error: approveError } = await supabase
      .from("program_versions")
      .update({
        review_status: "approved",
        published_at: now,
        status: "active",
      })
      .eq("id", id);

    if (approveError) {
      return { error: approveError.message };
    }

    const { error: changelogError } = await supabase
      .from("changelog_entries")
      .insert({
        program_version_id: id,
        jurisdiction_id: program.jurisdiction_id,
        event_type: "terms_changed",
        headline: `${program.name} updated`,
        detail: draft.change_reason,
        published_at: now,
      });

    if (changelogError) {
      return { error: changelogError.message };
    }

    return { error: null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to approve item",
    };
  }
}

/**
 * Rejects a pending program version and optionally saves a rejection note.
 * Uses the service-role client (bypasses RLS).
 */
export async function rejectReviewItem(
  id: string,
  note?: string
): Promise<ReviewActionResult> {
  try {
    const supabase = createAdminClient();

    const { data: draft, error: draftError } = await supabase
      .from("program_versions")
      .select("id, review_status")
      .eq("id", id)
      .single();

    if (draftError) {
      return { error: draftError.message };
    }

    if (draft.review_status !== "pending_review") {
      return { error: "This item is no longer pending review." };
    }

    const update: Record<string, string> = {
      review_status: "rejected",
    };

    if (note?.trim()) {
      update.rejection_note = note.trim();
    }

    const { error } = await supabase
      .from("program_versions")
      .update(update)
      .eq("id", id);

    if (error) {
      return { error: error.message };
    }

    return { error: null };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to reject item",
    };
  }
}
