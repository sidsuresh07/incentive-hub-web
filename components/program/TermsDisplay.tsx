import type { ProgramTerms } from "@/lib/program-types";
import { formatLabel, formatValue } from "@/lib/program-format";

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100 py-4 last:border-b-0">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-gray-600">{value}</dd>
    </div>
  );
}

// Eligibility list fields (technology, sector) are meant to be string arrays,
// but legacy/agent data occasionally stored a prose string. Render either shape
// safely: format+join arrays, or show a string verbatim.
function formatStringList(value: unknown): string | null {
  if (Array.isArray(value)) {
    const parts = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    return parts.length > 0 ? parts.map(formatLabel).join(", ") : null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function formatEligibility(eligibility: ProgramTerms["eligibility"]): React.ReactNode {
  if (!eligibility) {
    return "—";
  }

  const items: string[] = [];

  const technology = formatStringList(eligibility.technology);
  if (technology) {
    items.push(`Technology: ${technology}`);
  }
  const sector = formatStringList(eligibility.sector);
  if (sector) {
    items.push(`Sector: ${sector}`);
  }
  if (eligibility.size_limits) {
    items.push(`Size limits: ${eligibility.size_limits}`);
  }
  if (eligibility.income_qualified) {
    items.push("Income-qualified eligible");
  }
  if (eligibility.environmental_justice_qualified) {
    items.push("Environmental justice qualified");
  }

  if (items.length === 0) {
    return "—";
  }

  return (
    <ul className="list-inside list-disc space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function TermsDisplay({ terms }: { terms: ProgramTerms }) {
  return (
    <dl>
      <DetailRow
        label="Incentive type"
        value={
          terms.incentive_type ? formatLabel(terms.incentive_type) : "—"
        }
      />
      <DetailRow label="Value" value={formatValue(terms.value)} />
      {terms.value?.cap != null && (
        <DetailRow label="Cap" value={String(terms.value.cap)} />
      )}
      <DetailRow
        label="Eligibility"
        value={formatEligibility(terms.eligibility)}
      />
      <DetailRow
        label="Stacking notes"
        value={terms.stacking_notes ?? "—"}
      />
    </dl>
  );
}
