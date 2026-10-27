import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Ticket, AlertCircle } from 'lucide-react';
import { useT } from '../shared/i18n';
import { BackButton } from '../shared/BackButton';
import { fadeUp } from '../shared/motionPresets';
import { GuestPageHeader } from '../shared/GuestPageHeader';
import { isValidCode } from '../../lib/validation';

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
    if (!isValidCode(value)) {
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
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="w-full max-w-md mx-auto space-y-4">
      <BackButton label={t.backHomeBtn} />

      <div className="card-guest p-6 sm:p-8 space-y-6">
        <GuestPageHeader icon={Ticket} title={t.portalTitle} subtitle={t.portalSubtitle} />

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="portal-code" className="label-mono block">{t.portalInputLabel}</label>
          <input
            id="portal-code"
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setStatus('idle'); }}
            placeholder="XXXX"
            autoComplete="off"
            aria-invalid={status === 'invalid' || status === 'notFound'}
            aria-describedby={status === 'invalid' || status === 'notFound' ? 'portal-error' : undefined}
            className="w-full px-4 py-3 rounded-xl border border-[#CBAE94] focus:outline-none focus:ring-2 focus:ring-[#8B735B] text-base bg-white text-[#4A3F35] text-center font-mono font-bold tracking-widest"
          />

          {(status === 'invalid' || status === 'notFound') && (
            <p id="portal-error" role="alert" className="notice-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {status === 'invalid' ? t.portalInvalidInput : t.portalCodeNotFound}
            </p>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={status === 'resolving' || !input.trim()}
            className="btn-accent w-full py-3.5 text-sm font-bold disabled:opacity-50 gap-2"
          >
            <span>{status === 'resolving' ? t.portalResolving : t.portalContinueBtn}</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </form>
      </div>
    </motion.div>
  );
};
