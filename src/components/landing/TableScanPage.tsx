import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Camera, KeyRound, AlertCircle, ArrowLeft, Sparkles, UserCheck, MapPin, Info } from 'lucide-react';
import { TableElement } from '../../types';
import { useT, useTf } from '../shared/i18n';
import { Modal } from '../shared/Modal';
import { isValidCode } from '../../lib/validation';
import { decodeApiError } from '../../lib/errors';
import { GuestPageHeader } from '../shared/GuestPageHeader';
import {
  clearTableScanCode,
  readTableScanCode,
  saveTableScanCode,
} from '../../lib/tableScanSession';

type Choice = 'guestbook' | 'photos';
type Status = 'idle' | 'invalid' | 'resolving' | 'notFound' | 'rateLimited' | 'denied';

// Why the table portal refused a reservation (server codes from
// /api/guest/table-access). Each one gets a guiding modal.
type DenialReason = 'NOT_CHECKED_IN' | 'WRONG_TABLE' | 'TABLE_NOT_ASSIGNED' | 'NOT_ATTENDING' | 'TABLE_NOT_FOUND';
const DENIAL_REASONS: readonly string[] = ['NOT_CHECKED_IN', 'WRONG_TABLE', 'TABLE_NOT_ASSIGNED', 'NOT_ATTENDING', 'TABLE_NOT_FOUND'];
interface Denial {
  reason: DenialReason;
  code: string;
  tableName?: string;
}

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

  // A code verified earlier in this tab skips the entry step on return.
  const [savedCode, setSavedCode] = useState<string>(readTableScanCode);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [attempt, setAttempt] = useState(0);
  const [denial, setDenial] = useState<Denial | null>(null);

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

  // Push (not replace) so the browser back button returns to this menu.
  const openDestination = (kind: Choice, value: string) => {
    const params = new URLSearchParams({ code: value });
    if (tableId) params.set('table', tableId);
    navigate(`${destination[kind]}?${params.toString()}`);
  };

  // Every entry (typed or remembered code) is checked against this table:
  // the party must be checked in and seated here. A remembered code is
  // re-checked too, since the guest may have scanned a different table.
  const checkAccess = async (value: string): Promise<'ok' | Exclude<Status, 'idle' | 'resolving'>> => {
    try {
      const params = new URLSearchParams({ code: value });
      if (tableId) params.set('table', tableId);
      const res = await fetch(`/api/guest/table-access?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) return 'ok';
      const { code: errCode } = decodeApiError(data, res.status);
      if (DENIAL_REASONS.includes(errCode)) {
        const assigned = (data as { assignedTable?: { name?: unknown } }).assignedTable;
        setDenial({
          reason: errCode as DenialReason,
          code: value,
          tableName: typeof assigned?.name === 'string' ? assigned.name : undefined,
        });
        return 'denied';
      }
      return errCode === 'RATE_LIMITED' ? 'rateLimited' : errCode === 'NOT_FOUND' ? 'notFound' : 'invalid';
    } catch {
      return 'notFound';
    }
  };

  const handleCardClick = async (key: Choice) => {
    setStatus('idle');
    if (!savedCode) {
      setChoice(key);
      return;
    }
    setStatus('resolving');
    const result = await checkAccess(savedCode);
    if (result === 'ok') {
      setStatus('idle');
      openDestination(key, savedCode);
      return;
    }
    if (result === 'denied') {
      setStatus('denied');
      return;
    }
    // The remembered code stopped working (e.g. the reservation was removed):
    // forget it and ask for the code again.
    clearTableScanCode();
    setSavedCode('');
    setChoice(key);
    setStatus(result);
    setAttempt((n) => n + 1);
  };

  const forgetCode = () => {
    clearTableScanCode();
    setSavedCode('');
    setCode('');
    setStatus('idle');
  };

  const closeDenial = () => {
    setDenial(null);
    setStatus('idle');
  };

  const switchCode = () => {
    setDenial(null);
    forgetCode();
  };

  const goFromDenial = (path: string) => {
    const params = new URLSearchParams({ code: denial?.code ?? '' });
    if (tableId) params.set('table', tableId);
    setDenial(null);
    navigate(`${path}?${params.toString()}`);
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
    setStatus('resolving');
    const result = await checkAccess(value);
    if (result === 'ok') {
      saveTableScanCode(value);
      setSavedCode(value);
      openDestination(choice, value);
      return;
    }
    setStatus(result);
    if (result !== 'denied') setAttempt((n) => n + 1);
  };

  const denialCopy: Record<DenialReason, { icon: typeof Info; title: string; body: string }> = {
    NOT_CHECKED_IN: { icon: UserCheck, title: t.scanDeniedCheckInTitle, body: t.scanDeniedCheckInBody },
    WRONG_TABLE: {
      icon: MapPin,
      title: t.scanDeniedWrongTableTitle,
      body: tf('scanDeniedWrongTableBody', { table: denial?.tableName ?? '' }),
    },
    TABLE_NOT_ASSIGNED: { icon: Info, title: t.scanDeniedNoTableTitle, body: t.scanDeniedNoTableBody },
    NOT_ATTENDING: { icon: Info, title: t.scanDeniedNotAttendingTitle, body: t.scanDeniedNotAttendingBody },
    TABLE_NOT_FOUND: { icon: Info, title: t.scanDeniedTableGoneTitle, body: t.scanDeniedTableGoneBody },
  };
  const denialView = denial ? denialCopy[denial.reason] : null;

  return (
    <div className="min-h-[calc(100vh-8rem)] py-8 sm:py-14 px-4 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="card-soft w-full max-w-lg p-6 sm:p-8 space-y-6"
      >
        <GuestPageHeader icon={Sparkles} title={t.scanTitle} subtitle={t.scanSubtitle}>
          {table && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, ...spring }}
              className="inline-block mt-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold uppercase tracking-wider"
            >
              {/* Table names already read "Table N" by default, so show them as-is. */}
              {table.name}
            </motion.span>
          )}
        </GuestPageHeader>

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
                    onClick={() => handleCardClick(key)}
                    disabled={status === 'resolving'}
                    className="p-5 sm:p-6 rounded-2xl border border-[#CBAE94]/70 bg-white hover:bg-[#EFE6DC]/40 hover:border-[#CBAE94] transition-colors text-center space-y-2.5 cursor-pointer"
                  >
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.12 }}
                      transition={spring}
                      className="w-12 h-12 mx-auto rounded-2xl bg-[#EFE6DC] flex items-center justify-center"
                    >
                      <Icon className="w-6 h-6 text-[#8B735B]" />
                    </motion.div>
                    <h2 className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-tight">
                      {key === 'guestbook' ? t.scanGuestbookCard : t.scanPhotosCard}
                    </h2>
                    <p className="text-xs text-[#5D5449] leading-relaxed">
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
                <p className="text-xs text-[#5D5449]">{t.scanEnterCodeHint}</p>
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
                  aria-label={t.scanEnterCodeTitle}
                  className="w-full px-4 py-3 rounded-xl border border-[#CBAE94] bg-white text-base font-mono font-bold tracking-[0.3em] text-[#4A3F35] placeholder:tracking-normal placeholder:font-sans placeholder:font-normal text-center focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
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
                    role="alert"
                    className="notice-error"
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

        {!choice && (
          <div className="flex flex-col items-center gap-3 pt-1">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8B735B] hover:text-[#4A3F35] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t.backHomeBtn}
            </Link>
            {savedCode && (
              <button
                type="button"
                onClick={forgetCode}
                className="text-[11px] font-bold text-[#8B735B]/80 hover:text-[#4A3F35] underline underline-offset-2 transition-colors"
              >
                {t.scanNotYouBtn}
              </button>
            )}
          </div>
        )}
      </motion.div>

      <Modal
        open={!!denial}
        onClose={closeDenial}
        closeOnBackdrop
        maxWidth="sm"
        ariaLabel={denialView?.title}
      >
        {denial && denialView && (
          <div role="alertdialog" aria-labelledby="scan-denied-title" className="text-center space-y-4 py-2">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-[#EFE6DC] flex items-center justify-center">
              <denialView.icon className="w-6 h-6 text-[#8B735B]" aria-hidden />
            </div>
            <h2 id="scan-denied-title" className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-tight">
              {denialView.title}
            </h2>
            <p className="text-sm text-[#5D5449] leading-relaxed">{denialView.body}</p>
            <div className="flex flex-col gap-2 pt-1">
              {denial.reason === 'NOT_CHECKED_IN' && (
                <button type="button" onClick={() => goFromDenial('/check-in')} className="btn-accent w-full py-3 text-sm font-bold">
                  {t.scanDeniedCheckInBtn}
                </button>
              )}
              {denial.reason === 'WRONG_TABLE' && (
                <button type="button" onClick={() => goFromDenial('/find-my-table')} className="btn-accent w-full py-3 text-sm font-bold">
                  {t.scanDeniedFindTableBtn}
                </button>
              )}
              <button type="button" onClick={closeDenial} className="btn-outline-accent w-full py-2.5 text-xs font-bold">
                {t.scanDeniedCloseBtn}
              </button>
              <button
                type="button"
                onClick={switchCode}
                className="text-[11px] font-bold text-[#8B735B]/80 hover:text-[#4A3F35] underline underline-offset-2 transition-colors"
              >
                {t.scanDeniedOtherCodeBtn}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
