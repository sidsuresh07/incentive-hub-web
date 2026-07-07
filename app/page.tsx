"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { RecentlyChangedIndicator } from "@/components/ui/RecentlyChangedIndicator";
import { isRecentlyChanged } from "@/lib/program-format";
import { supabase } from "@/lib/supabase";

type ProgramVersionSummary = {
  effective_start: string;
  effective_end: string | null;
};

type Program = {
  id: string;
  name: string;
  slug: string;
  category: string;
  technology: string[];
  program_categories: { label: string } | null;
  jurisdictions: { name: string } | null;
  program_versions: ProgramVersionSummary[];
};

type FetchError = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  extra?: string;
};

type CategoryOption = {
  slug: string;
  label: string;
};

const TECHNOLOGY_OPTIONS = [
  { value: "solar", label: "Solar" },
  { value: "wind", label: "Wind" },
  { value: "storage", label: "Storage" },
] as const;

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-4 font-heading text-sm font-bold text-heading">
        {title}
      </legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
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

function toggleSelection(
  current: Set<string>,
  value: string,
  setter: (next: Set<string>) => void
) {
  const next = new Set(current);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  setter(next);
}

export default function Home() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FetchError | null>(null);
  const [selectedJurisdictions, setSelectedJurisdictions] = useState<
    Set<string>
  >(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [selectedTechnologies, setSelectedTechnologies] = useState<
    Set<string>
  >(new Set());

  useEffect(() => {
    async function fetchPrograms() {
      try {
        const { data, error } = await supabase
          .from("programs")
          .select(
            `
            id,
            name,
            slug,
            category,
            technology,
            program_categories ( label ),
            jurisdictions ( name ),
            program_versions ( effective_start, effective_end )
          `
          );

        if (error) {
          console.error("Supabase error:", error);
          setError({
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          });
        } else {
          setPrograms((data as unknown as Program[]) ?? []);
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

    fetchPrograms();
  }, []);

  const jurisdictionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          programs
            .map((program) => program.jurisdictions?.name)
            .filter((name): name is string => Boolean(name))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [programs]
  );

  const categoryOptions = useMemo<CategoryOption[]>(
    () =>
      Array.from(
        new Map(
          programs.map((program) => [
            program.category,
            {
              slug: program.category,
              label:
                program.program_categories?.label ?? program.category,
            },
          ])
        ).values()
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [programs]
  );

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      const jurisdictionName = program.jurisdictions?.name;

      if (
        selectedJurisdictions.size > 0 &&
        (!jurisdictionName || !selectedJurisdictions.has(jurisdictionName))
      ) {
        return false;
      }

      if (
        selectedCategories.size > 0 &&
        !selectedCategories.has(program.category)
      ) {
        return false;
      }

      if (selectedTechnologies.size > 0) {
        const hasTechnology = program.technology.some((tech) =>
          selectedTechnologies.has(tech)
        );
        if (!hasTechnology) {
          return false;
        }
      }

      return true;
    });
  }, [
    programs,
    selectedJurisdictions,
    selectedCategories,
    selectedTechnologies,
  ]);

  const categoryCount = new Set(programs.map((p) => p.category)).size;

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

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <main className="mx-auto max-w-6xl px-8 py-16 sm:px-12 sm:py-24">
          <SectionLabel>Error</SectionLabel>
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <p className="font-heading text-lg font-bold text-red-600">
              Couldn&apos;t load programs
            </p>
            <p className="mt-2 text-gray-600">{error.message}</p>
            {error.code && <p className="mt-2 text-sm text-gray-500">Code: {error.code}</p>}
            {error.details && (
              <p className="mt-1 text-sm text-gray-500">Details: {error.details}</p>
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
        <header className="mb-16">
          <SectionLabel>Incentive Hub</SectionLabel>
          <h1 className="font-heading text-4xl font-bold text-heading sm:text-5xl">
            Programs
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-600">
            Discover incentive programs available to you, organized by category.
          </p>
        </header>

        <section className="mb-16 w-full rounded-3xl bg-primary-dark px-8 py-12 sm:px-12 sm:py-16">
          <SectionLabel>Overview</SectionLabel>
          <div className="flex flex-wrap gap-12 sm:gap-20">
            <div>
              <p className="font-heading text-5xl font-bold text-white sm:text-6xl">
                {filteredPrograms.length}
              </p>
              <p className="mt-2 text-gray-400">Total Programs</p>
            </div>
            <div>
              <p className="font-heading text-5xl font-bold text-white sm:text-6xl">
                {categoryCount}
              </p>
              <p className="mt-2 text-gray-400">Categories</p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-12 rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
            <div className="grid gap-8 sm:grid-cols-3">
              <FilterGroup title="Jurisdiction">
                {jurisdictionOptions.map((jurisdiction) => (
                  <FilterCheckbox
                    key={jurisdiction}
                    label={jurisdiction}
                    checked={selectedJurisdictions.has(jurisdiction)}
                    onChange={() =>
                      toggleSelection(
                        selectedJurisdictions,
                        jurisdiction,
                        setSelectedJurisdictions
                      )
                    }
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Category">
                {categoryOptions.map((category) => (
                  <FilterCheckbox
                    key={category.slug}
                    label={category.label}
                    checked={selectedCategories.has(category.slug)}
                    onChange={() =>
                      toggleSelection(
                        selectedCategories,
                        category.slug,
                        setSelectedCategories
                      )
                    }
                  />
                ))}
              </FilterGroup>

              <FilterGroup title="Technology">
                {TECHNOLOGY_OPTIONS.map((technology) => (
                  <FilterCheckbox
                    key={technology.value}
                    label={technology.label}
                    checked={selectedTechnologies.has(technology.value)}
                    onChange={() =>
                      toggleSelection(
                        selectedTechnologies,
                        technology.value,
                        setSelectedTechnologies
                      )
                    }
                  />
                ))}
              </FilterGroup>
            </div>
          </div>

          <SectionLabel>All Programs</SectionLabel>

          {filteredPrograms.length === 0 ? (
            <div className="rounded-2xl bg-white p-12 text-center shadow-lg">
              <p className="text-lg text-gray-600">
                {programs.length === 0
                  ? "No programs in the catalog yet."
                  : "No programs match these filters."}
              </p>
            </div>
          ) : (
            <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPrograms.map((program) => {
                const currentVersion = program.program_versions?.find(
                  (version) => version.effective_end === null
                );
                const recentlyChanged = currentVersion
                  ? isRecentlyChanged(currentVersion.effective_start)
                  : false;

                return (
                  <li
                    key={program.id}
                    className="rounded-2xl border border-gray-100 bg-white p-8 shadow-lg transition-shadow hover:shadow-xl"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium uppercase tracking-wider text-primary">
                        {program.program_categories?.label ?? program.category}
                      </p>
                      {recentlyChanged && <RecentlyChangedIndicator />}
                    </div>
                    <h2 className="mt-3 font-heading text-xl font-bold text-heading">
                      {program.name}
                    </h2>
                    <Link
                      href={`/programs/${program.slug}`}
                      className="mt-6 inline-block rounded-full bg-indigo-700 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-800"
                    >
                      View Details
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
