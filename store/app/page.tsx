import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { byGroup, bySlug, groupTitles, seasonal } from "@/lib/catalog";
import { asset, eur, site, waLink } from "@/site.config";

function pick(slugs: string[]) {
  return slugs.map(bySlug).filter((p): p is NonNullable<typeof p> => Boolean(p));
}

export default function Home() {
  const diwali = pick(seasonal.diwali);
  const halloween = pick(seasonal.halloween);
  const faith = byGroup("faith").slice(0, 8);
  const nerd = byGroup("nerd").slice(0, 4);

  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 grid gap-10 md:grid-cols-[5fr_6fr] md:items-center">
        <img
          src={asset("/products/om-glow.webp")}
          alt="An Om lamp lit in a dark room, the symbol glowing through the white wall"
          className="lamp-img md:order-none order-2"
          width={900}
          height={1100}
          fetchPriority="high"
        />
        <div className="order-1">
          <h1>Light with your symbol in it.</h1>
          <p className="mt-6 text-lg text-ink-2">
            A lamp printed in white plastic, thin where it should glow and thick where it should not. Your faith, your fandom,
            your name or your photo — switched on, it draws itself on the wall.
          </p>
          <p className="mt-3 text-ink-2">
            Printed in {site.city}. From {eur(site.prices.shade)}. Ready in {site.leadTimeDays} days.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/lamps/" className="btn btn-glow">
              See the lamps
            </Link>
            <a className="btn btn-quiet" href={waLink("Hi! I'd like a lamp with: ")} target="_blank" rel="noopener">
              Ask on WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 border-t border-line">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2>{site.season.title}</h2>
          <Link href="/lamps/#hindu" className="text-ink-2 hover:text-ink">
            All Diwali lamps
          </Link>
        </div>
        <div className="mt-8 grid gap-6 grid-cols-2 md:grid-cols-4">
          {diwali.map((p, i) => (
            <ProductCard key={p.slug} p={p} priority={i < 2} />
          ))}
          <div className="flex flex-col justify-end gap-3 text-ink-2">
            <p>Om, diya or rangoli — with “शुभ दीपावली” or a family name printed into the wall.</p>
            <p className="text-sm text-ink-3">{site.season.halloween}</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2>Halloween, ready in an afternoon</h2>
        <div className="mt-8 grid gap-6 grid-cols-2 md:grid-cols-4">
          {halloween.map((p) => (
            <ProductCard key={p.slug} p={p} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 border-t border-line grid gap-8 md:grid-cols-3">
        <div>
          <h3>1. Choose</h3>
          <p className="mt-2 text-ink-2">A symbol from the collection, a line of text, or a photo of your own.</p>
        </div>
        <div>
          <h3>2. Tell us on WhatsApp</h3>
          <p className="mt-2 text-ink-2">The order button writes the message for you. Send the photo in the same chat.</p>
        </div>
        <div>
          <h3>3. Printed in {site.leadTimeDays} days</h3>
          <p className="mt-2 text-ink-2">Pick it up in {site.city} or get it by POST. Any tea light or the included LED fits the base.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 border-t border-line">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2>{groupTitles.faith.title}</h2>
            <p className="mt-2 text-ink-2">{groupTitles.faith.blurb}</p>
          </div>
          <Link href="/lamps/" className="text-ink-2 hover:text-ink">
            All lamps
          </Link>
        </div>
        <div className="mt-8 grid gap-6 grid-cols-2 md:grid-cols-4">
          {faith.map((p) => (
            <ProductCard key={p.slug} p={p} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 grid gap-10 md:grid-cols-2 md:items-center border-t border-line">
        <div>
          <h2>Your photo, in the light</h2>
          <p className="mt-4 text-ink-2">
            A lithophane: the photo becomes the wall thickness itself, so it only appears when the lamp is on. Faces, pets,
            a wedding, a city. {eur(site.prices.photo)} with base and LED.
          </p>
          <Link href="/photo-lamp/" className="btn btn-glow mt-6">
            Photo lamp
          </Link>
        </div>
        <img src={asset("/products/name-lamp.webp")} alt="A lamp with the name Léa glowing" className="lamp-img" width={900} height={1100} loading="lazy" />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 border-t border-line">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2>{groupTitles.nerd.title}</h2>
          <Link href="/lamps/#nerd" className="text-ink-2 hover:text-ink">
            All of them
          </Link>
        </div>
        <div className="mt-8 grid gap-6 grid-cols-2 md:grid-cols-4">
          {nerd.map((p) => (
            <ProductCard key={p.slug} p={p} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 border-t border-line">
        <h2>Run a café, a salon, a shop?</h2>
        <p className="mt-4 text-ink-2">
          A stand with your logo and an NFC tag: one tap on a phone opens your Google review page, your menu or your Instagram.
          {" "}{eur(site.prices.nfcStand)} each, less for five.
        </p>
        <Link href="/business/" className="btn btn-quiet mt-6">
          Stands for businesses
        </Link>
      </section>
    </>
  );
}
