export function VerificationCallout({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-2xl border-2 border-amber-400 bg-amber-50 px-6 py-5 text-amber-950">
      <p className="font-heading text-sm font-bold">{title}</p>
      {children && (
        <div className="mt-3 text-sm text-amber-900">{children}</div>
      )}
    </div>
  );
}
