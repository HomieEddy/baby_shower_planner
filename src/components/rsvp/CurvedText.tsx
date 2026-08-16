import { useId } from 'react';

// "Baby Shower" arched along an upward curve, Canva style. Decorative:
// aria-hidden; the semantic heading lives in the card's h1.
export const CurvedText = ({ text, className = '' }: { text: string; className?: string }) => {
  const uid = useId();
  return (
    <svg
      viewBox="0 0 400 96"
      className={`w-full max-w-lg h-auto ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <path id={`${uid}-arc`} d="M18 84 Q200 -14 382 84" />
      </defs>
      <text
        fontFamily="var(--heading-font)"
        fontWeight="700"
        fontSize="54"
        fill="var(--ink)"
        letterSpacing="2.5"
      >
        <textPath href={`#${uid}-arc`} startOffset="50%" textAnchor="middle">
          {text}
        </textPath>
      </text>
    </svg>
  );
};
