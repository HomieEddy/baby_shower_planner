import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ExternalLink, Clock3, MapPin, Gift, UserRound, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { parse, format } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { useSettingsStore } from '../../stores/settingsStore';
import { EmptyState } from '../shared/EmptyState';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
import { cardStagger, cardItem, fadeUp } from '../shared/motionPresets';
import { parseToYmd } from '../../lib/dateUtils';
import {
  WatercolorBow,
  FloatingTeddyBalloons,
  BigHeartBalloon,
  BabyBlocks3D,
  TeddyOnCloud,
} from './ArtworkElements';
import { artworkLayout } from './artworkLayout';
import { CurvedText } from './CurvedText';

// "Eddy & Nana" / "Eddy et Nana" → [Eddy, Nana]; null when not splittable.
function splitParents(names: string): [string, string] | null {
  const m = names.match(/\s+(?:&|et)\s+/i);
  if (!m) return null;
  const [a, b] = names.split(m[0]);
  return a.trim() && b.trim() ? [a.trim(), b.trim()] : null;
}

// settings.date is a display string (e.g. "Saturday, October 24, 2026").
// When parseable, split it into the invitation's triple badge parts.
function deriveDateParts(dateStr: string, lang: 'EN' | 'FR') {
  const locale = lang === 'FR' ? fr : enUS;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const ymd = parseToYmd(dateStr);
  if (ymd) {
    const d = parse(ymd, 'yyyy-MM-dd', new Date());
    if (!isNaN(d.getTime())) {
      return {
        weekday: cap(format(d, 'EEEE', { locale })),
        month: cap(format(d, 'MMMM', { locale })),
        day: format(d, 'd', { locale }),
        year: format(d, 'yyyy', { locale }),
      };
    }
  }
  return { weekday: '', month: '', day: '', year: '' };
}

export const EventDetailsCard = ({
  hideGuestLogin = false,
  actions = null,
  showProgram = false,
  status = null,
}: {
  hideGuestLogin?: boolean;
  actions?: ReactNode;
  /** Slide 2 (schedule) is only for guests who confirmed they're coming. */
  showProgram?: boolean;
  /** Guest RSVP status shown instead of the invitation kicker. */
  status?: { label: string; tone: 'attending' | 'declined' | 'pending' } | null;
}) => {
  const language = useAppStore((s) => s.language);
  const settings = useSettingsStore((s) => s.settings);
  const t = useT();
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  if (!settings) {
    return (
      <div className="card-paper p-8 sm:p-12 text-center mb-8">
        <EmptyState
          type="generic"
          title={t.eventDetailsSoonTitle}
          description={t.eventDetailsSoonMsg}
        />
      </div>
    );
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    settings.venueAddress
  )}`;
  const parents = (settings.parentsNames || settings.babyName || '').trim();
  const parentsSplit = splitParents(parents);
  const dateParts = deriveDateParts(settings.date, language);

  // One orchestrated entrance: sections stagger in on first view (also fires
  // when the RSVP carousel's event tab slides into view). Reduced motion
  // renders everything statically.
  const revealProps = reduced
    ? {}
    : { initial: 'hidden' as const, whileInView: 'show' as const, viewport: { once: true, amount: 0.15 } as const };

  const ink = { color: 'var(--ink)' };
  const headingFont = { fontFamily: 'var(--heading-font)' };
  const hasProgram = showProgram && (settings.schedule?.length ?? 0) > 0;

  const goToSlide = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  };

  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <motion.div variants={cardStagger} {...revealProps} className="relative mb-8 -mx-4 sm:mx-0">
      {/* Persistent arch frame — the inner content slides horizontally.
          Slide 1 = invitation details, slide 2 = schedule of the day. */}
      <motion.section
        variants={cardItem}
        className="relative flex flex-col min-h-[calc(100vh-9.5rem)] sm:min-h-0 rounded-[36px] sm:rounded-[44px] px-2.5 sm:px-5 pt-9 sm:pt-12 pb-2.5 sm:pb-5 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #FFF1F4 0%, #FFE4EC 50%, #FFD6E2 100%)' }}
      >
        {/* dot texture, theme accent */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: 'radial-gradient(var(--accent) 0.75px, transparent 0.75px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div
          className="relative flex-1 flex flex-col rounded-t-[110px] sm:rounded-t-[170px] rounded-b-[24px] px-3 sm:px-10 pt-9 sm:pt-16 pb-4 sm:pb-10 text-center"
          style={{
            border: '3px solid var(--accent)',
            boxShadow: '0 10px 40px -12px rgba(180,80,110,0.2)',
          }}
        >
          {/* Watercolor invitation background */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-t-[110px] sm:rounded-t-[170px] rounded-b-[24px] overflow-hidden pointer-events-none"
          >
            <img
              src="/artwork/watercolor-bg.jpg"
              alt=""
              draggable={false}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Satin bow perched on the arch apex */}
          <div className={artworkLayout.bow.wrapper}>
            <WatercolorBow className={artworkLayout.bow.className} />
          </div>

          {/* Corner artwork */}
          <div className={artworkLayout.floatingTeddy.wrapper}>
            <FloatingTeddyBalloons className={artworkLayout.floatingTeddy.className} />
          </div>
          <div className={artworkLayout.bigBalloon.wrapper}>
            <BigHeartBalloon className={artworkLayout.bigBalloon.className} />
          </div>
          <div className={artworkLayout.blocks.wrapper}>
            <BabyBlocks3D className={artworkLayout.blocks.className} />
          </div>
          <div className={artworkLayout.teddyCloud.wrapper}>
            <TeddyOnCloud className={artworkLayout.teddyCloud.className} />
          </div>

          {/* Sliding content */}
          <div className="relative z-20 flex-1 flex flex-col min-h-0">
            <div
              ref={trackRef}
              onScroll={handleScroll}
              className="flex-1 flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
            >
              {/* ─── Slide 1: invitation details ─────────────────────── */}
              <div className="snap-center shrink-0 w-full flex flex-col items-center">
                {status ? (
                  <span
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/85 border border-[#CBAE94] shadow-sm text-[11px] font-mono font-bold uppercase tracking-widest"
                    style={ink}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        status.tone === 'attending'
                          ? 'bg-emerald-500'
                          : status.tone === 'declined'
                          ? 'bg-rose-500'
                          : 'bg-amber-400'
                      }`}
                    />
                    {status.label}
                  </span>
                ) : (
                  <p
                    className="text-base sm:text-xl font-bold tracking-[0.18em] uppercase"
                    style={{ ...ink, ...headingFont, opacity: 0.8 }}
                  >
                    {t.youAreInvitedLabel}
                  </p>
                )}

                <CurvedText text="Baby Shower" className="-my-2 sm:-my-3" />

                <p className="text-base sm:text-lg font-bold tracking-wider italic" style={{ ...ink, ...headingFont, opacity: 0.75 }}>
                  {t.celebratingLabel}
                </p>

                <div className="px-2">
                  {parentsSplit ? (
                    <>
                      <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight" style={ink}>
                        {parentsSplit[0]}
                      </h1>
                      <div className="text-2xl sm:text-3xl font-bold italic my-0.5" style={{ color: 'var(--accent)', ...headingFont }}>
                        &
                      </div>
                      <h2 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight" style={ink}>
                        {parentsSplit[1]}
                      </h2>
                    </>
                  ) : (
                    <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight px-2" style={ink}>
                      {parents}
                    </h1>
                  )}
                </div>

                <p className="text-base sm:text-lg italic leading-snug max-w-md px-2 pt-1" style={{ ...ink, ...headingFont, opacity: 0.75 }}>
                  {t.eventIntro}
                </p>

                {/* Spacer: pushes the date badge to the vertical center */}
                <div className="flex-[0.2] min-h-2" aria-hidden />

                {/* Date · time triple badge (centered) */}
                {settings.date ? (
                  dateParts.month ? (
                    <div className="w-full max-w-[360px] sm:max-w-[430px] flex items-center justify-between my-2 sm:my-3 pt-2">
                      <div className="flex-1 py-1.5 text-center border-y-2" style={{ borderColor: 'var(--accent)' }}>
                        <span className="text-base sm:text-lg font-bold tracking-wide" style={{ ...ink, ...headingFont }}>
                          {dateParts.weekday}
                        </span>
                      </div>
                      <div className="px-3 sm:px-5 flex flex-col items-center justify-center min-w-[74px]">
                        <span className="text-sm sm:text-base font-bold uppercase tracking-widest" style={{ ...ink, ...headingFont, opacity: 0.7 }}>
                          {dateParts.month}
                        </span>
                    <span className="text-3xl sm:text-5xl font-extrabold leading-none my-0.5" style={{ ...ink, ...headingFont }}>
                      {dateParts.day}
                    </span>
                        <span className="text-sm sm:text-base font-bold tracking-wider" style={{ ...ink, ...headingFont, opacity: 0.7 }}>
                          {dateParts.year}
                        </span>
                      </div>
                      <div className="flex-1 py-1.5 text-center border-y-2" style={{ borderColor: 'var(--accent)' }}>
                        <span className="text-base sm:text-lg font-bold tracking-wide whitespace-nowrap" style={{ ...ink, ...headingFont }}>
                          {settings.time}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="w-full max-w-[360px] flex items-center justify-center gap-4 border-y-2 py-2 my-2 sm:my-3"
                      style={{ borderColor: 'var(--accent)' }}
                    >
                      <span className="text-lg sm:text-xl font-bold" style={{ ...ink, ...headingFont }}>
                        {settings.date}
                      </span>
                      {settings.time ? (
                        <span className="text-lg sm:text-xl font-bold" style={{ ...ink, ...headingFont }}>
                          {settings.time}
                        </span>
                      ) : null}
                    </div>
                  )
                ) : null}

                {/* Spacer: pushes the venue toward 75% of the card height */}
                <div className="flex-[0.5] min-h-2" aria-hidden />

                {/* Bottom cluster: venue · portal */}
                <div className="w-full flex flex-col items-center space-y-1.5 sm:space-y-2.5">

                {/* Location */}
                <div className="flex flex-col items-center justify-center space-y-0.5 pt-1">
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t.openMapsTitle}
                    className="group inline-flex items-center gap-1.5 text-lg sm:text-xl font-bold tracking-wide hover:underline"
                    style={{ ...ink, ...headingFont }}
                  >
                    <MapPin className="w-4 h-4 opacity-70 group-hover:opacity-100" style={{ color: 'var(--accent)' }} />
                    <span>{settings.venueName}</span>
                  </a>
                  {settings.venueAddress ? (
                    <p className="text-sm sm:text-base italic" style={{ ...ink, ...headingFont, opacity: 0.7 }}>
                      {settings.venueAddress}
                    </p>
                  ) : null}
                </div>

                {/* Baby registry (4th action) */}
                {settings.registryUrl ? (
                  <a
                    href={settings.registryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-accent mt-2 text-xs"
                  >
                    <Gift className="w-3.5 h-3.5 mr-1.5" />
                    <span>{t.registryBtnText}</span>
                    <ExternalLink className="w-3 h-3 ml-1.5" />
                  </a>
                ) : null}

                {/* Guest portal (hidden inside the RSVP flow — already logged in) */}
                {!hideGuestLogin ? (
                  <button
                    type="button"
                    onClick={() => navigate('/portal')}
                    className="btn-accent mt-2 text-xs"
                  >
                    <UserRound className="w-3.5 h-3.5 mr-1.5" />
                    <span>{t.landingGuestBtn}</span>
                  </button>
                ) : null}

                {/* Keeps the venue at ~75% of the card height on phones */}
                <div className="h-8 sm:hidden" aria-hidden />
                </div>
              </div>

              {/* ─── Slide 2: schedule of the day ────────────────────── */}
              {hasProgram ? (
                <motion.div
                  variants={cardStagger}
                  {...revealProps}
                  className="snap-center shrink-0 w-full text-left"
                >
                  <div className="space-y-4 sm:space-y-6 origin-top scale-90 sm:scale-100">
                  <motion.div variants={fadeUp} className="text-center">
                    <h3
                      className="text-2xl sm:text-3xl font-bold inline-flex items-center justify-center gap-2.5"
                      style={ink}
                    >
                      <Clock3 className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: 'var(--accent)' }} />
                      <span>{t.scheduleTitle}</span>
                    </h3>
                  </motion.div>

                  {settings.schedule && settings.schedule.length > 0 ? (
                    <motion.ol variants={cardStagger} className="relative space-y-4 sm:space-y-6 max-w-md mx-auto p-4 sm:p-6">
                      <div className="absolute left-[15px] top-6 bottom-6 w-px bg-[#CBAE94]/60" aria-hidden />
                      {settings.schedule.map((item, idx) => {
                        const showTime = settings.showScheduleTime !== false;
                        const title = language === 'EN' ? item.titleEn : item.titleFr;
                        const desc = language === 'EN' ? item.descEn : item.descFr;

                        return (
                          <motion.li key={item.id || idx} variants={fadeUp} className="relative flex items-start gap-4">
                            <span className="relative z-10 shrink-0 w-8 h-8 rounded-full border-2 border-[#CBAE94] bg-white flex items-center justify-center">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#D4A373]" />
                            </span>
                            <div className="pt-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                {showTime && item.time ? (
                                  <span className="px-2 py-0.5 rounded-md bg-[#EFE6DC] border border-[#CBAE94]/40 text-[#8B735B] font-mono font-bold text-[11px]">
                                    {item.time}
                                  </span>
                                ) : null}
                                <h4 className="font-bold text-[#4A3F35] text-base sm:text-lg font-sans">{title}</h4>
                              </div>
                              {desc ? (
                                <p className="text-sm sm:text-base text-[#4A3F35]/80 mt-1 leading-relaxed font-sans">{desc}</p>
                              ) : null}
                            </div>
                          </motion.li>
                        );
                      })}
                    </motion.ol>
                  ) : null}
                  </div>
                </motion.div>
              ) : null}
            </div>

            {/* Guest actions (only rendered for guests with a valid link) */}
            {actions ? (
              <div className="mt-3 flex items-center justify-center">{actions}</div>
            ) : null}
          </div>
        </div>
      </motion.section>

      {/* ─── Carousel controls ─────────────────────────────────────── */}
      {hasProgram ? (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            type="button"
            onClick={() => goToSlide(0)}
            disabled={active === 0}
            aria-label={t.prevSlideBtn}
            className="w-9 h-9 rounded-full border-2 border-[#CBAE94] bg-white text-[#8B735B] hover:bg-[#EFE6DC] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => goToSlide(i)}
              tabIndex={-1}
              aria-hidden
              className={`h-2.5 rounded-full transition-all cursor-pointer ${
                active === i ? 'w-6 bg-[#D4A373]' : 'w-2.5 bg-[#CBAE94]/60 hover:bg-[#CBAE94]'
              }`}
            />
          ))}
          <button
            type="button"
            onClick={() => goToSlide(1)}
            disabled={active === 1}
            aria-label={t.nextSlideBtn}
            className="w-9 h-9 rounded-full border-2 border-[#CBAE94] bg-white text-[#8B735B] hover:bg-[#EFE6DC] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </motion.div>
  );
};
