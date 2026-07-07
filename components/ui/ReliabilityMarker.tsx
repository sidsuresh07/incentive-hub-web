export type MarkerVariant = "solid" | "hollow" | "open";

export function ReliabilityMarker({
  variant,
  className = "",
}: {
  variant: MarkerVariant;
  className?: string;
}) {
  const base = `inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`;

  if (variant === "solid") {
    return <span className={`${base} bg-green-600`} aria-hidden="true" />;
  }

  if (variant === "hollow") {
    return (
      <span
        className={`${base} border-2 border-gray-400 bg-transparent`}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`${base} border border-gray-300 bg-transparent`}
      aria-hidden="true"
    />
  );
}
