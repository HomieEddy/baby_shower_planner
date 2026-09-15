import '@testing-library/jest-dom/vitest';

// jsdom has no layout engine: `scrollIntoView` is missing, and components that
// scroll a list into view after a filter change would throw on click.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
