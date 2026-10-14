// Everything the shop owner may want to change lives here.
export const site = {
  name: "Letzprint3d",
  tagline: "Shadow lamps printed in Luxembourg",
  city: "Luxembourg",
  // International format without "+", e.g. 352621123456. Placeholder until Harsh confirms.
  whatsapp: "352000000000",
  email: "hello@letzprint3d.lu",
  instagram: "letzprint3d",
  leadTimeDays: "3–5",
  prices: {
    shade: 29.9, // symbol lamp, shade only
    lamp: 36.9, // symbol lamp with base + LED tea light
    photo: 44.9, // photo lithophane lamp with base + LED
    name: 24.9, // name / text half-lamp (night light)
    nfcStand: 34.9, // NFC review stand for businesses
  },
  sizes: [
    { id: "M", label: "Ø 9 cm × 11 cm", note: "standard" },
    { id: "L", label: "Ø 11 cm × 14 cm", note: "+ €10" },
  ],
  // Season banner shown on the home page. Dates are the real 2026 ones.
  season: {
    title: "Diwali is 8 November — order by 1 November.",
    halloween: "Halloween lamps ship until 28 October.",
  },
};

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const asset = (p: string) => `${basePath}${p}`;

export function waLink(message: string) {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}

export function eur(n: number) {
  return `€${n.toFixed(2).replace(".", ",")}`;
}
