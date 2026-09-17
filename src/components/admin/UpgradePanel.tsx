import { Lock } from 'lucide-react';
import { useT, useTf } from '../shared/i18n';
import type { Translations } from '../../translations';
import { PRICE_UPGRADE_DELTA_CAD, UPGRADE_URL, priceLabel } from '../../lib/pricing';
import type { Feature } from '../../lib/entitlements';

// Which existing translation names each Premium surface, for the upgrade copy.
const FEATURE_LABEL: Partial<Record<Feature, keyof Translations>> = {
  catering: 'tabCatering',
  escort: 'tabEscort',
  gifts: 'tabGifts',
  agenda: 'tabAgenda',
  dayOf: 'tabCheckIn',
  alerts: 'tabUrgentAlerts',
  guestbook: 'tabGuestbookFeed',
  photos: 'navPhotoGallery',
  seating: 'navFloorplan',
  comms: 'tabGuestRsvps',
  branding: 'tabHostSettings',
};

// Visible-but-locked, with the delta price: the host pane a Basic deploy shows
// in place of a Premium surface (§5.5).
export const UpgradePanel = ({ feature }: { feature: Feature }) => {
  const t = useT();
  const tf = useTf();
  const label = t[FEATURE_LABEL[feature] ?? 'tabHostSettings'];

  return (
    <div className="card-paper p-10 sm:p-14 text-center space-y-4 max-w-xl mx-auto">
      <div className="w-14 h-14 bg-[#E9E0D2] text-[#8B735B] rounded-full flex items-center justify-center mx-auto border-2 border-[#CBAE94]">
        <Lock className="w-6 h-6" />
      </div>
      <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#FAF6F0] border border-[#CBAE94]/40 text-xs font-bold text-[#8B735B]">
        {t.upgradeLockedBadge}
      </span>
      <h2 className="font-newsreader text-2xl sm:text-3xl font-bold text-[#4A3F35]">{t.upgradeLockedTitle}</h2>
      <p className="text-sm text-[#4A3F35]/70 font-sans leading-relaxed max-w-md mx-auto">
        {tf('upgradeLockedDesc', { feature: label, price: priceLabel(PRICE_UPGRADE_DELTA_CAD) })}
      </p>
      <a
        href={UPGRADE_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#8B735B] to-[#705C47] hover:brightness-110 text-white text-xs font-bold shadow-md transition-all active:scale-95"
      >
        {t.upgradeCta}
      </a>
    </div>
  );
};
