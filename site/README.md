# Marketing site

The product's public site: what it does, the live demo, the two plans and the
checkout links. It is a separate static deploy from the event app
(`docs/SAAS-TRANSFORMATION.md` §16.3): plain HTML, CSS and a little JavaScript,
no build step, no shared code with `src/`.

## Pages

| Path | Page |
|---|---|
| `/` | English landing page. A French-speaking browser is sent to `/fr/` on its first visit (`lang-redirect.js`) unless the visitor picked English |
| `/fr/` | French landing page |
| `/thanks.html`, `/fr/merci.html` | Stripe success pages: "your event link arrives within 24 hours" |

Both languages are written out in full so crawlers see real text. When you
change one page, change the other: `src/lib/site.test.ts` checks that they
keep the same sections, the same actions and the same prices.

## Going live

Edit `site.config.js` only:

- `checkoutBasicUrl`, `checkoutPremiumUrl`: the Stripe Payment Links (§16.5).
  Give each link custom fields for the event's web address (slug) and date,
  and set its success page to `https://<domain>/thanks.html` (EN) or
  `/fr/merci.html` (FR).
- `demoUrl`: the read-only demo event (`docs/PROVISIONING.md`, "The demo").
- `contactEmail`: where questions and refund requests go.

The prices live in three places that move together: `src/lib/pricing.ts`,
`site.config.js`, and the text of both pages. The test fails if they drift.

## Run it locally

Pages use root-relative paths, so serve the `site/` folder as the web root:

```bash
npx serve site            # http://localhost:3000
# or
python3 -m http.server -d site 4321
```

## Deploy

Create a Vercel project with **Root Directory** set to `site`. `site/vercel.json`
has no build step and sets the security headers (strict CSP: scripts from the
site only, fonts from Google Fonts).

## Assets

Everything visual is self-authored CSS or SVG (§8: no third-party artwork).
`icons.svg` is a sprite of a few Lucide icons (ISC licence, noted in the file).
