import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderForm } from "@/components/OrderForm";
import { ProductCard } from "@/components/ProductCard";
import { byCategory, bySlug, productName, products } from "@/lib/catalog";
import { asset, site } from "@/site.config";

export const dynamicParams = false;

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/lamps/[slug]">) {
  const { slug } = await params;
  const p = bySlug(slug);
  return { title: p ? `${productName(p)} lamp — ${site.name}` : site.name };
}

const MODE_LABELS = {
  glow: { label: "Glow", blurb: "closed wall, the symbol lights up" },
  cutout: { label: "Cut-out", blurb: "open shape, shadow on the wall" },
} as const;

export default async function ProductPage({ params }: PageProps<"/lamps/[slug]">) {
  const { slug } = await params;
  const p = bySlug(slug);
  if (!p) notFound();
  const name = productName(p);
  const modes = p.variants.map((v) => ({ mode: v.mode, ...MODE_LABELS[v.mode] }));
  const related = byCategory(p.category).filter((x) => x.slug !== p.slug).slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="text-sm text-ink-3" aria-label="Breadcrumb">
        <Link href="/lamps/" className="no-underline hover:text-ink">
          Lamps
        </Link>{" "}
        / {p.categoryLabel}
      </nav>
      <div className="mt-6 grid gap-10 md:grid-cols-[6fr_5fr]">
        <div className="flex flex-col gap-4">
          {p.variants.map((v) => (
            <figure key={v.mode}>
              <img src={asset(v.image)} alt={`${name} lamp, ${MODE_LABELS[v.mode].label} style, lit`} className="lamp-img" width={900} height={1100} />
              {p.variants.length > 1 && (
                <figcaption className="mt-2 text-sm text-ink-3">
                  {MODE_LABELS[v.mode].label} — {MODE_LABELS[v.mode].blurb}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
        <div>
          <h1 className="text-4xl md:text-5xl">{name}</h1>
          <p className="mt-3 text-ink-2">{p.categoryLabel}. White PLA, Ø 9 cm shade, 11 cm tall. Works with any tea light; we include an LED one with the base.</p>
          <div className="mt-8">
            <OrderForm product={name} modes={modes} defaultMode={p.defaultMode as "glow" | "cutout"} />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <h2>More from {p.categoryLabel}</h2>
          <div className="mt-6 grid gap-6 grid-cols-2 md:grid-cols-4">
            {related.map((r) => (
              <ProductCard key={r.slug} p={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
