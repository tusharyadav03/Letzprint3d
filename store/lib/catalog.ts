import catalogJson from "@/content/catalog.json";

export type Variant = { mode: "glow" | "cutout"; image: string };
export type Product = {
  slug: string;
  name: string;
  category: string;
  categoryLabel: string;
  group: "faith" | "season" | "nerd" | "custom" | "other";
  defaultMode: string;
  variants: Variant[];
  note: string;
};

type Catalog = {
  generated: string;
  categories: Record<string, string>;
  groups: Record<string, string[]>;
  items: Product[];
};

export const catalog = catalogJson as Catalog;

// Display names that the slug-to-title rule gets wrong.
const NAMES: Record<string, string> = {
  om: "Om",
  "ik-onkar": "Ik Onkar",
  "star-of-david": "Star of David",
  "crescent-star": "Crescent and star",
  "dharma-wheel": "Dharma wheel",
  "bahai-star": "Nine-pointed star",
  "yin-yang": "Yin and yang",
  "nativity-star": "Star of Bethlehem",
  "moon-stars": "Moon and stars",
  "xmas-tree": "Christmas tree",
  "pixel-heart": "Pixel heart",
  "solar-system": "Solar system",
  "chess-knight": "Chess knight",
  "hex-grid": "Honeycomb",
  dna: "DNA",
  d20: "D20",
  allah: "Allah (calligraphy)",
  shalom: "Shalom",
  diya: "Diya",
  rangoli: "Rangoli",
  sine: "Sine wave",
  pi: "Pi",
};

export function productName(p: Product) {
  return NAMES[p.slug] ?? p.name;
}

export const products: Product[] = catalog.items;

export function bySlug(slug: string) {
  return products.find((p) => p.slug === slug);
}

export function byGroup(group: Product["group"]) {
  return products.filter((p) => p.group === group);
}

export function byCategory(category: string) {
  return products.filter((p) => p.category === category);
}

export const groupTitles: Record<string, { title: string; blurb: string }> = {
  faith: {
    title: "Faith and festivals",
    blurb: "Symbols of every tradition, drawn from plain geometry and type — nothing copied, nothing branded.",
  },
  season: {
    title: "Halloween, Christmas, pets, love",
    blurb: "Seasonal lamps that print in an afternoon.",
  },
  nerd: {
    title: "Science and nerd",
    blurb: "For the desk, the lab, the game night.",
  },
};

export const seasonal = {
  diwali: ["om", "diya", "rangoli"],
  halloween: ["pumpkin", "ghost", "bat", "spiderweb"],
  christmas: ["xmas-tree", "snowflake", "nativity-star", "bauble"],
};
