import { motion } from 'motion/react';
import { Heart } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';

export const Footer = () => {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const language = useAppStore((s) => s.language);

  return (
    <footer className="mt-auto py-8 px-4 text-center text-xs text-[#5D5449]/80 border-t border-dashed border-[#CBAE94]/60 space-y-2.5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-[#8B735B] font-bold">
        {t.footerCopyright
          .replace('{{year}}', String(new Date().getFullYear()))
          .replace('{{parentsNames}}', settings?.parentsNames?.trim() || 'Bébé Baby Shower')}
      </p>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#5D5449]/70">
        <motion.span
          aria-hidden
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Heart className="w-3 h-3 text-rose-400 fill-rose-300" />
        </motion.span>
        {t.footerLove.replace(
          '{{babyName}}',
          settings?.babyName?.trim() ? `Bébé ${settings.babyName.trim()}` : t.footerCub
        )}
      </p>
      <button
        type="button"
        onClick={() => useAppStore.getState().toggleLanguage()}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#CBAE94]/60 bg-white/60 hover:bg-[#EFE6DC] text-[10px] font-bold font-mono text-[#8B735B] transition-colors cursor-pointer"
        title="Switch Language / Changer de langue"
      >
        {language === 'EN' ? 'Français (FR)' : 'English (EN)'}
      </button>
    </footer>
  );
};
