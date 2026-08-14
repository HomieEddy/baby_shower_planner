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
    name: 'Teddy Warmth',
    category: 'Cozy & Classic',
    bg: '#F8F5F0',
    ink: '#4A3F35',
    accent: '#D4A373',
    fontFamily: "'Gaegu', cursive",
    displayFontName: 'Gaegu (Playful Hand-Drawn)',
  },
  {
    id: 'sage-botanical',
    name: 'Sage Botanical',
    category: 'Earthy & Natural',
    bg: '#F1F5F2',
    ink: '#2A3A2F',
    accent: '#5E8B75',
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
    name: 'Sky Celestial Blue',
    category: 'Airy & Modern',
    bg: '#F0F4F8',
    ink: '#2B3E50',
    accent: '#5082A6',
    fontFamily: "'Outfit', sans-serif",
    displayFontName: 'Outfit (Clean Modern Sans)',
  },
  {
    id: 'honey-vanilla',
    name: 'Honey & Vanilla',
    category: 'Warm Sunshine',
    bg: '#FAF6EE',
    ink: '#3D3126',
    accent: '#D99B50',
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
    name: 'Terracotta Woodland',
    category: 'Boho & Warm',
    bg: '#F9F5F0',
    ink: '#3B2820',
    accent: '#C86D51',
    fontFamily: "'Quicksand', sans-serif",
    displayFontName: 'Quicksand (Friendly Rounded)',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    category: 'Fresh Coastal',
    bg: '#F0F7F7',
    ink: '#1E3A3A',
    accent: '#3B8B9B',
    fontFamily: "'Montserrat', sans-serif",
    displayFontName: 'Montserrat (Refined Geometric)',
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
    name: 'Eucalyptus & Gold',
    category: 'Luxury Celebration',
    bg: '#F4F6F4',
    ink: '#223326',
    accent: '#C5A038',
    fontFamily: "'Cinzel', serif",
    displayFontName: 'Cinzel (Royal Classical)',
  },
  {
    id: 'buttercup-sunshine',
    name: 'Buttercup Sunshine',
    category: 'Bright & Cheerful',
    bg: '#FFFDF0',
    ink: '#423820',
    accent: '#D8A020',
    fontFamily: "'Poppins', sans-serif",
    displayFontName: 'Poppins (Bold Geometric)',
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
    name: 'Vintage Linen',
    category: 'Rustic Heritage',
    bg: '#F4EBE1',
    ink: '#33281E',
    accent: '#9A6D48',
    fontFamily: "'Lora', serif",
    displayFontName: 'Lora (Warm Literary)',
  },
  {
    id: 'midnight-starlight',
    name: 'Midnight Starlight',
    category: 'Night Sky Dark',
    bg: '#0F172A',
    ink: '#F8FAFC',
    accent: '#F59E0B',
    fontFamily: "'Space Mono', monospace",
    displayFontName: 'Space Mono (Retro Tech)',
    isDark: true,
    surface: '#1E293B',
  },
];

export function getThemeById(themeId?: string): ThemePreset {
  if (!themeId) return THEME_PRESETS[0];
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
