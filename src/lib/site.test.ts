import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITE_CONFIG } from '../../site/site.config.js';
import { PRICE_BASIC_CAD, PRICE_PREMIUM_CAD, PRICE_UPGRADE_DELTA_CAD } from './pricing';

// The marketing site (site/) is a separate static deploy, but it sells the same
// plans: these checks keep its prices and its two languages in step.

const read = (path: string) => readFileSync(resolve(__dirname, '../../site', path), 'utf8');
const EN = read('index.html');
const FR = read('fr/index.html');

const priceIn = (html: string, key: string) =>
  html.match(new RegExp(`data-price="${key}">([^<]+)<`))?.[1];
const all = (html: string, re: RegExp) => [...html.matchAll(re)].map((m) => m[1]);

describe('marketing site', () => {
  it('config prices match the app', () => {
    expect(SITE_CONFIG.priceBasicCad).toBe(PRICE_BASIC_CAD);
    expect(SITE_CONFIG.pricePremiumCad).toBe(PRICE_PREMIUM_CAD);
  });

  it('pages show the same prices, in each language format', () => {
    expect(priceIn(EN, 'basic')).toBe(`$${PRICE_BASIC_CAD}`);
    expect(priceIn(EN, 'premium')).toBe(`$${PRICE_PREMIUM_CAD}`);
    expect(priceIn(EN, 'delta')).toBe(`$${PRICE_UPGRADE_DELTA_CAD}`);
    expect(priceIn(FR, 'basic')).toBe(`${PRICE_BASIC_CAD} $`);
    expect(priceIn(FR, 'premium')).toBe(`${PRICE_PREMIUM_CAD} $`);
    expect(priceIn(FR, 'delta')).toBe(`${PRICE_UPGRADE_DELTA_CAD} $`);
  });

  it('EN and FR pages have the same sections and the same actions', () => {
    const ids = /\sid="([^"]+)"/g;
    const links = /data-link="([^"]+)"/g;
    expect(all(FR, ids)).toEqual(all(EN, ids));
    expect(all(FR, links)).toEqual(all(EN, links));
  });

  it('every icon a page uses exists in the sprite', () => {
    const sprite = read('icons.svg');
    for (const page of [EN, FR, read('thanks.html'), read('fr/merci.html')]) {
      for (const icon of all(page, /icons\.svg#([a-z0-9-]+)/g)) {
        expect(sprite, icon).toContain(`id="${icon}"`);
      }
    }
  });
});
