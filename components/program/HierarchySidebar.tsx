import Link from "next/link";
import type { ProgramHierarchy } from "@/lib/program-types";

export function HierarchySidebar({
  hierarchy,
  currentSlug,
}: {
  hierarchy: ProgramHierarchy;
  currentSlug: string;
}) {
  const isChild = hierarchy.parent !== null;

  return (
    <aside className="lg:sticky lg:top-8">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
        {isChild && hierarchy.parent ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Part of
            </p>
            <Link
              href={`/programs/${hierarchy.parent.slug}`}
              className="mt-2 block font-heading text-sm font-bold text-primary hover:underline"
            >
              ← {hierarchy.parent.name}
            </Link>

            {hierarchy.children.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-6">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                  Modules
                </p>
                <HierarchyList
                  links={hierarchy.children}
                  currentSlug={currentSlug}
                />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
              Sub-modules
            </p>
            <HierarchyList
              links={hierarchy.children}
              currentSlug={currentSlug}
            />
          </>
        )}
      </div>
    </aside>
  );
}

function HierarchyList({
  links,
  currentSlug,
}: {
  links: { id: string; name: string; slug: string }[];
  currentSlug: string;
}) {
  return (
    <ul className="space-y-1">
      {links.map((link) => {
        const isCurrent = link.slug === currentSlug;
        return (
          <li key={link.id}>
            {isCurrent ? (
              <span className="block rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                {link.name}
              </span>
            ) : (
              <Link
                href={`/programs/${link.slug}`}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-primary"
              >
                {link.name}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
