import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Language, EventSettings } from '../../types';
import { translations } from '../../translations';
import { QrCode, Printer, Download, MapPin, Sparkles, Globe } from 'lucide-react';
import { fadeUp, floatPulse } from '../shared/motionPresets';
import { Modal } from '../shared/Modal';

interface DayOfQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  settings?: EventSettings | null;
}

export const DayOfQrModal: React.FC<DayOfQrModalProps> = ({
  isOpen,
  onClose,
  language,
  settings,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [posterLang, setPosterLang] = useState<Language>(language);

  if (!isOpen) return null;

  const activeLang = posterLang || language;
  const t = translations[activeLang];

  const babyName = settings?.babyName || '';
  const parentsNames = settings?.parentsNames || '';
  const venue = settings?.venueName || '';
  const date = settings?.date || '';

  // Current window origin + the merged day-of page (check-in + seating)
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const targetUrl = `${currentOrigin}/find-my-table`;

  // QR code image URL via quickchart / api.qrserver
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(
    targetUrl
  )}&color=4A3F35&bgcolor=FFFDF9`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal open={isOpen} onClose={onClose} maxWidth="lg"
      wrapperClassName="print:p-0 print:bg-white print:static print:block"
      panelClassName="overflow-hidden print:border-none print:shadow-none print:bg-white print:max-w-none print:m-0"
      contentClassName="p-0 print:max-h-none print:overflow-visible"
      title={
        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
          <motion.div className="flex items-center gap-2" variants={fadeUp} initial="hidden" animate="show">
            <QrCode className="w-5 h-5 text-[#8B735B]" />
            <h3 className="font-sans text-xl font-bold text-[#4A3F35]">
              {t.posterTitle}
            </h3>
          </motion.div>

          <div className="flex items-center gap-2">
            {/* Poster Language Switcher Preset */}
            <div className="flex items-center bg-white rounded-xl p-1 border border-[#CBAE94]/60 text-xs">
              <Globe className="w-3.5 h-3.5 text-[#8B735B] ml-1.5 mr-1" />
              <button
                type="button"
                onClick={() => setPosterLang('FR')}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                  activeLang === 'FR'
                    ? 'bg-[#8B735B] text-white shadow-xs'
                    : 'text-[#8B735B] hover:bg-[#EFE6DC]'
                }`}
              >
                Français (FR)
              </button>
              <button
                type="button"
                onClick={() => setPosterLang('EN')}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all ${
                  activeLang === 'EN'
                    ? 'bg-[#8B735B] text-white shadow-xs'
                    : 'text-[#8B735B] hover:bg-[#EFE6DC]'
                }`}
              >
                English (EN)
              </button>
            </div>
          </div>
        </div>
      }>
      {/* Printable Poster Area */}
      <div ref={printRef} className="p-8 text-center space-y-6 print:p-12 print:m-0">
              <motion.div className="space-y-1" variants={fadeUp} initial="hidden" animate="show">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> {t.posterWelcome}
                </span>
                <h2 className="font-newsreader text-3xl sm:text-4xl font-bold text-[#4A3F35]">
                  {activeLang === 'FR'
                    ? (babyName ? `Baby Shower de Bébé ${babyName}` : 'Baby Shower')
                    : (babyName ? `Bébé ${babyName}'s Baby Shower` : 'Bébé Baby Shower')}
                </h2>
                <p className="text-sm font-bold text-[#8B735B]">
                  {activeLang === 'FR' ? `Célébrons ${parentsNames} • ${venue}` : `Celebrating ${parentsNames} • ${venue}`}
                </p>
              </motion.div>

              {/* QR Code Container with breathing pulse */}
              <motion.div
                className="mx-auto w-64 h-64 p-4 bg-white rounded-3xl border-4 border-[#CBAE94] shadow-md flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.7, rotate: -4 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.15 }}
              >
                <motion.img
                  src={qrImageUrl}
                  alt={t.posterScanTitle}
                  className="w-full h-full object-contain rounded-xl"
                  animate={{ scale: [1, 1.03, 1] }}
                  transition={floatPulse}
                />
              </motion.div>

              <motion.div className="space-y-2" variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.25 }}>
                <p className="font-sans text-xl font-bold text-[#4A3F35] flex items-center justify-center gap-2">
                  <span>{t.posterScanTitle}</span>
                  <motion.span
                    animate={{ rotate: [0, -12, 12, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
                  >
                    <MapPin className="w-5 h-5 text-[#8B735B]" />
                  </motion.span>
                </p>
                <p className="text-xs font-medium text-[#5D5449] max-w-sm mx-auto leading-relaxed">
                  {t.posterScanDesc}
                </p>
              </motion.div>

              <motion.div
                className="pt-2 border-t border-dashed border-[#CBAE94]/60 text-[11px] font-mono text-[#8B735B]"
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.35 }}
              >
                {date} • {t.dayOfTitle}
              </motion.div>
            </div>

            {/* Action Buttons (Hidden in print) */}
            <div className="px-6 py-4 bg-[#EFE6DC]/80 border-t border-[#CBAE94]/40 flex flex-wrap items-center justify-between gap-3 print:hidden">
              <a
                href={qrImageUrl}
                download={`bebe-${babyName || 'shower'}-dayof-qr-${activeLang.toLowerCase()}.png`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white hover:bg-[#EFE6DC] transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#8B735B]" />
                {t.downloadQr}
              </a>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#8B735B] hover:bg-[#CBAE94]/30 transition-colors cursor-pointer"
                >
                  {t.closeModal}
                </button>
                <motion.button
                  onClick={handlePrint}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-md transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  {t.printPosterBtn}
                </motion.button>
              </div>
            </div>
      </Modal>
  );
};
