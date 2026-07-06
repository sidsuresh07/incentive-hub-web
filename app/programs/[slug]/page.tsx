"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SectionLabel } from "@/components/SectionLabel";
import { TermsDisplay } from "@/components/program/TermsDisplay";
import {
  formatDate,
  formatLabel,
  isRecentlyChanged,
  STATUS_STYLES,
} from "@/lib/program-format";
import type { ProgramDetail, ProgramVersion } from "@/lib/program-types";
import { supabase } from "@/lib/supabase";

type FetchError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  extra?: string;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {formatLabel(status)}
    </span>
  );
}

function CollapsibleContext({ content }: { content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="font-heading text-sm font-bold text-primary hover:text-indigo-800"
      >
        {open ? "Hide detail" : "Show more detail"}
      </button>
      {open && (
        <div className="mt-6 whitespace-pre-wrap text-gray-600">{content}</div>
      )}
    </div>
  );
}

function VerificationBanner({ conflictNotes }: { conflictNotes?: string | null }) {
  return (
    <div className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 px-6 py-5 text-amber-950">
      <p className="font-heading text-sm font-bold">
        Part of this information has not been fully verified — see notes below
      </p>
      {conflictNotes && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-amber-900">
          {conflictNotes}
        </p>
      )}
    </div>
  );
}

function VersionTimeline({ versions }: { versions: ProgramVersion[] }) {
  return (
    <ol className="relative space-y-0 border-l-2 border-accent/40 pl-8">
      {versions.map((version, index) => (
        <li key={version.id} className="relative pb-10 last:pb-0">
          <span className="absolute -left-[2.35rem] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent ring-4 ring-white" />
          <div
            className={`rounded-2xl border p-6 ${
              index === 0
                ? "border-primary/20 bg-primary/5"
                : "border-gray-100 bg-gray-50"
            }`}
          >
            <p className="font-heading text-sm font-bold text-heading">
              {formatDate(version.effective_start)} —{" "}
              {version.effective_end
                ? formatDate(version.effective_end)
                : "Present"}
            </p>
            <p className="mt-2 font-medium text-gray-600">
              {version.value_summary}
            </p>
            {version.change_reason && (
              <p className="mt-2 text-sm text-gray-500">
                {version.change_reason}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CitationsSection({ versions }: { versions: ProgramVersion[] }) {
  const versionsWithCitations = versions.filter(
    (version) => version.citations?.length > 0
  );

  if (versionsWithCitations.length === 0) {
    return (
      <p className="text-gray-600">No citations available for this program.</p>
    );
  }

  return (
    <div className="space-y-8">
      {versionsWithCitations.map((version) => (
        <div key={version.id}>
          <p className="mb-4 text-sm font-medium text-gray-500">
            Version effective {formatDate(version.effective_start)}
            {version.effective_end
              ? ` – ${formatDate(version.effective_end)}`
              : " – Present"}
          </p>
          <ul className="space-y-4">
            {version.citations.map((citation) => (
              <li
                key={citation.id}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg"
              >
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-heading font-bold text-primary hover:underline"
                >
                  {citation.title}
                </a>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-500">
                  <span>{formatLabel(citation.source_type)}</span>
                  <span>·</span>
                  <span
                    className={
                      citation.reliability_tier === "primary"
                        ? "font-medium text-green-700"
                        : ""
                    }
                  >
                    {formatLabel(citation.reliability_tier)} source
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ProgramPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchProgram() {
      try {
        const { data, error } = await supabase
          .from("programs")
          .select(
            `
            id,
            name,
            slug,
            status,
            technology,
            secondary_context,
            jurisdictions ( name ),
            program_categories ( label ),
            program_versions (
              id,
              effective_start,
              effective_end,
              terms,
              value_summary,
              change_reason,
              confidence_flag,
              conflict_notes,
              citations (
                id,
                title,
                source_type,
                reliability_tier,
                url
              )
            )
          `
          )
          .eq("slug", slug)
          .single();

        if (error) {
          if (error.code === "PGRST116") {
            setNotFound(true);
          } else {
            console.error("Supabase error:", error);
            setError({
              message: error.message,
              code: error.code,
              details: error.details,
              hint: error.hint,
            });
          }
        } else {
          setProgram(data as unknown as ProgramDetail);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        setError({
          message: err instanceof Error ? err.message : "Unknown error",
          extra:
            err instanceof Error
              ? err.stack ?? err.name
              : JSON.stringify(err, null, 2),
        });
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchProgram();
    }
  }, [slug]);

  const sortedVersions = useMemo(() => {
    if (!program?.program_versions) {
      return [];
    }
    return [...program.program_versions].sort(
      (a, b) =>
        new Date(b.effective_start).getTime() -
        new Date(a.effective_start).getTime()
    );
  }, [program]);

  const currentVersion = useMemo(
    () => sortedVersions.find((version) => version.effective_end === null),
    [sortedVersions]
  );

  const currentVersionNeedsVerification =
    currentVersion?.confidence_flag === "needs_double_verification";

  const recentlyChanged = currentVersion
    ? isRecentlyChanged(currentVersion.effective_start)
    : false;

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Loading</SectionLabel>
          <p className="text-lg text-gray-600">Loading program...</p>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Not Found</SectionLabel>
          <p className="text-lg text-gray-600">Program not found.</p>
          <Link
            href="/"
            className="mt-6 inline-block font-heading text-sm font-bold text-primary hover:underline"
          >
            ← Back to Programs
          </Link>
        </main>
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Error</SectionLabel>
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <div className="space-y-2 text-red-600">
              <p className="font-heading text-lg font-bold">
                Error: {error?.message ?? "Failed to load program"}
              </p>
              {error?.code && <p>Code: {error.code}</p>}
              {error?.details && <p>Details: {error.details}</p>}
              {error?.hint && <p>Hint: {error.hint}</p>}
              {error?.extra && (
                <pre className="whitespace-pre-wrap text-sm">{error.extra}</pre>
              )}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
        <Link
          href="/"
          className="mb-8 inline-block font-heading text-sm font-bold text-primary hover:underline"
        >
          ← Back to Programs
        </Link>

        <header className="mb-16">
          <SectionLabel>
            {program.program_categories?.label ?? "Program"}
          </SectionLabel>
          <h1 className="font-heading text-4xl font-bold text-heading sm:text-5xl">
            {program.name}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {program.jurisdictions?.name && (
              <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {program.jurisdictions.name}
              </span>
            )}
            {program.technology.map((tech) => (
              <span
                key={tech}
                className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600"
              >
                {formatLabel(tech)}
              </span>
            ))}
            <StatusBadge status={program.status} />
            {recentlyChanged && (
              <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-heading">
                Recently changed
              </span>
            )}
          </div>
        </header>

        {currentVersion && (
          <section className="mb-16">
            <SectionLabel>Current Terms</SectionLabel>
            {currentVersionNeedsVerification && (
              <VerificationBanner
                conflictNotes={currentVersion.conflict_notes}
              />
            )}
            <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
              <p className="font-heading text-2xl font-bold text-heading">
                {currentVersion.value_summary}
              </p>
              <div className="mt-8">
                <TermsDisplay terms={currentVersion.terms} />
              </div>
            </div>
          </section>
        )}

        {program.secondary_context && (
          <section className="mb-16">
            <SectionLabel>Additional Context</SectionLabel>
            <CollapsibleContext content={program.secondary_context} />
          </section>
        )}

        {sortedVersions.length > 0 && (
          <section className="mb-16">
            <SectionLabel>Version History</SectionLabel>
            <VersionTimeline versions={sortedVersions} />
          </section>
        )}

        <section>
          <SectionLabel>Citations</SectionLabel>
          <CitationsSection versions={sortedVersions} />
        </section>
      </main>
    </div>
  );
}
