import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { LayoutDashboard, BookOpen, Globe, MapPin, Sparkles, Camera } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';

export type AppTab = 'rsvp' | 'admin' | 'guestbook' | 'floorplan' | 'upload-photos' | 'photo-gallery';

interface HeaderProps {
  /** Render only the FR/EN toggle (guest-facing pages like /find-my-table) */
  minimal?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ minimal = false }) => {
  const language = useAppStore((s) => s.language);
  const toggleLanguage = useAppStore((s) => s.toggleLanguage);
  const settings = useSettingsStore((s) => s.settings);
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();

  // Guest-facing minimal bar: no brand, no menu — just the language toggle
  if (minimal) {
    return (
      <header className="sticky top-0 z-40 bg-[#F8F5F0]/90 backdrop-blur-md border-b border-[#4A3F35]/10 py-2.5 sm:py-3 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-end">
          <motion.button
            type="button"
            onClick={toggleLanguage}
            whileHover={{ scale: 1.05, rotate: 3 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex px-4 py-2.5 rounded-full bg-white border border-[#4A3F35]/15 hover:bg-[#E9E0D2]/50 text-[#4A3F35] text-xs font-mono font-bold items-center space-x-1.5 shadow-2xs cursor-pointer"
            title="Switch Language / Changer de langue"
          >
            <Globe className="w-4 h-4" />
            <span>{language === 'EN' ? 'FR' : 'EN'}</span>
          </motion.button>
        </div>
      </header>
    );
  }

  const currentTab: AppTab = location.pathname.includes('/admin') ? 'admin'
    : location.pathname.includes('/guestbook') ? 'guestbook'
    : location.pathname.includes('/seating') ? 'floorplan'
    : location.pathname.includes('/upload-photos') ? 'upload-photos'
    : location.pathname.includes('/photo-gallery') ? 'photo-gallery'
    : 'rsvp';

  const navItems = [
    { id: 'admin' as const, label: t.navAdmin, icon: LayoutDashboard, href: '/admin' },
    { id: 'floorplan' as const, label: t.navFloorplan, icon: MapPin, href: '/seating' },
    { id: 'guestbook' as const, label: t.navGuestbook, icon: BookOpen, href: '/guestbook' },
    { id: 'upload-photos' as const, label: t.navUploadPhotos, icon: Camera, href: '/upload-photos' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#F8F5F0]/90 backdrop-blur-md border-b border-[#4A3F35]/10 py-3 sm:py-4 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">

          {/* Brand row (mobile: language toggle sits next to the brand) */}
          <div className="flex items-center justify-between w-full lg:w-auto gap-3">
            <motion.div 
              onClick={() => navigate('/')}
              className="flex items-center space-x-3 cursor-pointer group"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div 
                className="w-12 h-12 bg-[#E9E0D2] border-2 border-[#4A3F35] rounded-2xl flex items-center justify-center shadow-xs"
                whileHover={{ rotate: 12, scale: 1.1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              >
                <Sparkles className="w-6 h-6 text-[#4A3F35]" />
              </motion.div>
              <div>
                <h2 className="font-gaegu text-3xl sm:text-4xl font-bold text-[#4A3F35] leading-none">
                  Bébé {settings?.babyName || 'Baby Shower'}
                </h2>
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#4A3F35]/60 block mt-0.5">
                  {t.appSubtitle}
                </span>
              </div>
            </motion.div>

            <button
              type="button"
              onClick={toggleLanguage}
              className="lg:hidden px-4 py-3 rounded-full bg-white border border-[#4A3F35]/15 hover:bg-[#E9E0D2]/50 text-[#4A3F35] text-xs font-mono font-bold flex items-center space-x-1 shadow-2xs cursor-pointer shrink-0"
              title="Switch Language / Changer de langue"
            >
              <Globe className="w-4 h-4" />
              <span>{language === 'EN' ? 'FR' : 'EN'}</span>
            </button>
          </div>

          {/* Navigation Links (mobile: horizontally scrollable row with full-size targets) */}
          <nav className="flex items-center gap-1.5 sm:gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0 justify-start no-scrollbar relative">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <motion.button
                  key={item.id}
                  onClick={() => navigate(item.href)}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className={`relative px-4 py-3 rounded-full text-xs font-semibold flex items-center space-x-1.5 cursor-pointer z-10 transition-colors whitespace-nowrap shrink-0 ${
                    isActive ? 'text-[#F8F5F0]' : 'text-[#4A3F35] hover:bg-[#E9E0D2]/40'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPill"
                      className="absolute inset-0 bg-[#4A3F35] rounded-full border border-[#4A3F35] -z-10 shadow-xs"
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    />
                  )}
                  <Icon className="w-4 h-4 z-10" />
                  <span className="z-10">{item.label}</span>
                </motion.button>
              );
            })}

            {/* Language Switcher (desktop only — mobile has it next to the brand) */}
            <motion.button
              type="button"
              onClick={toggleLanguage}
              whileHover={{ scale: 1.05, rotate: 3 }}
              whileTap={{ scale: 0.95 }}
              className="hidden lg:inline-flex px-4 py-3 rounded-full bg-white border border-[#4A3F35]/15 hover:bg-[#E9E0D2]/50 text-[#4A3F35] text-xs font-mono font-bold items-center space-x-1 shadow-2xs cursor-pointer ml-1 shrink-0"
              title="Switch Language / Changer de langue"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{language === 'EN' ? 'FR' : 'EN'}</span>
            </motion.button>
          </nav>

        </div>
      </div>
    </header>
  );
};


