import { formatLabel, STATUS_STYLES } from "@/lib/program-format";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {formatLabel(status)}
    </span>
  );
}
