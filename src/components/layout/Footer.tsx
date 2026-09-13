import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { Heart, FlaskConical } from 'lucide-react';
import { useSettings } from '../../lib/settingsQuery';
import { useAppStore } from '../../stores/appStore';
import { useT, useTf } from '../shared/i18n';

export const Footer = () => {
  const t = useT();
  const tf = useTf();
  const settings = useSettings();
  const language = useAppStore((s) => s.language);
  const { data: rehearsal } = useQuery({
    queryKey: ['rehearsal-status'],
    queryFn: async () => (await fetch('/api/rehearsal')).json() as Promise<{ active: boolean }>,
    refetchInterval: 30_000,
  });

  return (
    <footer className="mt-auto py-2.5 px-4 text-center text-xs text-[#5D5449]/80 border-t border-dashed border-[#CBAE94]/60 space-y-1">
      {rehearsal?.active && (
        <p
          role="status"
          className="inline-flex items-center gap-1.5 mb-1 px-3 py-1 rounded-full bg-amber-100 border border-amber-400 text-amber-800 font-mono font-bold uppercase tracking-widest text-xs"
        >
          <FlaskConical className="w-3 h-3" />
          {t.rehearsalFooterNote}
        </p>
      )}
      <p className="font-mono text-xs uppercase tracking-widest text-[#8B735B] font-bold">
        {tf('footerCopyright', { year: String(new Date().getFullYear()), parentsNames: settings?.parentsNames?.trim() || 'Bébé Baby Shower' })}
      </p>
      <p className="flex items-center justify-center gap-1.5 text-xs text-[#5D5449]/70">
        <motion.span
          aria-hidden
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Heart className="w-2.5 h-2.5 text-rose-400 fill-rose-300" />
        </motion.span>
        {t.footerLove}
      </p>
      <button
        type="button"
        onClick={() => useAppStore.getState().toggleLanguage()}
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-[#CBAE94]/60 bg-white/60 hover:bg-[#EFE6DC] text-xs font-bold font-mono text-[#8B735B] transition-colors cursor-pointer"
        title="Switch Language / Changer de langue"
      >
        {language === 'EN' ? 'Français (FR)' : 'English (EN)'}
      </button>
    </footer>
  );
};
