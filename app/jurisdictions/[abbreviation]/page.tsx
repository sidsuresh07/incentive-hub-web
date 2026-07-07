"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ProgramCard } from "@/components/program/ProgramCard";
import { SectionLabel } from "@/components/SectionLabel";
import { isRecentlyChanged } from "@/lib/program-format";
import type { ProgramHierarchyRow, ProgramTerms } from "@/lib/program-types";
import { supabase } from "@/lib/supabase";

type ProgramVersionSummary = {
  effective_start: string;
  effective_end: string | null;
  terms: ProgramTerms | null;
};

type Program = {
  id: string;
  name: string;
  slug: string;
  category: string;
  technology: string[];
  parent_program_id: string | null;
  program_categories: { label: string } | null;
  program_versions: ProgramVersionSummary[];
};

type JurisdictionRow = {
  id: string;
  name: string;
  abbreviation: string;
  level: string;
};

type FetchError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  extra?: string;
};

const TECHNOLOGY_OPTIONS = [
  { value: "solar", label: "Solar" },
  { value: "wind", label: "Wind" },
  { value: "storage", label: "Storage" },
] as const;

function currentVersionOf(program: Program): ProgramVersionSummary | undefined {
  return program.program_versions?.find(
    (version) => version.effective_end === null
  );
}

function FilterCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-gray-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
      />
      {label}
    </label>
  );
}

export default function JurisdictionPage() {
  const params = useParams<{ abbreviation: string }>();
  const abbreviation = (params.abbreviation ?? "").toUpperCase();

  const [jurisdiction, setJurisdiction] = useState<JurisdictionRow | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [hierarchyRows, setHierarchyRows] = useState<ProgramHierarchyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedTechnologies, setSelectedTechnologies] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    async function fetchData() {
      try {
        const jurisdictionResult = await supabase
          .from("jurisdictions")
          .select("id, name, abbreviation, level")
          .eq("abbreviation", abbreviation)
          .single();

        if (jurisdictionResult.error) {
          if (jurisdictionResult.error.code === "PGRST116") {
            setNotFound(true);
          } else {
            setError({
              message: jurisdictionResult.error.message,
              code: jurisdictionResult.error.code,
              details: jurisdictionResult.error.details,
              hint: jurisdictionResult.error.hint,
            });
          }
          return;
        }

        const jur = jurisdictionResult.data as unknown as JurisdictionRow;

        const [programsResult, hierarchyResult] = await Promise.all([
          // Published programs (top-level + modules) for this jurisdiction. The
          // !inner join drops programs with no approved/auto_published current
          // version and narrows the embedded array to that version.
          supabase
            .from("programs")
            .select(
              `
              id,
              name,
              slug,
              category,
              technology,
              parent_program_id,
              program_categories ( label ),
              program_versions!inner ( effective_start, effective_end, terms )
            `
            )
            .eq("jurisdiction_id", jur.id)
            .eq("program_versions.status", "active")
            .is("program_versions.effective_end", null)
            .in("program_versions.review_status", [
              "approved",
              "auto_published",
            ]),
          supabase.from("program_hierarchy").select("*"),
        ]);

        if (programsResult.error) {
          setError({
            message: programsResult.error.message,
            code: programsResult.error.code,
            details: programsResult.error.details,
            hint: programsResult.error.hint,
          });
          return;
        }
        if (hierarchyResult.error) {
          setError({
            message: hierarchyResult.error.message,
            code: hierarchyResult.error.code,
            details: hierarchyResult.error.details,
            hint: hierarchyResult.error.hint,
          });
          return;
        }

        setJurisdiction(jur);
        setPrograms((programsResult.data as unknown as Program[]) ?? []);
        setHierarchyRows(
          (hierarchyResult.data as unknown as ProgramHierarchyRow[]) ?? []
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

    if (abbreviation) {
      fetchData();
    }
  }, [abbreviation]);

  const programsById = useMemo(() => {
    const map = new Map<string, Program>();
    for (const program of programs) {
      map.set(program.id, program);
    }
    return map;
  }, [programs]);

  const childCountByParent = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of hierarchyRows) {
      if (!row.child_id || !programsById.has(row.child_id)) {
        continue;
      }
      map.set(row.parent_id, (map.get(row.parent_id) ?? 0) + 1);
    }
    return map;
  }, [hierarchyRows, programsById]);

  const topLevelPrograms = useMemo(
    () => programs.filter((program) => !program.parent_program_id),
    [programs]
  );

  const filteredPrograms = useMemo(() => {
    if (selectedTechnologies.size === 0) {
      return topLevelPrograms;
    }
    return topLevelPrograms.filter((program) =>
      program.technology.some((tech) => selectedTechnologies.has(tech))
    );
  }, [topLevelPrograms, selectedTechnologies]);

  // Group the filtered top-level programs into category sections.
  const categorySections = useMemo(() => {
    const groups = new Map<
      string,
      { slug: string; label: string; programs: Program[] }
    >();
    for (const program of filteredPrograms) {
      const label = program.program_categories?.label ?? program.category;
      const existing = groups.get(program.category);
      if (existing) {
        existing.programs.push(program);
      } else {
        groups.set(program.category, {
          slug: program.category,
          label,
          programs: [program],
        });
      }
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        programs: [...group.programs].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredPrograms]);

  function toggleTechnology(value: string) {
    setSelectedTechnologies((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Loading</SectionLabel>
          <p className="text-lg text-gray-600">Fetching programs…</p>
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Not Found</SectionLabel>
          <p className="text-lg text-gray-600">No jurisdiction with this code.</p>
          <Link
            href="/"
            className="mt-6 inline-block font-heading text-sm font-bold text-primary hover:underline"
          >
            ← All jurisdictions
          </Link>
        </main>
      </div>
    );
  }

  if (error || !jurisdiction) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Error</SectionLabel>
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <p className="font-heading text-lg font-bold text-red-600">
              Couldn&apos;t load this jurisdiction
            </p>
            <p className="mt-2 text-gray-600">
              {error?.message ?? "Failed to load jurisdiction"}
            </p>
            {error?.code && (
              <p className="mt-2 text-sm text-gray-500">Code: {error.code}</p>
            )}
            {error?.details && (
              <p className="mt-1 text-sm text-gray-500">
                Details: {error.details}
              </p>
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
      <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
        <Link
          href="/"
          className="mb-8 inline-block font-heading text-sm font-bold text-primary hover:underline"
        >
          ← All jurisdictions
        </Link>

        <header className="mb-12">
          <SectionLabel>
            {jurisdiction.level === "federal" ? "Federal" : "State"}
          </SectionLabel>
          <h1 className="font-heading text-4xl font-bold text-heading sm:text-5xl">
            {jurisdiction.name}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            {topLevelPrograms.length} program
            {topLevelPrograms.length === 1 ? "" : "s"}, organized by category.
          </p>
        </header>

        <div className="mb-12 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <p className="mb-4 font-heading text-sm font-bold text-heading">
            Refine by technology
          </p>
          <div className="flex flex-wrap gap-6">
            {TECHNOLOGY_OPTIONS.map((technology) => (
              <FilterCheckbox
                key={technology.value}
                label={technology.label}
                checked={selectedTechnologies.has(technology.value)}
                onChange={() => toggleTechnology(technology.value)}
              />
            ))}
          </div>
        </div>

        {categorySections.length === 0 ? (
          <div className="rounded-2xl bg-white p-12 text-center shadow-lg">
            <p className="text-lg text-gray-600">
              {topLevelPrograms.length === 0
                ? "No programs in this jurisdiction yet."
                : "No programs match this technology filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-16">
            {categorySections.map((section) => (
              <section key={section.slug}>
                <SectionLabel>{section.label}</SectionLabel>
                <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                  {section.programs.map((program) => {
                    const currentVersion = currentVersionOf(program);
                    return (
                      <ProgramCard
                        key={program.id}
                        name={program.name}
                        slug={program.slug}
                        categoryLabel={
                          program.program_categories?.label ?? program.category
                        }
                        recentlyChanged={
                          currentVersion
                            ? isRecentlyChanged(currentVersion.effective_start)
                            : false
                        }
                        isStub={currentVersion?.terms?.stub === true}
                        childCount={childCountByParent.get(program.id) ?? 0}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
