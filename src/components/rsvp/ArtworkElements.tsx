import { motion, useReducedMotion } from 'motion/react';

// Canva artwork images. The JPGs have white backgrounds, so they render with
// mix-blend-multiply to melt into the arch; the balloon PNG is transparent.

interface ArtworkProps {
  animated?: boolean;
  className?: string;
}

// ─── Top Watercolor Satin Ribbon Bow ──────────────────────────────
export const WatercolorBow = ({ animated = true, className = '' }: ArtworkProps) => {
  const reduced = useReducedMotion();
  return (
    <motion.img
      src="/artwork/bow.png"
      alt=""
      draggable={false}
      className={`w-44 md:w-52 h-auto drop-shadow-sm select-none ${className}`}
      style={{ transformOrigin: 'top center' }}
      animate={reduced || !animated ? undefined : { rotate: [0, -2.5, 0, 2.5, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

// ─── Top Left: Floating Baby Teddy Bear with Balloon Bunch ────────
export const FloatingTeddyBalloons = ({ animated = true, className = '' }: ArtworkProps) => {
  const reduced = useReducedMotion();
  return (
    <motion.img
      src="/artwork/teddy-balloons.png"
      alt=""
      draggable={false}
      className={`w-36 md:w-44 h-auto filter drop-shadow-md select-none ${className}`}
      animate={reduced || !animated ? undefined : { y: [0, -10, 0], rotate: [0, -1.5, 0, 1.5, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

// ─── Top Right: Large Pink Balloon with Hearts and Gold String ────
export const BigHeartBalloon = ({ animated = true, className = '' }: ArtworkProps) => {
  const reduced = useReducedMotion();
  return (
    <motion.img
      src="/artwork/heart-balloon-clean.png"
      alt=""
      draggable={false}
      className={`w-40 md:w-52 h-auto filter drop-shadow-md select-none ${className}`}
      animate={reduced || !animated ? undefined : { y: [0, -12, 0], rotate: [0, 1.5, 0, -1.5, 0] }}
      transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
    />
  );
};

// ─── Bottom Left: Stacked 3D Baby Blocks ("B A B Y") ──────────────
export const BabyBlocks3D = ({ className = '' }: ArtworkProps) => (
  <img
    src="/artwork/blocks.png"
    alt=""
    draggable={false}
    className={`w-40 md:w-48 h-auto filter drop-shadow-md select-none ${className}`}
  />
);

// ─── Bottom Right: Teddy on Cloud with Balloons & Stars ───────────
export const TeddyOnCloud = ({ animated = true, className = '' }: ArtworkProps) => {
  const reduced = useReducedMotion();
  return (
    <motion.img
      src="/artwork/teddy-cloud.png"
      alt=""
      draggable={false}
      className={`w-28 sm:w-44 md:w-56 h-auto filter drop-shadow-md select-none ${className}`}
      animate={reduced || !animated ? undefined : { y: [0, -6, 0] }}
      transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};
