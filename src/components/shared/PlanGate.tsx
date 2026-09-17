import React from 'react';
import { useCapabilities, planOf } from '../../lib/capabilities';
import { hasEntitlement, type Feature } from '../../lib/entitlements';
import { useAppStore } from '../../stores/appStore';
import { useT } from './i18n';
import { LockedNotice } from './LockedNotice';

// A Premium surface on a deploy that was not sold it. For guests that is a
// neutral "not available for this event" card, never an upsell (§5.5); a host
// page passes its own `locked` node. Fails closed while capabilities load, but
// renders nothing rather than flashing the neutral state at a Premium guest.
export const PlanGate = ({
  feature,
  children,
  locked,
}: {
  feature: Feature;
  children: React.ReactNode;
  locked?: React.ReactNode;
}) => {
  const caps = useCapabilities();
  const language = useAppStore((s) => s.language);
  const t = useT();

  if (caps.isPending) return null;
  if (hasEntitlement(planOf(caps.data), feature)) return <>{children}</>;
  return (
    <div className="w-full max-w-2xl mx-auto pt-6">
      {locked ?? (
        <LockedNotice title={t.featureUnavailableTitle} message={t.featureUnavailableDesc} language={language} />
      )}
    </div>
  );
};
