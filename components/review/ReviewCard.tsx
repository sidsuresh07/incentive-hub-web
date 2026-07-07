"use client";

import { useState } from "react";
import { approveReviewItem, rejectReviewItem } from "@/app/review/actions";
import { CitationCard } from "@/components/program/TheRecord";
import { VerificationCallout } from "@/components/ui/VerificationCallout";
import { formatLabel } from "@/lib/program-format";
import type { ReviewQueueItem } from "@/lib/review-types";

function ConfidenceBadge({
  needsDoubleVerification,
}: {
  needsDoubleVerification: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        needsDoubleVerification
          ? "bg-amber-100 text-amber-900"
          : "bg-green-100 text-green-800"
      }`}
    >
      {needsDoubleVerification
        ? "Needs double verification"
        : "High confidence"}
    </span>
  );
}

export function ReviewCard({
  item,
  onResolved,
}: {
  item: ReviewQueueItem;
  onResolved: () => void;
}) {
  const [rejectionNote, setRejectionNote] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isLoading = acting !== null;

  async function handleApprove() {
    setActing("approve");
    setActionError(null);

    const result = await approveReviewItem(item.id);

    if (result.error) {
      setActing(null);
      setActionError(result.error);
      return;
    }

    onResolved();
  }

  async function handleReject() {
    setActing("reject");
    setActionError(null);

    const result = await rejectReviewItem(item.id, rejectionNote);

    if (result.error) {
      setActing(null);
      setActionError(result.error);
      return;
    }

    onResolved();
  }

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-heading">
            {item.program_name}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {item.jurisdiction}
            </span>
            <span className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
              {item.category}
            </span>
            <span className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
              Created by {formatLabel(item.created_by)}
            </span>
          </div>
        </div>
        <ConfidenceBadge
          needsDoubleVerification={item.needs_double_verification}
        />
      </div>

      {item.conflict_notes && (
        <div className="mt-6">
          <VerificationCallout title="Conflict notes">
            <p className="whitespace-pre-wrap">{item.conflict_notes}</p>
          </VerificationCallout>
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Current
          </p>
          <p className="mt-3 text-gray-600">
            {item.value_summary ??
              "No prior published version for this program."}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">
            Proposed
          </p>
          <p className="mt-3 font-medium text-heading">
            {item.draft_value_summary}
          </p>
        </div>
      </div>

      {item.change_reason && (
        <div className="mt-6">
          <p className="text-sm font-medium text-gray-500">Change reason</p>
          <p className="mt-2 text-gray-600">{item.change_reason}</p>
        </div>
      )}

      <div className="mt-8">
        <p className="mb-4 text-sm font-medium text-gray-500">Citations</p>
        {item.citations.length === 0 ? (
          <p className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            This draft has no cited sources. A draft cannot be verified without
            them.
          </p>
        ) : (
          <ul className="space-y-3">
            {item.citations.map((citation) => (
              <CitationCard
                key={citation.id}
                title={citation.title}
                url={citation.url}
                sourceType={citation.source_type}
                reliabilityTier={citation.reliability_tier}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 border-t border-gray-100 pt-8">
        <label
          htmlFor={`rejection-note-${item.id}`}
          className="block text-sm font-medium text-gray-500"
        >
          Rejection note (optional)
        </label>
        <input
          id={`rejection-note-${item.id}`}
          type="text"
          value={rejectionNote}
          onChange={(event) => setRejectionNote(event.target.value)}
          placeholder="Reason for rejection..."
          disabled={isLoading}
          className="mt-2 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-gray-600 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />

        {actionError && (
          <p className="mt-4 text-sm text-red-600">{actionError}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-4">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isLoading}
            className="rounded-full bg-indigo-700 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-800 disabled:opacity-50"
          >
            {acting === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={isLoading}
            className="rounded-lg border border-red-200 bg-red-50 px-6 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
          >
            {acting === "reject" ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </article>
  );
}
