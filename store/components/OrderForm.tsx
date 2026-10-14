"use client";

import { useMemo, useState } from "react";
import { eur, site, waLink } from "@/site.config";

type Props = {
  product: string;
  modes: { mode: "glow" | "cutout"; label: string; blurb: string }[];
  defaultMode: "glow" | "cutout";
  textAllowed?: boolean;
};

export function OrderForm({ product, modes, defaultMode, textAllowed = true }: Props) {
  const [mode, setMode] = useState<"glow" | "cutout">(defaultMode);
  const [size, setSize] = useState(site.sizes[0].id);
  const [withBase, setWithBase] = useState(true);
  const [text, setText] = useState("");
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<"pickup" | "post">("pickup");

  const unit = (withBase ? site.prices.lamp : site.prices.shade) + (size === "L" ? 10 : 0);
  const total = unit * qty;

  const message = useMemo(() => {
    const lines = [
      `Hi! I'd like to order a ${product} lamp.`,
      `Style: ${mode === "glow" ? "glow (closed wall)" : "cut-out (shadow on the wall)"}`,
      `Size: ${site.sizes.find((s) => s.id === size)?.label}`,
      `Base + LED tea light: ${withBase ? "yes" : "no, shade only"}`,
      text.trim() ? `Text on the lamp: "${text.trim()}"` : "Text on the lamp: none",
      `Quantity: ${qty}`,
      `Delivery: ${delivery === "pickup" ? "pick-up in Luxembourg" : "POST Luxembourg delivery"}`,
      `Total: ${eur(total)}`,
    ];
    return lines.join("\n");
  }, [product, mode, size, withBase, text, qty, delivery, total]);

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
      {modes.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-ink-2">Style</legend>
          <div className="grid grid-cols-2 gap-2">
            {modes.map((m) => (
              <button
                key={m.mode}
                type="button"
                className="choice"
                aria-pressed={mode === m.mode}
                onClick={() => setMode(m.mode)}
              >
                <div className="font-medium">{m.label}</div>
                <div className="text-sm text-ink-2">{m.blurb}</div>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-ink-2">Size</legend>
        <div className="grid grid-cols-2 gap-2">
          {site.sizes.map((s) => (
            <button key={s.id} type="button" className="choice" aria-pressed={size === s.id} onClick={() => setSize(s.id)}>
              <div className="font-medium">{s.label}</div>
              <div className="text-sm text-ink-2">{s.note}</div>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1.5 accent-[var(--glow)]" checked={withBase} onChange={(e) => setWithBase(e.target.checked)} />
        <span>
          <span className="font-medium">Base with LED tea light</span>
          <span className="block text-sm text-ink-2">
            {eur(site.prices.lamp)} with base, {eur(site.prices.shade)} for the shade alone (fits any tea light).
          </span>
        </span>
      </label>

      {textAllowed && (
        <label className="flex flex-col gap-2">
          <span className="text-ink-2">A name, a date, a line — printed into the lamp (optional)</span>
          <input
            className="field"
            value={text}
            maxLength={40}
            placeholder="e.g. Shubh Deepavali · Léa · 14.10.2026"
            onChange={(e) => setText(e.target.value)}
          />
          <span className="text-sm text-ink-3">Any script works: Latin, Devanagari, Arabic, Hebrew, Gurmukhi.</span>
        </label>
      )}

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-ink-2">Quantity</span>
          <input type="number" min={1} max={20} className="field" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-ink-2">Delivery</legend>
          <div className="flex gap-2">
            <button type="button" className="choice flex-1" aria-pressed={delivery === "pickup"} onClick={() => setDelivery("pickup")}>
              Pick-up
            </button>
            <button type="button" className="choice flex-1" aria-pressed={delivery === "post"} onClick={() => setDelivery("post")}>
              POST
            </button>
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <div className="display text-3xl">{eur(total)}</div>
        <a className="btn btn-glow" href={waLink(message)} target="_blank" rel="noopener">
          Order on WhatsApp
        </a>
        <a className="btn btn-quiet" href={`mailto:${site.email}?subject=${encodeURIComponent(`Order: ${product} lamp`)}&body=${encodeURIComponent(message)}`}>
          Order by email
        </a>
      </div>
      <p className="text-sm text-ink-3">
        We confirm within a day and print in {site.leadTimeDays} days. Personalised lamps cannot be returned once printing has started (Art. L. 222-9 Code de la consommation).
      </p>
    </form>
  );
}
