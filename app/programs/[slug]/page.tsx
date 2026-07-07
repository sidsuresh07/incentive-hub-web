"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SectionLabel } from "@/components/SectionLabel";
import { HierarchySidebar } from "@/components/program/HierarchySidebar";
import { ResourcesSection } from "@/components/program/ResourcesSection";
import { CitationCard, TheRecord } from "@/components/program/TheRecord";
import { TermsDisplay } from "@/components/program/TermsDisplay";
import { RecentlyChangedIndicator } from "@/components/ui/RecentlyChangedIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StubBadge } from "@/components/ui/StubBadge";
import { VerificationCallout } from "@/components/ui/VerificationCallout";
import { formatDate, formatLabel, isRecentlyChanged } from "@/lib/program-format";
import {
  PUBLISHED_REVIEW_STATUSES,
  type ProgramDetail,
  type ProgramHierarchy,
  type ProgramHierarchyRow,
  type ProgramResource,
  type ProgramVersion,
} from "@/lib/program-types";

function isPublishedVersion(version: ProgramVersion): boolean {
  return PUBLISHED_REVIEW_STATUSES.includes(version.review_status);
}
import { supabase } from "@/lib/supabase";

type FetchError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  extra?: string;
};

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

function CitationsSection({ versions }: { versions: ProgramVersion[] }) {
  const versionsWithCitations = versions.filter(
    (version) => version.citations?.length > 0
  );

  if (versionsWithCitations.length === 0) {
    return <p className="text-gray-600">No sources on file.</p>;
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
              <CitationCard
                key={citation.id}
                title={citation.title}
                url={citation.url}
                sourceType={citation.source_type}
                reliabilityTier={citation.reliability_tier}
              />
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
  const [hierarchy, setHierarchy] = useState<ProgramHierarchy | null>(null);
  const [resources, setResources] = useState<ProgramResource[]>([]);
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
            parent_program_id,
            jurisdictions ( name, abbreviation ),
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
              review_status,
              status,
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
          return;
        }

        const prog = data as unknown as ProgramDetail;

        // A program is only public once it has a current version that a human
        // has approved (or that was auto-published). A program whose only
        // current version is pending_review or rejected stays hidden.
        const hasPublishedCurrentVersion = prog.program_versions?.some(
          (version) =>
            version.effective_end === null &&
            version.status === "active" &&
            isPublishedVersion(version)
        );
        if (!hasPublishedCurrentVersion) {
          setNotFound(true);
          return;
        }

        // Only the approved/auto-published lineage is shown publicly — pending
        // or rejected drafts never surface in the terms, record, or citations.
        prog.program_versions = (prog.program_versions ?? []).filter(
          isPublishedVersion
        );

        // Resolve hierarchy (one level: top-level parent + its children) and
        // internal resources for this specific program.
        const topLevelParentId = prog.parent_program_id ?? prog.id;
        const [hierarchyResult, resourcesResult] = await Promise.all([
          supabase
            .from("program_hierarchy")
            .select("*")
            .eq("parent_id", topLevelParentId),
          supabase
            .from("program_resources")
            .select("id, program_id, resource_type, title, url, notes")
            .eq("program_id", prog.id)
            .order("created_at", { ascending: true }),
        ]);

        const rows =
          (hierarchyResult.data as unknown as ProgramHierarchyRow[]) ?? [];
        const childLinks = rows
          .filter((row) => row.child_id)
          .map((row) => ({
            id: row.child_id as string,
            name: row.child_name as string,
            slug: row.child_slug as string,
          }));
        const parentRow = rows[0];
        const resolvedHierarchy: ProgramHierarchy =
          prog.parent_program_id && parentRow
            ? {
                parent: {
                  id: parentRow.parent_id,
                  name: parentRow.parent_name,
                  slug: parentRow.parent_slug,
                },
                children: childLinks,
              }
            : { parent: null, children: childLinks };

        setProgram(prog);
        setHierarchy(resolvedHierarchy);
        setResources(
          (resourcesResult.data as unknown as ProgramResource[]) ?? []
        );
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

  const isStub = currentVersion?.terms?.stub === true;

  const isModule = Boolean(program?.parent_program_id);
  const childCount = hierarchy?.children.length ?? 0;
  const isParentWithChildren = !isModule && childCount > 0;

  const showSidebar = Boolean(hierarchy && (isModule || childCount > 0));

  // Resources appear on structurally complex programs (a parent with modules,
  // or a module itself) even when empty; standalone simple programs only show
  // the section once they actually have resources attached.
  const showResources =
    isParentWithChildren || isModule || resources.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Loading</SectionLabel>
          <p className="text-lg text-gray-600">Fetching program…</p>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-4xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Not Found</SectionLabel>
          <p className="text-lg text-gray-600">
            No program with this identifier.
          </p>
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
            <p className="font-heading text-lg font-bold text-red-600">
              Couldn&apos;t load program
            </p>
            <p className="mt-2 text-gray-600">
              {error?.message ?? "Failed to load program"}
            </p>
            {error?.code && (
              <p className="mt-2 text-sm text-gray-500">Code: {error.code}</p>
            )}
            {error?.details && (
              <p className="mt-1 text-sm text-gray-500">Details: {error.details}</p>
            )}
            {error?.hint && (
              <p className="mt-1 text-sm text-gray-500">Hint: {error.hint}</p>
            )}
            {error?.extra && (
              <pre className="mt-4 whitespace-pre-wrap text-sm text-gray-500">
                {error.extra}
              </pre>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <main
        className={`mx-auto ${
          showSidebar ? "max-w-6xl" : "max-w-4xl"
        } px-8 py-16 sm:px-12 sm:py-24`}
      >
        <Link
          href="/"
          className="mb-8 inline-block font-heading text-sm font-bold text-primary hover:underline"
        >
          ← Back to Programs
        </Link>

        <div className={showSidebar ? "lg:flex lg:gap-12" : ""}>
          {showSidebar && hierarchy && (
            <div className="mb-10 lg:mb-0 lg:w-72 lg:shrink-0">
              <HierarchySidebar hierarchy={hierarchy} currentSlug={program.slug} />
            </div>
          )}

          <div className={showSidebar ? "min-w-0 lg:flex-1" : ""}>
            <header className="mb-16">
              <SectionLabel>
                {program.program_categories?.label ?? "Program"}
              </SectionLabel>
              <h1 className="font-heading text-4xl font-bold text-heading sm:text-5xl">
                {program.name}
              </h1>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {program.jurisdictions?.name &&
                  (program.jurisdictions.abbreviation ? (
                    <Link
                      href={`/jurisdictions/${program.jurisdictions.abbreviation}`}
                      className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      {program.jurisdictions.name}
                    </Link>
                  ) : (
                    <span className="rounded-lg bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                      {program.jurisdictions.name}
                    </span>
                  ))}
                {program.technology.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-lg bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600"
                  >
                    {formatLabel(tech)}
                  </span>
                ))}
                <StatusBadge status={program.status} />
                {isStub && <StubBadge />}
                {recentlyChanged && <RecentlyChangedIndicator />}
              </div>
            </header>

            {currentVersion && (
              <section className="mb-16">
                <SectionLabel>Current Terms</SectionLabel>
                {isStub && (
                  <div className="mb-6 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-5">
                    <p className="font-heading text-sm font-bold text-gray-600">
                      This program is a stub — not yet fully researched
                    </p>
                    <p className="mt-2 text-sm text-gray-500">
                      The details below are preliminary and incomplete. Treat
                      them as a placeholder until this entry has been fully
                      researched.
                    </p>
                  </div>
                )}
                {currentVersionNeedsVerification && (
                  <VerificationCallout title="Part of this information has not been fully verified — see notes below">
                    {currentVersion.conflict_notes && (
                      <p className="whitespace-pre-wrap">
                        {currentVersion.conflict_notes}
                      </p>
                    )}
                  </VerificationCallout>
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

            {showResources && (
              <section className="mb-16">
                <SectionLabel>Internal Resources</SectionLabel>
                <ResourcesSection resources={resources} />
              </section>
            )}

            {sortedVersions.length > 0 && (
              <section className="mb-16">
                <SectionLabel>The Record</SectionLabel>
                <TheRecord versions={sortedVersions} />
              </section>
            )}

            <section>
              <SectionLabel>Citations</SectionLabel>
              <CitationsSection versions={sortedVersions} />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
