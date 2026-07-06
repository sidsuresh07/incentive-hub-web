export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-3 h-1 w-8 rounded-full bg-accent" />
      <p className="text-sm font-medium uppercase tracking-wider text-gray-600">
        {children}
      </p>
    </div>
  );
}
