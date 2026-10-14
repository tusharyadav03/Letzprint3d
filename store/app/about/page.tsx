import { site } from "@/site.config";

export const metadata = { title: `About — ${site.name}` };

export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1>About</h1>
      <p className="mt-6 text-ink-2 text-lg">
        {site.name} is a small 3D-printing workshop in {site.city}. We make lamps whose walls carry the picture — a
        technique called lithophane — and NFC stands for local businesses.
      </p>
      <p className="mt-4 text-ink-2">
        Every design here is our own: symbols drawn from geometry and open-licensed type, never copied from someone else's
        file. Religious symbols are rendered plainly and respectfully, as symbols; we do not print figurative images of
        the sacred, and we do not print trademarks or characters we don't own.
      </p>
      <p className="mt-4 text-ink-2">
        Material: white PLA, a plant-based plastic, printed on a Bambu Lab P1S. Light: any tea light or the LED one we include. No heat, no risk.
      </p>
    </div>
  );
}
