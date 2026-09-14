import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Globe, Baby, LayoutDashboard } from 'lucide-react';
import { useSettings } from '../../lib/settingsQuery';
import { useAppStore } from '../../stores/appStore';
import { requireAuth } from '../../lib/api';
import { useT } from '../shared/i18n';

interface HeaderProps {
  /** Render only the FR/EN toggle (guest-facing pages like /find-my-table) */
  minimal?: boolean;
  /** Set false to let an in-page bar own the sticky top (admin dashboard). */
  sticky?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ minimal = false, sticky = true }) => {
  const language = useAppStore((s) => s.language);
  const toggleLanguage = useAppStore((s) => s.toggleLanguage);
  const settings = useSettings();
  const t = useT();
  const isAuthed = requireAuth();

  const headerClass = `${
    sticky ? 'sticky top-0' : 'relative'
  } z-40 bg-[#F8F5F0]/90 backdrop-blur-md border-b border-[#4A3F35]/10 py-2.5 sm:py-3 transition-colors`;

  // Guest-facing minimal bar: no brand, no menu — just the language toggle
  if (minimal) {
    return (
      <header className={headerClass}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-end">
          <motion.button
            type="button"
            onClick={toggleLanguage}
            whileHover={{ scale: 1.05, rotate: 3 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex px-4 py-2.5 rounded-full bg-white border border-[#4A3F35]/15 hover:bg-[#E9E0D2]/50 text-[#4A3F35] text-xs font-mono font-bold items-center space-x-1.5 shadow-2xs cursor-pointer"
            title={t.switchLanguageTitle}
          >
            <Globe className="w-4 h-4" />
            <span>{language === 'EN' ? 'FR' : 'EN'}</span>
          </motion.button>
        </div>
      </header>
    );
  }

  // Admin-internal navigation lives in the dashboard sidebar; the header only
  // carries the brand, an optional way back to the dashboard, and language.
  return (
    <header className={headerClass}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">

          <Link to="/" className="flex items-center space-x-3 min-w-0 group">
            <motion.div
              className="w-10 h-10 sm:w-12 sm:h-12 bg-[#E9E0D2] border-2 border-[#4A3F35] rounded-2xl flex items-center justify-center shadow-xs shrink-0"
              whileHover={{ rotate: 12, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            >
              <Baby className="w-5 h-5 sm:w-6 sm:h-6 text-[#4A3F35]" />
            </motion.div>
            <div className="min-w-0">
              <h2 className="font-gaegu text-3xl sm:text-4xl font-bold text-[#4A3F35] leading-none truncate">
                Bébé {settings?.babyName || 'Baby Shower'}
              </h2>
              <span className="font-mono text-xs uppercase tracking-widest text-[#4A3F35]/60 block mt-0.5 truncate">
                {t.appSubtitle}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            {isAuthed && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 px-4 py-3 rounded-full bg-white border border-[#4A3F35]/15 hover:bg-[#E9E0D2]/50 text-[#4A3F35] text-xs font-bold shadow-2xs"
                title={t.navAdmin}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span className="hidden sm:inline">{t.navAdmin}</span>
              </Link>
            )}
            <motion.button
              type="button"
              onClick={toggleLanguage}
              whileHover={{ scale: 1.05, rotate: 3 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex px-4 py-3 rounded-full bg-white border border-[#4A3F35]/15 hover:bg-[#E9E0D2]/50 text-[#4A3F35] text-xs font-mono font-bold items-center space-x-1 shadow-2xs cursor-pointer"
              title={t.switchLanguageTitle}
            >
              <Globe className="w-4 h-4" />
              <span>{language === 'EN' ? 'FR' : 'EN'}</span>
            </motion.button>
          </div>

        </div>
      </div>
    </header>
  );
};
