# Letzprint3d store (Phase 1)

Static Next.js site: catalogue, product pages, photo lamp, name lamp, business stands. No checkout — every
"Order" button opens WhatsApp (or email) with the order written out. Payments and accounts come in Phase 2.

```bash
cd store
npm install
npm run dev          # http://localhost:3000
npm run build        # static export into store/out
```

## Change things

| what | where |
|---|---|
| WhatsApp number, email, Instagram, prices, sizes, season banner | `site.config.ts` |
| product names that the slug rule gets wrong | `lib/catalog.ts` (`NAMES`) |
| which lamps show in the Diwali / Halloween / Christmas rows | `lib/catalog.ts` (`seasonal`) |
| colours, type | `app/globals.css` |
| legal identity (required before going public) | `app/legal/page.tsx` |

## Regenerate product images

The images are rendered by the Shadow Lamp engine from the same files that get printed — add a theme in
`shadowlamp/themes.py` and run, from the repo root:

```bash
python -m shadowlamp.catalog --out store/public/products --json store/content/catalog.json
```

## Deploy

- **GitHub Pages (free):** push, then on GitHub: Settings → Pages → Source: *GitHub Actions*. The workflow in
  `.github/workflows/pages.yml` builds `store/` and publishes it at `https://<owner>.github.io/<repo>/`.
- **Vercel:** import the repo, set *Root Directory* to `store`. No env vars needed.
- **Any host:** upload `store/out/`.
