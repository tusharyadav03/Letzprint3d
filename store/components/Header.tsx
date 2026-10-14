import Link from "next/link";
import { site, waLink } from "@/site.config";

const nav = [
  { href: "/lamps/", label: "Lamps" },
  { href: "/photo-lamp/", label: "Photo lamp" },
  { href: "/names/", label: "Name lamp" },
  { href: "/business/", label: "For businesses" },
];

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-6">
        <Link href="/" className="display text-2xl no-underline" aria-label={`${site.name} home`}>
          {site.name}
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-ink-2">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="no-underline hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <a className="btn btn-glow" href={waLink("Hi! I have a question about a lamp.")} target="_blank" rel="noopener">
            WhatsApp us
          </a>
        </div>
      </div>
      <nav className="md:hidden mx-auto max-w-6xl px-4 pb-3 flex gap-5 text-sm text-ink-2 overflow-x-auto">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="no-underline whitespace-nowrap hover:text-ink">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
