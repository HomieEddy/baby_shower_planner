import type { CustomTheme } from './types';

export interface ThemePreset {
  id: string;
  name: string;
  category: string;
  bg: string;       // Color 1: Background
  ink: string;      // Color 2: Main Text / Ink
  accent: string;   // Color 3: Accent / Highlight
  fontFamily: string; // Font Family for Headings & Branding
  displayFontName: string; // Friendly font name label
  isDark?: boolean;
  surface?: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'teddy-warmth',
    name: 'Blush Teddy',
    category: 'Cozy & Classic',
    bg: '#FBF2F3',
    ink: '#4A3A3D',
    accent: '#D99A9A',
    fontFamily: "'Gaegu', cursive",
    displayFontName: 'Gaegu (Playful Hand-Drawn)',
  },
  {
    id: 'sage-botanical',
    name: 'Sage & Rose',
    category: 'Earthy & Natural',
    bg: '#F2F4F1',
    ink: '#333B35',
    accent: '#C98A9B',
    fontFamily: "'Cormorant Garamond', serif",
    displayFontName: 'Cormorant Garamond (Elegant Serif)',
  },
  {
    id: 'dusty-rose',
    name: 'Dusty Rose Nursery',
    category: 'Soft Floral',
    bg: '#FBF5F5',
    ink: '#4A3238',
    accent: '#C88E9B',
    fontFamily: "'Playfair Display', serif",
    displayFontName: 'Playfair Display (Chic Serif)',
  },
  {
    id: 'sky-celestial',
    name: 'Powder Periwinkle',
    category: 'Airy & Modern',
    bg: '#F2F2FA',
    ink: '#3A3A50',
    accent: '#9A8FC4',
    fontFamily: "'Quicksand', sans-serif",
    displayFontName: 'Quicksand (Friendly Rounded)',
  },
  {
    id: 'honey-vanilla',
    name: 'Peach Cream',
    category: 'Warm Sunshine',
    bg: '#FBF4EE',
    ink: '#4A3A30',
    accent: '#E0A3A3',
    fontFamily: "'Caveat', cursive",
    displayFontName: 'Caveat (Warm Script)',
  },
  {
    id: 'lavender-dreams',
    name: 'Lavender Dreams',
    category: 'Pastel Dream',
    bg: '#F6F4F9',
    ink: '#362B48',
    accent: '#8E6DCB',
    fontFamily: "'Newsreader', serif",
    displayFontName: 'Newsreader (Editorial Serif)',
  },
  {
    id: 'terracotta-woodland',
    name: 'Rosewood Mauve',
    category: 'Boho & Warm',
    bg: '#F9F1F1',
    ink: '#433033',
    accent: '#B76E79',
    fontFamily: "'Quicksand', sans-serif",
    displayFontName: 'Quicksand (Friendly Rounded)',
  },
  {
    id: 'ocean-breeze',
    name: 'Sea Pearl',
    category: 'Fresh Coastal',
    bg: '#F0F6F7',
    ink: '#2E3B40',
    accent: '#7FA8B8',
    fontFamily: "'Parisienne', cursive",
    displayFontName: 'Parisienne (Delicate Script)',
  },
  {
    id: 'peachy-blossom',
    name: 'Peachy Blossom',
    category: 'Sweet & Playful',
    bg: '#FFF6F2',
    ink: '#4A2E2B',
    accent: '#E58A69',
    fontFamily: "'Dancing Script', cursive",
    displayFontName: 'Dancing Script (Flowing Cursive)',
  },
  {
    id: 'modern-slate',
    name: 'Modern Slate',
    category: 'Minimalist',
    bg: '#F5F6F8',
    ink: '#1A202C',
    accent: '#4A5568',
    fontFamily: "'Inter', sans-serif",
    displayFontName: 'Inter (Crisp Minimalist)',
  },
  {
    id: 'eucalyptus-gold',
    name: 'Rose Gold',
    category: 'Luxury Celebration',
    bg: '#F8F3F3',
    ink: '#3A2F32',
    accent: '#B76E79',
    fontFamily: "'Playfair Display', serif",
    displayFontName: 'Playfair Display (Chic Serif)',
  },
  {
    id: 'buttercup-sunshine',
    name: 'Buttercup Blush',
    category: 'Bright & Cheerful',
    bg: '#FFF9EE',
    ink: '#453A28',
    accent: '#E0A3A0',
    fontFamily: "'Great Vibes', cursive",
    displayFontName: 'Great Vibes (Delicate Calligraphy)',
  },
  {
    id: 'cotton-candy',
    name: 'Sweet Cotton Candy',
    category: 'Whimsical',
    bg: '#FAEFF5',
    ink: '#3D2132',
    accent: '#61A0EF',
    fontFamily: "'Sacramento', cursive",
    displayFontName: 'Sacramento (Delicate Calligraphy)',
  },
  {
    id: 'vintage-linen',
    name: 'Vintage Blush',
    category: 'Rustic Heritage',
    bg: '#F6EDEB',
    ink: '#3C2F33',
    accent: '#A87C85',
    fontFamily: "'Lora', serif",
    displayFontName: 'Lora (Warm Literary)',
  },
];

export const CUSTOM_THEME_ID = 'custom';

export const FONT_OPTIONS: { fontFamily: string; label: string }[] = [
  { fontFamily: "'Gaegu', cursive", label: 'Gaegu (Playful Hand-Drawn)' },
  { fontFamily: "'Cormorant Garamond', serif", label: 'Cormorant Garamond (Elegant Serif)' },
  { fontFamily: "'Playfair Display', serif", label: 'Playfair Display (Chic Serif)' },
  { fontFamily: "'Quicksand', sans-serif", label: 'Quicksand (Friendly Rounded)' },
  { fontFamily: "'Caveat', cursive", label: 'Caveat (Warm Script)' },
  { fontFamily: "'Newsreader', serif", label: 'Newsreader (Editorial Serif)' },
  { fontFamily: "'Dancing Script', cursive", label: 'Dancing Script (Flowing Cursive)' },
  { fontFamily: "'Sacramento', cursive", label: 'Sacramento (Delicate Calligraphy)' },
  { fontFamily: "'Lora', serif", label: 'Lora (Warm Literary)' },
  { fontFamily: "'Inter', sans-serif", label: 'Inter (Crisp Minimalist)' },
  { fontFamily: "'Space Mono', monospace", label: 'Space Mono (Retro Tech)' },
  { fontFamily: "'Great Vibes', cursive", label: 'Great Vibes (Delicate Calligraphy)' },
  { fontFamily: "'Parisienne', cursive", label: 'Parisienne (Delicate Script)' },
  { fontFamily: "'Cinzel', serif", label: 'Cinzel (Royal Classical)' },
  { fontFamily: "'Montserrat', sans-serif", label: 'Montserrat (Refined Geometric)' },
  { fontFamily: "'Poppins', sans-serif", label: 'Poppins (Bold Geometric)' },
  { fontFamily: "'Outfit', sans-serif", label: 'Outfit (Clean Modern Sans)' },
];

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  fontFamily: "'Gaegu', cursive",
  bg: '#FBF2F3',
  ink: '#4A3A3D',
  accent: '#D99A9A',
};

export function getCustomTheme(custom?: CustomTheme, name = 'Custom Theme', category = 'Custom'): ThemePreset {
  const c = custom ?? DEFAULT_CUSTOM_THEME;
  const font = FONT_OPTIONS.find((f) => f.fontFamily === c.fontFamily);
  return {
    id: CUSTOM_THEME_ID,
    name,
    category,
    bg: c.bg,
    ink: c.ink,
    accent: c.accent,
    fontFamily: c.fontFamily,
    displayFontName: font?.label || c.fontFamily,
  };
}

export function getThemeById(themeId?: string, customTheme?: CustomTheme): ThemePreset {
  if (!themeId) return THEME_PRESETS[0];
  if (themeId === CUSTOM_THEME_ID) return getCustomTheme(customTheme);
  const found = THEME_PRESETS.find((t) => t.id === themeId);
  return found || THEME_PRESETS[0];
}

export function isColorDark(hexColor: string): boolean {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

export function getContrastTextColor(hexColor: string): string {
  return isColorDark(hexColor) ? '#F8FAFC' : '#0F172A';
}

export function applyThemeToDocument(theme: ThemePreset) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const dark = theme.isDark || isColorDark(theme.bg);
  const surface = theme.surface || (dark ? '#1E293B' : '#FFFFFF');
  const inputBg = dark ? '#0F172A' : '#FFFFFF';

  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--ink', theme.ink);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--surface', surface);
  root.style.setProperty('--input-bg', inputBg);
  root.style.setProperty('--heading-font', theme.fontFamily);

  if (dark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  // Set body background and color directly
  document.body.style.backgroundColor = theme.bg;
  document.body.style.color = theme.ink;
}
