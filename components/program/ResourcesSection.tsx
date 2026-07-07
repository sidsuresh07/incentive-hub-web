import { formatLabel } from "@/lib/program-format";
import type { ProgramResource } from "@/lib/program-types";

export function ResourcesSection({
  resources,
}: {
  resources: ProgramResource[];
}) {
  if (resources.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
        <p className="text-gray-500">No internal resources added yet.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {resources.map((resource) => (
        <li
          key={resource.id}
          className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {resource.url ? (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-heading font-bold text-primary hover:underline"
                >
                  {resource.title}
                </a>
              ) : (
                <p className="font-heading font-bold text-heading">
                  {resource.title}
                </p>
              )}
              {resource.notes && (
                <p className="mt-2 text-sm text-gray-600">{resource.notes}</p>
              )}
            </div>
            <span className="shrink-0 rounded-lg bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-600">
              {formatLabel(resource.resource_type)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
