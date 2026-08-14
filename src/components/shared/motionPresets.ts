import type { Variants, Transition } from 'motion/react';

// ─── Brand Motion Identity (Playful-Premium) ─────────────────────
// Signature easing: ease-out-back for entrances, spring for pops
// Durations: quick 150ms / standard 300ms / dramatic 500ms

export const easeOutBack = [0.175, 0.885, 0.32, 1.275] as const;
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export const cardStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const cardItem: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: easeOutBack },
  },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 12 },
  },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: easeOutExpo } },
};

export const floatPulse: Transition = {
  duration: 2.2,
  repeat: Infinity,
  repeatType: 'mirror',
  ease: 'easeInOut',
};
