"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { formatDate } from "@/lib/program-format";
import { supabase } from "@/lib/supabase";

type JurisdictionRow = {
  id: string;
  name: string;
  abbreviation: string;
  level: string;
};

type ProgramRow = {
  id: string;
  parent_program_id: string | null;
  jurisdiction_id: string;
  category: string;
};

type RecentChange = {
  id: string;
  headline: string;
  slug: string;
  published_at: string;
};

type FetchError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  extra?: string;
};

// Jurisdictions on the roadmap but not yet populated. Shown as honest,
// non-clickable "coming soon" placeholders so the roadmap isn't hidden.
const COMING_SOON = ["New York", "New Jersey", "California", "Illinois"];

function orderJurisdictions(a: JurisdictionRow, b: JurisdictionRow): number {
  // Federal first, then states alphabetically.
  if (a.level === "federal" && b.level !== "federal") return -1;
  if (b.level === "federal" && a.level !== "federal") return 1;
  return a.name.localeCompare(b.name);
}

export default function Home() {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionRow[]>([]);
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [jurisdictionsResult, programsResult, recentResult] =
          await Promise.all([
            supabase
              .from("jurisdictions")
              .select("id, name, abbreviation, level"),
            // Only count publicly published, top-level programs (see detail /
            // homepage gating): the !inner join drops programs with no
            // approved/auto_published current version.
            supabase
              .from("programs")
              .select(
                `
                id,
                parent_program_id,
                jurisdiction_id,
                category,
                program_versions!inner ( effective_end, status, review_status )
              `
              )
              .eq("program_versions.status", "active")
              .is("program_versions.effective_end", null)
              .in("program_versions.review_status", [
                "approved",
                "auto_published",
              ]),
            supabase
              .from("recently_changed")
              .select("id, headline, slug, published_at")
              .limit(5),
          ]);

        if (jurisdictionsResult.error) {
          setError({
            message: jurisdictionsResult.error.message,
            code: jurisdictionsResult.error.code,
            details: jurisdictionsResult.error.details,
            hint: jurisdictionsResult.error.hint,
          });
          return;
        }
        if (programsResult.error) {
          setError({
            message: programsResult.error.message,
            code: programsResult.error.code,
            details: programsResult.error.details,
            hint: programsResult.error.hint,
          });
          return;
        }
        if (recentResult.error) {
          setError({
            message: recentResult.error.message,
            code: recentResult.error.code,
            details: recentResult.error.details,
            hint: recentResult.error.hint,
          });
          return;
        }

        setJurisdictions(
          (jurisdictionsResult.data as unknown as JurisdictionRow[]) ?? []
        );
        setPrograms((programsResult.data as unknown as ProgramRow[]) ?? []);
        setRecentChanges(
          (recentResult.data as unknown as RecentChange[]) ?? []
        );
      } catch (err) {
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

    fetchData();
  }, []);

  const topLevelPrograms = useMemo(
    () => programs.filter((program) => !program.parent_program_id),
    [programs]
  );

  const countByJurisdiction = useMemo(() => {
    const map = new Map<string, number>();
    for (const program of topLevelPrograms) {
      map.set(
        program.jurisdiction_id,
        (map.get(program.jurisdiction_id) ?? 0) + 1
      );
    }
    return map;
  }, [topLevelPrograms]);

  const liveJurisdictions = useMemo(
    () =>
      jurisdictions
        .filter((jurisdiction) => (countByJurisdiction.get(jurisdiction.id) ?? 0) > 0)
        .sort(orderJurisdictions),
    [jurisdictions, countByJurisdiction]
  );

  const categoryCount = useMemo(
    () => new Set(topLevelPrograms.map((program) => program.category)).size,
    [topLevelPrograms]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Loading</SectionLabel>
          <p className="text-lg text-gray-600">Fetching jurisdictions…</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Error</SectionLabel>
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <p className="font-heading text-lg font-bold text-red-600">
              Couldn&apos;t load jurisdictions
            </p>
            <p className="mt-2 text-gray-600">{error.message}</p>
            {error.code && (
              <p className="mt-2 text-sm text-gray-500">Code: {error.code}</p>
            )}
            {error.details && (
              <p className="mt-1 text-sm text-gray-500">
                Details: {error.details}
              </p>
            )}
            {error.hint && (
              <p className="mt-1 text-sm text-gray-500">Hint: {error.hint}</p>
            )}
            {error.extra && (
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
      <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
        <header className="mb-12">
          <SectionLabel>Incentive Hub</SectionLabel>
          <h1 className="font-heading text-4xl font-bold text-heading sm:text-5xl">
            Browse by jurisdiction
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            Pick a jurisdiction to explore its clean-energy incentive programs,
            organized by category.
          </p>
        </header>

        {recentChanges.length > 0 && (
          <section className="mb-12">
            <SectionLabel>Recently Changed</SectionLabel>
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm">
              {recentChanges.map((change) => (
                <li key={change.id}>
                  <Link
                    href={`/programs/${change.slug}`}
                    className="flex items-baseline justify-between gap-4 px-6 py-3 transition-colors hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-700">
                      {change.headline}
                    </span>
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">
                      {formatDate(change.published_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-12">
          <div className="flex flex-wrap gap-8 rounded-2xl border border-gray-100 bg-white px-6 py-4 text-sm shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-xl font-bold text-heading">
                {liveJurisdictions.length}
              </span>
              <span className="text-gray-500">jurisdictions</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-xl font-bold text-heading">
                {topLevelPrograms.length}
              </span>
              <span className="text-gray-500">programs</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-xl font-bold text-heading">
                {categoryCount}
              </span>
              <span className="text-gray-500">categories</span>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>Jurisdictions</SectionLabel>
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {liveJurisdictions.map((jurisdiction) => {
              const count = countByJurisdiction.get(jurisdiction.id) ?? 0;
              return (
                <li key={jurisdiction.id}>
                  <Link
                    href={`/jurisdictions/${jurisdiction.abbreviation}`}
                    className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
                  >
                    <p className="text-sm font-medium uppercase tracking-wider text-primary">
                      {jurisdiction.level === "federal" ? "Federal" : "State"}
                    </p>
                    <h2 className="mt-3 font-heading text-2xl font-bold text-heading">
                      {jurisdiction.name}
                    </h2>
                    <p className="mt-4 text-gray-600">
                      {count} program{count === 1 ? "" : "s"}
                    </p>
                    <span className="mt-6 inline-block self-start font-heading text-sm font-bold text-primary">
                      Explore →
                    </span>
                  </Link>
                </li>
              );
            })}

            {COMING_SOON.map((name) => (
              <li key={name}>
                <div className="flex h-full flex-col rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
                  <p className="text-sm font-medium uppercase tracking-wider text-gray-400">
                    State
                  </p>
                  <h2 className="mt-3 font-heading text-2xl font-bold text-gray-400">
                    {name}
                  </h2>
                  <span className="mt-6 inline-block self-start rounded-full bg-gray-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-500">
                    Coming soon
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
