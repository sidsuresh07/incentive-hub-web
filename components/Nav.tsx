import Link from "next/link";

const navLinks = [
  { href: "/", label: "Programs" },
  { href: "/review", label: "Review Queue" },
];

export function Nav() {
  return (
    <header className="border-b border-gray-100 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-8 py-4 sm:px-12">
        <Link
          href="/"
          className="font-heading text-lg font-bold text-heading hover:text-primary"
        >
          Incentive Hub
        </Link>
        <ul className="flex items-center gap-6">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
