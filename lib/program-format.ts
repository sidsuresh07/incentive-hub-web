import type { ProgramTerms } from "./program-types";

export function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatValue(value: ProgramTerms["value"]): string {
  if (!value) {
    return "—";
  }

  if (value.type === "varies") {
    return "Varies";
  }

  if (value.amount == null) {
    return value.type ? formatLabel(value.type) : "—";
  }

  const amount = String(value.amount);
  const unit = value.unit ?? "";

  if (unit === "percent" || value.type === "percentage") {
    return `${amount}%`;
  }

  if (unit) {
    return `${amount} ${formatLabel(unit)}`;
  }

  return amount;
}

export function isRecentlyChanged(effectiveStart: string): boolean {
  const start = new Date(`${effectiveStart}T00:00:00`);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return start >= thirtyDaysAgo;
}

export const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  proposed: "bg-amber-100 text-amber-800",
  expired: "bg-gray-100 text-gray-600",
  superseded: "bg-gray-100 text-gray-500",
  under_review: "bg-orange-100 text-orange-800",
};
