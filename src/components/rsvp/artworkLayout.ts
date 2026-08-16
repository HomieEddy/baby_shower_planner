// Artwork placement — tweak the classes below to reposition/resize each
// artwork element without touching component code. All values are Tailwind
// classes (top/left/right/bottom offsets, scales, responsive prefixes).

export const artworkLayout = {
  // Satin bow perched on the arch apex
  bow: {
    wrapper: 'absolute -top-17 sm:-top-17 left-1/2 -translate-x-1/2 z-20 pointer-events-none',
    className: '',
  },
  // Top-left: floating teddy with balloon bunch
  floatingTeddy: {
    wrapper: 'absolute top-30 sm:top-16 -left-14 sm:-left-4 z-20 pointer-events-none',
    className: 'origin-top-left scale-130 sm:scale-180',
  },
  // Top-right: big heart balloon with golden string
  bigBalloon: {
    wrapper: 'absolute top-6 sm:top-4 -right-4 sm:-right-4 z-20 pointer-events-none',
    className: 'origin-top-right scale-90 sm:scale-120',
  },
  // Bottom-left: stacked BABY blocks
  blocks: {
    wrapper: 'absolute -bottom-8 -left-8 sm:-left-10 z-20 pointer-events-none',
    className: 'origin-bottom-left scale-120 sm:scale-140',
  },
  // Bottom-right: teddy on cloud with balloons
  teddyCloud: {
    wrapper: 'absolute -bottom-0 -right-10 sm:-right-10 z-20 pointer-events-none',
    className: 'origin-bottom-right scale-150 sm:scale-120',
  },
};
