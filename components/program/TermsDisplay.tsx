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

function formatEligibility(eligibility: ProgramTerms["eligibility"]): React.ReactNode {
  if (!eligibility) {
    return "—";
  }

  const items: string[] = [];

  if (eligibility.technology?.length) {
    items.push(
      `Technology: ${eligibility.technology.map(formatLabel).join(", ")}`
    );
  }
  if (eligibility.sector?.length) {
    items.push(`Sector: ${eligibility.sector.map(formatLabel).join(", ")}`);
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
