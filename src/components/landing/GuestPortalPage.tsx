import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Ticket, AlertCircle } from 'lucide-react';
import { useT } from '../shared/i18n';
import { fadeUp } from '../shared/motionPresets';

type PortalStatus = 'idle' | 'invalid' | 'resolving' | 'notFound';

export const GuestPortalPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<PortalStatus>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();

    // Pasted magic link → go straight to the RSVP page.
    const linkToken = value.match(/rsvp\/([^/?#]+)/)?.[1];
    if (linkToken) {
      navigate(`/rsvp/${linkToken}`, { replace: true });
      return;
    }
    if (!/^\d{4}$/.test(value)) {
      setStatus('invalid');
      return;
    }

    try {
      setStatus('resolving');
      const res = await fetch(`/api/guest/resolve?code=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (res.ok && data.magic_token) {
        navigate(`/rsvp/${data.magic_token}`, { replace: true });
        return;
      }
      setStatus('notFound');
    } catch {
      setStatus('notFound');
    }
  };

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="max-w-xl mx-auto">
      <div className="card-paper p-6 sm:p-10 text-center space-y-5">
        <div className="w-14 h-14 bg-[#EFE6DC] text-[#8B735B] rounded-2xl flex items-center justify-center mx-auto border border-[#CBAE94]">
          <Ticket className="w-7 h-7" />
        </div>

        <div className="space-y-1.5">
          <h1 className="font-newsreader text-3xl font-bold text-[#4A3F35]">{t.portalTitle}</h1>
          <p className="text-xs sm:text-sm text-[#4A3F35]/70 leading-relaxed font-sans">{t.portalSubtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <label className="label-mono block">{t.portalInputLabel}</label>
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setStatus('idle'); }}
            placeholder="XXXX"
            autoComplete="off"
            className="w-full px-4 py-3 rounded-xl border border-[#4A3F35]/20 focus:outline-none focus:ring-2 focus:ring-[#4A3F35] text-sm bg-white text-[#4A3F35] text-center font-mono font-bold tracking-widest"
          />

          {status === 'invalid' && (
            <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-xl p-3 font-sans">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {t.portalInvalidInput}
            </p>
          )}
          {status === 'notFound' && (
            <p className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-300 rounded-xl p-3 font-sans">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {t.portalCodeNotFound}
            </p>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={status === 'resolving' || !input.trim()}
            className="btn-accent w-full py-3.5 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{status === 'resolving' ? t.portalResolving : t.portalContinueBtn}</span>
          </motion.button>
        </form>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-xs font-bold font-mono text-[#8B735B] hover:text-[#D4A373] inline-flex items-center gap-1 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t.portalBackBtn}
        </button>
      </div>
    </motion.div>
  );
};
