import { formatDate, formatLabel } from "@/lib/program-format";
import type { ProgramVersion } from "@/lib/program-types";
import { ReliabilityMarker } from "@/components/ui/ReliabilityMarker";

function RecordMarker({
  isCurrent,
  needsVerification,
}: {
  isCurrent: boolean;
  needsVerification: boolean;
}) {
  if (needsVerification) {
    return (
      <span
        className="absolute -left-[1.625rem] top-1.5 flex h-3 w-3 items-center justify-center"
        aria-hidden="true"
      >
        <span className="h-3 w-3 rounded-full border-2 border-amber-400 bg-white" />
      </span>
    );
  }

  if (isCurrent) {
    return (
      <span
        className="absolute -left-[1.625rem] top-1.5 flex h-3 w-3 items-center justify-center"
        aria-hidden="true"
      >
        <span className="h-3 w-3 rounded-full bg-accent ring-4 ring-white" />
      </span>
    );
  }

  return (
    <span
      className="absolute -left-[1.625rem] top-1.5 flex h-3 w-3 items-center justify-center"
      aria-hidden="true"
    >
      <span className="h-3 w-3 rounded-full border border-gray-300 bg-white" />
    </span>
  );
}

export function TheRecord({ versions }: { versions: ProgramVersion[] }) {
  return (
    <ol className="relative space-y-0">
      {versions.map((version) => {
        const isCurrent = version.effective_end === null;
        const needsVerification =
          version.confidence_flag === "needs_double_verification";
        const isSuperseded = !isCurrent;
        const activeVerification = needsVerification && isCurrent;

        return (
          <li
            key={version.id}
            className={`relative border-l-2 pb-8 pl-8 last:pb-0 ${
              isCurrent ? "border-accent/40" : "border-gray-200"
            } ${isSuperseded ? "opacity-60" : ""}`}
          >
            <RecordMarker
              isCurrent={isCurrent}
              needsVerification={activeVerification}
            />

            <div
              className={`rounded-2xl border p-6 ${
                activeVerification
                  ? "border-amber-400 border-l-[3px] bg-amber-50/50"
                  : isCurrent
                    ? "border-primary/20 bg-primary/5"
                    : "border-gray-100 bg-gray-50"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-heading text-sm font-bold text-heading">
                    {formatDate(version.effective_start)} —{" "}
                    {version.effective_end
                      ? formatDate(version.effective_end)
                      : "Present"}
                  </p>
                  {needsVerification && isSuperseded && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Was flagged for review
                    </p>
                  )}
                </div>
                {isCurrent && (
                  <span className="text-xs font-bold uppercase tracking-wide text-accent">
                    Current
                  </span>
                )}
                {activeVerification && (
                  <span className="text-xs font-bold uppercase tracking-wide text-amber-800">
                    Needs review
                  </span>
                )}
              </div>

              {version.change_reason ? (
                <p className="mt-3 font-medium text-heading">
                  {version.change_reason}
                </p>
              ) : (
                <p className="mt-3 text-sm italic text-gray-500">
                  No change reason recorded
                </p>
              )}

              <p className="mt-2 border-l-2 border-gray-200 pl-4 text-sm text-gray-600">
                {version.value_summary}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CitationCard({
  title,
  url,
  sourceType,
  reliabilityTier,
}: {
  title: string;
  url: string;
  sourceType: string;
  reliabilityTier: string;
}) {
  const isPrimary = reliabilityTier === "primary";

  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-6 shadow-lg">
      <div className="flex items-start gap-3">
        <ReliabilityMarker
          variant={isPrimary ? "solid" : "hollow"}
          className="mt-1.5"
        />
        <div className="min-w-0 flex-1">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-heading hover:underline ${
              isPrimary
                ? "font-bold text-primary"
                : "font-bold text-gray-500"
            }`}
          >
            {title}
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span>{formatLabel(sourceType)}</span>
            <span>·</span>
            <span
              className={
                isPrimary ? "font-medium text-green-700" : "text-gray-500"
              }
            >
              {formatLabel(reliabilityTier)} source
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
