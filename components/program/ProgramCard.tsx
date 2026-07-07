import Link from "next/link";
import { RecentlyChangedIndicator } from "@/components/ui/RecentlyChangedIndicator";
import { StubBadge } from "@/components/ui/StubBadge";

type ProgramCardProps = {
  name: string;
  slug: string;
  categoryLabel: string;
  recentlyChanged?: boolean;
  isStub?: boolean;
  childCount?: number;
};

export function ProgramCard({
  name,
  slug,
  categoryLabel,
  recentlyChanged = false,
  isStub = false,
  childCount = 0,
}: ProgramCardProps) {
  return (
    <li className="flex flex-col rounded-2xl border border-gray-100 bg-white p-8 shadow-lg transition-shadow hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">
          {categoryLabel}
        </p>
        {recentlyChanged && <RecentlyChangedIndicator />}
      </div>
      <h2 className="mt-3 font-heading text-xl font-bold text-heading">{name}</h2>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isStub && <StubBadge />}
        {childCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase tracking-wide text-heading">
            {childCount} sub-module{childCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <Link
        href={`/programs/${slug}`}
        className="mt-6 inline-block self-start rounded-full bg-indigo-700 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-800"
      >
        View Details
      </Link>
    </li>
  );
}
