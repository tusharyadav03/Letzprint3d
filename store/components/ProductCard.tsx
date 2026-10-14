import Link from "next/link";
import { asset, eur, site } from "@/site.config";
import { productName, type Product } from "@/lib/catalog";

export function ProductCard({ p, priority = false }: { p: Product; priority?: boolean }) {
  const v = p.variants.find((x) => x.mode === p.defaultMode) ?? p.variants[0];
  return (
    <Link href={`/lamps/${p.slug}/`} className="group no-underline block">
      <img
        src={asset(v.image)}
        alt={`${productName(p)} lamp, lit`}
        className="lamp-img"
        loading={priority ? "eager" : "lazy"}
        width={900}
        height={1100}
      />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="font-medium group-hover:text-glow">{productName(p)}</span>
        <span className="text-ink-2 text-sm whitespace-nowrap">from {eur(site.prices.shade)}</span>
      </div>
      <div className="text-ink-3 text-sm">{p.categoryLabel}</div>
    </Link>
  );
}
