import { OrderForm } from "@/components/OrderForm";
import { asset, eur, site } from "@/site.config";

export const metadata = { title: `Name lamp — ${site.name}` };

export default function Names() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 grid gap-10 md:grid-cols-[6fr_5fr]">
      <div className="flex flex-col gap-4">
        <img src={asset("/products/name-lamp.webp")} alt="A lamp with the name Léa glowing" className="lamp-img" width={900} height={1100} />
        <img src={asset("/products/hello-world.webp")} alt="A lamp with Hello, World! glowing" className="lamp-img" width={900} height={1100} loading="lazy" />
      </div>
      <div>
        <h1 className="text-4xl md:text-5xl">A name, in the light</h1>
        <p className="mt-4 text-ink-2">
          A child's name for the bedside, a date, a word that matters. Up to two lines, in any script we can type —
          Latin, Devanagari, Arabic, Hebrew, Gurmukhi. The full lamp is {eur(site.prices.lamp)} with base; a half-lamp
          that stands against the wall as a night light is {eur(site.prices.name)}.
        </p>
        <div className="mt-8">
          <OrderForm
            product="name"
            modes={[
              { mode: "glow", label: "Glow", blurb: "letters light up" },
              { mode: "cutout", label: "Cut-out", blurb: "letters cast on the wall" },
            ]}
            defaultMode="glow"
          />
        </div>
      </div>
    </div>
  );
}
