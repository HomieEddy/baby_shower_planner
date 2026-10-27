import { SITE_CONFIG } from './site.config.js';

// Wire every config-driven link: <a data-link="checkoutBasic"> gets
// SITE_CONFIG.checkoutBasicUrl, and so on. The pages ship a safe fallback href
// (#pricing) so a link still goes somewhere if this script fails.
const LINKS = {
  checkoutBasic: SITE_CONFIG.checkoutBasicUrl,
  checkoutPremium: SITE_CONFIG.checkoutPremiumUrl,
  demo: SITE_CONFIG.demoUrl,
  contact: `mailto:${SITE_CONFIG.contactEmail}`,
};

for (const el of document.querySelectorAll('a[data-link]')) {
  const href = LINKS[el.dataset.link];
  if (href) el.href = href;
}

for (const el of document.querySelectorAll('[data-contact-email]')) {
  el.textContent = SITE_CONFIG.contactEmail;
}

for (const el of document.querySelectorAll('[data-year]')) {
  el.textContent = String(new Date().getFullYear());
}

// Remember an explicit language choice, so the root page stops redirecting a
// French browser to /fr/ once the visitor has picked English.
const LANG_KEY = 'site-lang';
for (const el of document.querySelectorAll('a[data-set-lang]')) {
  el.addEventListener('click', () => {
    try { localStorage.setItem(LANG_KEY, el.dataset.setLang); } catch { /* storage blocked */ }
  });
}

// Close the mobile menu after following an in-page link.
const menu = document.querySelector('[data-menu]');
if (menu) {
  for (const a of menu.querySelectorAll('a[href^="#"]')) {
    a.addEventListener('click', () => menu.removeAttribute('open'));
  }
}
