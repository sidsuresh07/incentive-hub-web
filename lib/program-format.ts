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

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return "just now";
  }
  if (diffMin < 60) {
    return diffMin === 1 ? "1 minute ago" : `${diffMin} minutes ago`;
  }
  if (diffHour < 24) {
    return diffHour === 1 ? "1 hour ago" : `${diffHour} hours ago`;
  }
  if (diffDay < 30) {
    return diffDay === 1 ? "1 day ago" : `${diffDay} days ago`;
  }

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
