import { eur, site, waLink } from "@/site.config";

export const metadata = { title: `For businesses — ${site.name}` };

const msg = "Hi! I run a business in Luxembourg and I'm interested in NFC stands with our logo. How many: ... Link they should open: ...";

export default function Business() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="max-w-3xl">
        <h1>One tap, one review.</h1>
        <p className="mt-6 text-ink-2 text-lg">
          A small stand with your logo and an NFC tag inside. A customer holds their phone to it and your Google review
          page opens — or your menu, your booking page, your Instagram. No app, no QR squinting.
        </p>
      </div>
      <div className="mt-12 grid gap-10 md:grid-cols-3">
        <div>
          <h3>Counter stand</h3>
          <p className="mt-2 text-ink-2">
            Your logo embossed, one tile with the icon of your choice. {eur(site.prices.nfcStand)}; five for {eur(site.prices.nfcStand * 5 * 0.85)}.
          </p>
        </div>
        <div>
          <h3>Multi-link bar</h3>
          <p className="mt-2 text-ink-2">Two to four tiles on one stand: reviews, menu, Wi-Fi, booking. Each tile is its own tag.</p>
        </div>
        <div>
          <h3>Branded lamps</h3>
          <p className="mt-2 text-ink-2">Your logo as a lamp for the counter, or as a Christmas gift for your team and clients.</p>
        </div>
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <a className="btn btn-glow" href={waLink(msg)} target="_blank" rel="noopener">
          Ask for a sample on WhatsApp
        </a>
        <a className="btn btn-quiet" href={`mailto:${site.email}?subject=NFC%20stands`}>
          Email us
        </a>
      </div>
      <p className="mt-8 text-sm text-ink-3 max-w-2xl">
        We program the tags, you keep the links: the stand opens whatever URL you give us, and we can re-program it later.
        Send us your logo as PNG or SVG; we send a render before printing.
      </p>
    </div>
  );
}
