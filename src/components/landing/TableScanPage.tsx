import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Camera, KeyRound, AlertCircle, ArrowLeft } from 'lucide-react';
import { TableElement } from '../../types';
import { useT, useTf } from '../shared/i18n';
import { isValidCode } from '../../lib/validation';
import { decodeApiError } from '../../lib/errors';
import { floatPulse } from '../shared/motionPresets';

type Choice = 'guestbook' | 'photos';
type Status = 'idle' | 'invalid' | 'resolving' | 'notFound' | 'rateLimited';

// Spring pops for the choice cards + a staggered reveal.
const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const popVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.9 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 16 } },
};

const spring = { type: 'spring' as const, stiffness: 240, damping: 22 };

export const TableScanPage: React.FC = () => {
  const t = useT();
  const tf = useTf();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('table') || '';

  const [choice, setChoice] = useState<Choice | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);

  const { data: tables = [] } = useQuery({
    queryKey: ['floorplan-tables'],
    queryFn: async () => {
      const res = await fetch('/api/floorplan');
      const data = await res.json();
      return (data.floorMap?.tables ?? []) as TableElement[];
    },
  });
  const table = tables.find((tbl) => tbl.id === tableId);

  const destination: Record<Choice, string> = {
    guestbook: '/guestbook',
    photos: '/upload-photos',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice) return;
    const value = code.trim();
    if (!isValidCode(value)) {
      setStatus('invalid');
      setAttempt((n) => n + 1);
      return;
    }
    try {
      setStatus('resolving');
      const res = await fetch(`/api/guest/resolve?code=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (res.ok && data.magic_token) {
        const params = new URLSearchParams({ code: value });
        if (tableId) params.set('table', tableId);
        navigate(`${destination[choice]}?${params.toString()}`, { replace: true });
        return;
      }
      const { code: errCode } = decodeApiError(data, res.status);
      setStatus(errCode === 'RATE_LIMITED' ? 'rateLimited' : errCode === 'NOT_FOUND' ? 'notFound' : 'invalid');
      setAttempt((n) => n + 1);
    } catch {
      setStatus('notFound');
      setAttempt((n) => n + 1);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#F3EBE1] via-[#FAF6F0] to-[#F3EBE1] py-10 px-4 flex items-center justify-center overflow-hidden">
      {/* Drifting decorative orbs — gentle physics in the background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-[#EFE6DC] blur-3xl opacity-70"
          animate={{ x: [0, 26, 0], y: [0, 16, 0], scale: [1, 1.08, 1] }}
          transition={{ ...floatPulse, duration: 9 }}
        />
        <motion.div
          className="absolute -bottom-20 -right-16 w-64 h-64 rounded-full bg-[#E7D5BE] blur-3xl opacity-50"
          animate={{ x: [0, -22, 0], y: [0, -18, 0], scale: [1, 1.12, 1] }}
          transition={{ ...floatPulse, duration: 11 }}
        />
        <motion.div
          className="absolute top-1/3 right-1/4 w-24 h-24 rounded-full bg-amber-200/40 blur-2xl"
          animate={{ x: [0, -14, 0], y: [0, 22, 0] }}
          transition={{ ...floatPulse, duration: 7 }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="relative w-full max-w-lg bg-[#FFFDF9] rounded-3xl shadow-xl border-2 border-[#CBAE94] p-6 sm:p-8 space-y-6"
      >
        <div className="text-center space-y-2">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, ...spring }}
            className="font-gaegu text-4xl font-bold text-[#4A3F35]"
          >
            {t.scanTitle}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-[#5D5449] font-medium"
          >
            {t.scanSubtitle}
          </motion.p>
          {table && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.28, ...spring }}
              className="inline-block px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold uppercase tracking-wider"
            >
              {tf('scanAtTable', { table: table.name })}
            </motion.span>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!choice ? (
            <motion.div
              key="choice"
              variants={listVariants}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {(['guestbook', 'photos'] as Choice[]).map((key) => {
                const Icon = key === 'guestbook' ? BookOpen : Camera;
                return (
                  <motion.button
                    key={key}
                    type="button"
                    variants={popVariants}
                    whileHover={{ y: -8, scale: 1.03, rotate: key === 'guestbook' ? -1.5 : 1.5 }}
                    whileTap={{ scale: 0.95 }}
                    transition={spring}
                    onClick={() => { setChoice(key); setStatus('idle'); }}
                    className="p-6 rounded-3xl border-2 border-[#CBAE94] bg-white hover:bg-[#EFE6DC]/40 transition-colors text-center space-y-3 cursor-pointer shadow-xs"
                  >
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.12 }}
                      transition={spring}
                      className="w-14 h-14 mx-auto rounded-2xl bg-[#E9E0D2] border border-[#CBAE94] flex items-center justify-center"
                    >
                      <Icon className="w-7 h-7 text-[#8B735B]" />
                    </motion.div>
                    <h2 className="font-newsreader text-xl font-bold text-[#4A3F35]">
                      {key === 'guestbook' ? t.scanGuestbookCard : t.scanPhotosCard}
                    </h2>
                    <p className="text-xs text-[#5D5449]/80 leading-relaxed">
                      {key === 'guestbook' ? t.scanGuestbookDesc : t.scanPhotosDesc}
                    </p>
                  </motion.button>
                );
              })}
            </motion.div>
          ) : (
            <motion.form
              key="code"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={spring}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="text-center space-y-1">
                <h2 className="font-sans text-lg font-bold text-[#4A3F35]">{t.scanEnterCodeTitle}</h2>
                <p className="text-xs text-[#8B735B]">{t.scanEnterCodeHint}</p>
              </div>

              <motion.div
                key={attempt}
                animate={status !== 'idle' && status !== 'resolving' ? { x: [0, -9, 9, -6, 6, 0] } : { x: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                className="flex items-center gap-2"
              >
                <KeyRound className="w-4 h-4 text-[#8B735B] shrink-0" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/[^0-9]/g, '')); setStatus('idle'); }}
                  placeholder={t.uploadCodePlaceholder}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#CBAE94] bg-[#FAF6F0] text-sm font-bold tracking-[0.3em] text-[#4A3F35] placeholder:tracking-normal text-center focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
                />
              </motion.div>

              <AnimatePresence mode="wait">
                {(status === 'invalid' || status === 'rateLimited' || status === 'notFound') && (
                  <motion.p
                    key={status}
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={spring}
                    className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-300 rounded-xl p-3 font-sans"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {status === 'rateLimited' ? t.scanRateLimited : status === 'notFound' ? t.portalCodeNotFound : t.portalInvalidInput}
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={status === 'resolving' || !code.trim()}
                className="btn-accent w-full py-3.5 text-sm font-bold disabled:opacity-50"
              >
                {status === 'resolving' ? t.portalResolving : t.portalContinueBtn}
              </motion.button>

              <button
                type="button"
                onClick={() => { setChoice(null); setCode(''); setStatus('idle'); }}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#8B735B] hover:text-[#4A3F35] transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t.scanChooseAgainBtn}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
