import '@testing-library/jest-dom/vitest';

// Handler tests exercise a Premium deploy; the tier gate itself is pinned
// explicitly by the tests that care (src/server/routes/routes.test.ts).
process.env.PLAN = 'Premium';

// jsdom has no layout engine: `scrollIntoView` is missing, and components that
// scroll a list into view after a filter change would throw on click.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom has no IntersectionObserver either: motion's `whileInView` sections
// (the invitation card, the admin entrance animations) throw when they mount.
if (!('IntersectionObserver' in globalThis)) {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}
