import { asset, eur, site, waLink } from "@/site.config";

export const metadata = { title: `Photo lamp — ${site.name}` };

const msg = `Hi! I'd like a photo lamp (${eur(site.prices.photo)} with base + LED). I'll send the photo here. Text on the lamp: ... Pick-up or POST: ...`;

export default function PhotoLamp() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 grid gap-10 md:grid-cols-[6fr_5fr]">
      <img src={asset("/products/photo-demo.webp")} alt="A photo lithophane lamp lit: a moonlit mountain landscape appearing in the wall" className="lamp-img" width={900} height={1100} />
      <div>
        <h1 className="text-4xl md:text-5xl">Your photo, in the light</h1>
        <p className="mt-4 text-ink-2">
          Off, it is a white cylinder. On, the photo appears: the wall is thin where the picture is bright and thick where it
          is dark. This is a lithophane, and it is the most personal thing a printer can make.
        </p>
        <h3 className="mt-8">What works</h3>
        <ul className="mt-3 list-disc pl-5 text-ink-2 flex flex-col gap-1">
          <li>One or two faces filling the frame, good light, not too dark.</li>
          <li>Pets, wedding photos, a skyline, a child's drawing.</li>
          <li>Landscape or portrait — we wrap it around a 9 cm cylinder (about 28 cm of picture) or make a flat panel.</li>
        </ul>
        <h3 className="mt-8">Price</h3>
        <p className="mt-2 text-ink-2">
          {eur(site.prices.photo)} with base and LED tea light. A short line of text underneath is included. Ready in {site.leadTimeDays} days; photo lamps take longer to print than symbols.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a className="btn btn-glow" href={waLink(msg)} target="_blank" rel="noopener">
            Send a photo on WhatsApp
          </a>
          <a className="btn btn-quiet" href={`mailto:${site.email}?subject=Photo%20lamp`}>
            Or by email
          </a>
        </div>
        <p className="mt-6 text-sm text-ink-3">
          We send you a preview of the lit lamp before printing. Your photo is used only to make your lamp and deleted 30 days after delivery.
        </p>
      </div>
    </div>
  );
}
