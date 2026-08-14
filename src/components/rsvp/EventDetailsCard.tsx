import { ExternalLink, Clock3, MapPin } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { EmptyState } from '../shared/EmptyState';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';

export const EventDetailsCard = () => {
  const language = useAppStore((s) => s.language);
  const settings = useSettingsStore((s) => s.settings);
  const t = useT();

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

  return (
    <div className="card-paper p-8 sm:p-12 text-center mb-8 relative overflow-hidden">

      {/* Badge */}
      <div className="inline-block font-mono text-[11px] uppercase tracking-widest px-4 py-1.5 bg-[#E9E0D2] text-[#4A3F35] rounded-full font-bold mb-6 border border-[#4A3F35]/10">
        {t.eventBadge}
      </div>

      {/* Main Title */}
      <h1 className="font-newsreader text-4xl sm:text-5xl lg:text-6xl font-bold text-[#4A3F35] tracking-tight leading-tight mb-4">
        {language === 'EN'
          ? (settings.parentsNames || settings.babyName)
            ? `${settings.parentsNames || settings.babyName}'s Baby Shower.`
            : 'Baby Shower!'
          : (settings.parentsNames || settings.babyName)
            ? `Fête de Bébé de ${settings.parentsNames || settings.babyName} !`
            : 'Fête de Bébé !'}
      </h1>

      {/* Intro Description */}
      <p className="text-[#4A3F35]/70 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed mb-10 font-sans">
        {t.eventIntro}
      </p>

      {/* 3-Column Quick Metadata Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left my-8">
        <div className="bg-white border border-[#4A3F35]/15 hover:border-[#D4A373] rounded-2xl p-5 transition-colors">
          <span className="label-mono block mb-1">{t.eventDateLabel}</span>
          <p className="font-bold text-lg text-[#4A3F35] font-sans">{settings.date}</p>
        </div>

        <div className="bg-white border border-[#4A3F35]/15 hover:border-[#D4A373] rounded-2xl p-5 transition-colors">
          <span className="label-mono block mb-1">{t.eventTimeLabel}</span>
          <p className="font-bold text-lg text-[#4A3F35] font-sans">{settings.time}</p>
        </div>

        {/* Venue Card with Map Pin Button */}
        <div className="bg-white border border-[#4A3F35]/15 hover:border-[#D4A373] rounded-2xl p-5 transition-colors flex flex-col justify-between">
          <div>
            <span className="label-mono block mb-1">{t.eventVenueLabel}</span>
            <p className="font-bold text-lg text-[#4A3F35] font-sans">{settings.venueName}</p>
            <p className="text-xs text-[#4A3F35]/70 mt-0.5 font-sans leading-relaxed">{settings.venueAddress}</p>
          </div>

          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center space-x-1.5 px-3 py-2 bg-[#4A3F35] text-[#F8F5F0] hover:bg-[#D4A373] hover:text-[#4A3F35] text-xs font-bold rounded-xl font-mono transition-all shadow-2xs group w-fit"
            title={t.openMapsTitle}
          >
            <MapPin className="w-3.5 h-3.5 text-[#D4A373] group-hover:text-[#4A3F35] transition-colors" />
            <span>{t.openMapsBtn}</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
          </a>
        </div>
      </div>

      {/* Schedule Section */}
      {settings.schedule && settings.schedule.length > 0 && (
        <div className="my-10 text-left">
          <h3 className="font-newsreader text-2xl sm:text-3xl font-bold text-[#4A3F35] mb-6 flex items-center space-x-2">
            <Clock3 className="w-5 h-5 text-[#D4A373]" />
            <span>{t.scheduleTitle}</span>
          </h3>

          <div className="bg-white border border-[#4A3F35]/15 rounded-2xl p-6 divide-y divide-[#4A3F35]/10">
            {settings.schedule.map((item, idx) => {
              const showTime = settings.showScheduleTime !== false;
              const title = language === 'EN' ? item.titleEn : item.titleFr;
              const desc = language === 'EN' ? item.descEn : item.descFr;

              return (
                <div
                  key={item.id || idx}
                  className="py-3.5 first:pt-0 last:pb-0 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-baseline"
                >
                  {showTime && item.time ? (
                    <div className="sm:col-span-3 font-mono font-bold text-xs text-[#4A3F35] flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-[#EFE6DC] border border-[#CBAE94]/40 text-[#8B735B]">
                        {item.time}
                      </span>
                    </div>
                  ) : null}
                  <div className={`${showTime && item.time ? 'sm:col-span-9' : 'sm:col-span-12'} space-y-0.5`}>
                    <h4 className="font-bold text-[#4A3F35] text-sm font-sans">
                      {title}
                    </h4>
                    {desc ? (
                      <p className="text-xs text-[#4A3F35]/70 font-sans">
                        {desc}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Amazon Registry Bar */}
      {settings.registryUrl ? (
        <div className="mt-8 bg-[#E9E0D2]/60 border border-[#4A3F35]/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
          <div>
            <h4 className="font-bold text-[#4A3F35] text-base font-sans">
              {t.registryCardTitle}
            </h4>
            <p className="text-xs text-[#4A3F35]/70 font-sans">
              {t.registryCardTagline}
            </p>
          </div>
          <a
            href={settings.registryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent text-xs whitespace-nowrap shrink-0"
          >
            <span>{t.registryBtnText}</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
          </a>
        </div>
      ) : null}

    </div>
  );
};
