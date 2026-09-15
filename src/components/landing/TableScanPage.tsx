import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Camera, KeyRound, AlertCircle, ArrowLeft } from 'lucide-react';
import { TableElement } from '../../types';
import { useT, useTf } from '../shared/i18n';
import { isValidCode } from '../../lib/validation';
import { decodeApiError } from '../../lib/errors';

type Choice = 'guestbook' | 'photos';
type Status = 'idle' | 'invalid' | 'resolving' | 'notFound' | 'rateLimited';

export const TableScanPage: React.FC = () => {
  const t = useT();
  const tf = useTf();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableId = searchParams.get('table') || '';

  const [choice, setChoice] = useState<Choice | null>(null);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');

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
    } catch {
      setStatus('notFound');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3EBE1] via-[#FAF6F0] to-[#F3EBE1] py-10 px-4 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-[#FFFDF9] rounded-3xl shadow-xl border-2 border-[#CBAE94] p-6 sm:p-8 space-y-6"
      >
        <div className="text-center space-y-2">
          <h1 className="font-gaegu text-4xl font-bold text-[#4A3F35]">{t.scanTitle}</h1>
          <p className="text-sm text-[#5D5449] font-medium">{t.scanSubtitle}</p>
          {table && (
            <span className="inline-block px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold uppercase tracking-wider">
              {tf('scanAtTable', { table: table.name })}
            </span>
          )}
        </div>

        {!choice ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['guestbook', 'photos'] as Choice[]).map((key) => {
              const Icon = key === 'guestbook' ? BookOpen : Camera;
              return (
                <motion.button
                  key={key}
                  type="button"
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setChoice(key); setStatus('idle'); }}
                  className="p-6 rounded-3xl border-2 border-[#CBAE94] bg-white hover:bg-[#EFE6DC]/40 transition-colors text-center space-y-3 cursor-pointer"
                >
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E9E0D2] border border-[#CBAE94] flex items-center justify-center">
                    <Icon className="w-7 h-7 text-[#8B735B]" />
                  </div>
                  <h2 className="font-newsreader text-xl font-bold text-[#4A3F35]">
                    {key === 'guestbook' ? t.scanGuestbookCard : t.scanPhotosCard}
                  </h2>
                  <p className="text-xs text-[#5D5449]/80 leading-relaxed">
                    {key === 'guestbook' ? t.scanGuestbookDesc : t.scanPhotosDesc}
                  </p>
                </motion.button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="font-sans text-lg font-bold text-[#4A3F35]">{t.scanEnterCodeTitle}</h2>
              <p className="text-xs text-[#8B735B]">{t.scanEnterCodeHint}</p>
            </div>

            <div className="flex items-center gap-2">
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
            </div>

            {(status === 'invalid' || status === 'rateLimited' || status === 'notFound') && (
              <p className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-300 rounded-xl p-3 font-sans">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {status === 'rateLimited' ? t.scanRateLimited : status === 'notFound' ? t.portalCodeNotFound : t.portalInvalidInput}
              </p>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
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
          </form>
        )}
      </motion.div>
    </div>
  );
};
