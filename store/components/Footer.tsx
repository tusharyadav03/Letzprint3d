import Link from "next/link";
import { site } from "@/site.config";

export function Footer() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-4 py-10 grid gap-8 md:grid-cols-3 text-sm text-ink-2">
        <div>
          <div className="display text-xl text-ink">{site.name}</div>
          <p className="mt-2">3D printed in {site.city}. Pick-up in town or POST Luxembourg delivery.</p>
        </div>
        <div className="flex flex-col gap-2">
          <a href={`mailto:${site.email}`} className="no-underline hover:text-ink">
            {site.email}
          </a>
          <a href={`https://instagram.com/${site.instagram}`} className="no-underline hover:text-ink" rel="noopener">
            Instagram @{site.instagram}
          </a>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/about/" className="no-underline hover:text-ink">
            About
          </Link>
          <Link href="/legal/" className="no-underline hover:text-ink">
            Legal notice
          </Link>
          <Link href="/privacy/" className="no-underline hover:text-ink">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
