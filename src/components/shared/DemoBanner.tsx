import { useCapabilities } from '../../lib/capabilities';
import { useT } from './i18n';

// The public demo says so, on every guest surface (§11). Absent on a real event.
export const DemoBanner = () => {
  const caps = useCapabilities();
  const t = useT();
  if (!caps.data?.demo) return null;

  return (
    <div
      role="status"
      className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 text-xs font-bold font-mono text-center px-4 py-2"
    >
      {t.demoBannerText}
    </div>
  );
};
