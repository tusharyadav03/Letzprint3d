import { ProductCard } from "@/components/ProductCard";
import { catalog, products } from "@/lib/catalog";

export const metadata = { title: "All lamps — Letzprint3d" };

export default function Lamps() {
  const order = [
    "hindu", "christian", "islam", "jewish", "buddhist", "sikh", "bahai", "taoist", "shinto", "spiritual",
    "halloween", "christmas", "night", "love", "pets", "nerd", "custom",
  ];
  const cats = order.filter((c) => products.some((p) => p.category === c));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1>All lamps</h1>
      <p className="mt-4 text-ink-2">
        Every lamp comes as a closed wall that glows, or as a cut-out that throws the shape onto the wall behind it.
        Each one can carry a name or a line of text.
      </p>
      <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-ink-2 text-sm" aria-label="Categories">
        {cats.map((c) => (
          <a key={c} href={`#${c}`} className="no-underline hover:text-ink">
            {catalog.categories[c] ?? c}
          </a>
        ))}
      </nav>
      {cats.map((c) => (
        <section key={c} id={c} className="pt-14 scroll-mt-6">
          <h2>{catalog.categories[c] ?? c}</h2>
          <div className="mt-6 grid gap-6 grid-cols-2 md:grid-cols-4">
            {products
              .filter((p) => p.category === c)
              .map((p) => (
                <ProductCard key={p.slug} p={p} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
