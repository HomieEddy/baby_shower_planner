import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Guest, GuestbookEntry, EventSettings, EventAlert, GiftLog } from '../../types';
import { HostPhotoGalleryPage } from '../photos/HostPhotoGalleryPage';
import { CateringSummaryView } from './CateringSummaryView';
import { EscortCardsGenerator } from './EscortCardsGenerator';
import { ThankYouTrackerView } from './ThankYouTrackerView';
import { AdminGuestsTab } from './AdminGuestsTab';
import { GuestCheckIn } from './GuestCheckIn';
import { AdminSettingsTab } from './AdminSettingsTab';
import { AdminAlertsTab } from './AdminAlertsTab';
import { AdminGuestbookFeed } from './AdminGuestbookFeed';
import { AdminAgendaTab } from './AdminAgendaTab';
import { useToast } from '../shared/ToastContext';
import { useConfirm } from '../shared/ConfirmDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../../stores/settingsStore';
import { adminFetch } from '../../lib/api';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import {
  Users,
  Utensils,
  Tag,
  Gift,
  Heart,
  Settings,
  AlertTriangle,
  MessageSquare,
  Camera,
  Trash2,
  UserCheck,
  Menu,
  X,
  ChevronRight,
  CalendarDays,
  Copy,
  Link2,
  Check,
  FlaskConical,
  ExternalLink,
} from 'lucide-react';
import { useCopyFeedback } from '../shared/hooks';

const TABS = [
  { id: 'guests', icon: Users },
  { id: 'catering', icon: Utensils },
  { id: 'escort', icon: Tag },
  { id: 'gifts', icon: Gift },
  { id: 'agenda', icon: CalendarDays },
  { id: 'checkin', icon: UserCheck },
  { id: 'settings', icon: Settings },
  { id: 'alerts', icon: AlertTriangle },
  { id: 'guestbook', icon: MessageSquare },
  { id: 'photos', icon: Camera },
] as const;

type TabId = (typeof TABS)[number]['id'];

const TabPane = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.25 }}
  >
    {children}
  </motion.div>
);

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const language = useAppStore((s) => s.language);
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const t = useT();
  const { toast } = useToast();

  const [adminSubTab, setAdminSubTab] = useState<TabId>('guests');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Re-fetch settings with the admin token: the app-level fetch may have run
  // before login and received the scrubbed public shape (no host contact).
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const tabLabel = (id: TabId): string => {
    switch (id) {
      case 'guests': return `${t.tabGuestRsvps} (${guests.length})`;
      case 'catering': return t.tabCatering;
      case 'escort': return t.tabEscort;
      case 'gifts': return `${t.tabGifts} (${gifts.length})`;
      case 'agenda': return t.tabAgenda;
      case 'checkin': return t.tabCheckIn;
      case 'settings': return t.tabHostSettings;
      case 'alerts': return t.tabUrgentAlerts;
      case 'guestbook': return `${t.tabGuestbookFeed} (${guestbookEntries.length})`;
      case 'photos': return t.navPhotoGallery;
    }
  };

  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ['admin-overview'],
    queryFn: async () => {
      const [resGuests, resGb, resAlt, resGifts, resRehearsal] = await Promise.all([
        adminFetch('/api/guests'),
        adminFetch('/api/guestbook'),
        adminFetch('/api/alerts'),
        adminFetch('/api/gifts'),
        fetch('/api/rehearsal'),
      ]);
      return {
        guests: ((await resGuests.json()).guests ?? []) as Guest[],
        guestbookEntries: ((await resGb.json()).entries ?? []) as GuestbookEntry[],
        alerts: ((await resAlt.json()).alerts ?? []) as EventAlert[],
        gifts: ((await resGifts.json()).gifts ?? []) as GiftLog[],
        rehearsal: (await resRehearsal.json()) as {
          active: boolean;
          sample?: { name: string; code: string; magic_token: string };
          pendingToken?: string;
        },
      };
    },
  });
  const { guests, guestbookEntries, alerts, gifts, rehearsal } = overviewQuery.data ?? {
    guests: [] as Guest[],
    guestbookEntries: [] as GuestbookEntry[],
    alerts: [] as EventAlert[],
    gifts: [] as GiftLog[],
    rehearsal: { active: false } as {
      active: boolean;
      sample?: { name: string; code: string; magic_token: string };
      pendingToken?: string;
    },
  };
  const refreshOverview = async () => { await queryClient.invalidateQueries({ queryKey: ['admin-overview'] }); };

  const confirm = useConfirm();

  // Universal invitation: one /register link for the host to share.
  const { copiedKey, copy } = useCopyFeedback();
  const universalUrl = `${window.location.origin}/register`;
  const handleCopyUniversalMessage = async () => {
    try {
      const res = await adminFetch(`/api/guests/universal-message?lang=${language}`);
      const data = await res.json();
      if (data.message) {
        await copy(data.message, 'universal-msg');
        toast.love(t.messageCopiedToast);
      } else {
        toast.error(t.copyFailedToast);
      }
    } catch {
      toast.error(t.copyFailedToast);
    }
  };
  const handleCopyUniversalUrl = async () => {
    await copy(universalUrl, 'universal-url');
    toast.love(t.linkCopied);
  };

  const handleDeleteAlertRequest = async (alertId: string) => {
    const ok = await confirm({
      title: 'Delete Broadcast Alert?',
      message: 'Are you sure you want to delete this broadcast alert from the guest view?',
      confirmText: 'Delete Alert',
    });
    if (!ok) return;
    await adminFetch(`/api/alerts/${alertId}`, { method: 'DELETE' });
    refreshOverview();
    toast.info(t.alertDeletedToast);
  };

  const handleSaveSettings = async (data: Partial<EventSettings>): Promise<EventSettings> => {
    const res = await adminFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Settings save failed (${res.status})`);
    }
    const result = await res.json();
    if (result.settings) {
      setSettings(result.settings);
    }
    return result.settings;
  };


  const handleWipeData = async () => {
    const ok = await confirm({
      title: 'Clear All Data?',
      message: 'This will permanently remove all guests, guestbook entries, alerts, seating maps, photos, and gifts. Event settings (parents\' names, date, venue) are preserved. This cannot be undone.',
      confirmText: 'Yes, Clear All Data',
    });
    if (!ok) return;
    await adminFetch('/api/wipe-data', { method: 'POST' });
    refreshOverview();
    toast.success(t.wipeDbConfirm);
  };

  const handleStartRehearsal = async () => {
    const ok = await confirm({
      title: t.rehearsalStartTitle,
      message: t.rehearsalStartMsg,
      confirmText: t.rehearsalStartConfirm,
    });
    if (!ok) return;
    const res = await adminFetch('/api/rehearsal/start', { method: 'POST' });
    if (!res.ok) {
      toast.error(t.rehearsalFailedToast);
      return;
    }
    await refreshOverview();
    queryClient.invalidateQueries({ queryKey: ['rehearsal-status'] });
    toast.success(t.rehearsalStartedToast);
  };

  const handleStopRehearsal = async () => {
    const ok = await confirm({
      title: t.rehearsalEndTitle,
      message: t.rehearsalEndMsg,
      confirmText: t.rehearsalEndConfirm,
    });
    if (!ok) return;
    const res = await adminFetch('/api/rehearsal/stop', { method: 'POST' });
    if (!res.ok) {
      toast.error(t.rehearsalFailedToast);
      return;
    }
    await refreshOverview();
    queryClient.invalidateQueries({ queryKey: ['rehearsal-status'] });
    toast.success(t.rehearsalEndedToast);
  };

  const rehearsalActive = rehearsal?.active === true;
  const rehearsalLinks = rehearsalActive
    ? [
        ...(rehearsal?.pendingToken ? [{ href: `/rsvp/${rehearsal.pendingToken}`, label: t.rehearsalOpenRsvp }] : []),
        ...(rehearsal?.sample?.magic_token ? [{ href: `/find-my-table?guest=${rehearsal.sample.magic_token}`, label: t.rehearsalOpenFinder }] : []),
        { href: '/guestbook', label: t.rehearsalOpenGuestbook },
        { href: '/upload-photos', label: t.rehearsalOpenUpload },
        { href: '/register', label: t.rehearsalOpenRegister },
      ]
    : [];


  return (
    <motion.div
      variants={adminContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >

      {rehearsalActive && (
        <motion.div
          variants={adminCardVariants}
          className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
            <FlaskConical className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-mono font-bold text-amber-800 text-xs sm:text-sm">{t.rehearsalActiveBanner}</p>
              {rehearsal?.sample && (
                <p className="text-[11px] text-amber-800/90 mt-0.5">
                  {t.rehearsalSampleCode.replace('{{code}}', rehearsal.sample.code)}
                </p>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStopRehearsal}
              className="shrink-0 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white py-2 px-3 cursor-pointer"
            >
              {t.rehearsalEndBtn}
            </motion.button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-300/60">
            <span className="label-mono text-amber-700">{t.rehearsalQuickLinks}</span>
            {rehearsalLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-amber-300 text-[11px] font-bold text-amber-800 hover:bg-amber-100 transition-colors"
              >
                {link.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="label-mono mb-1">
            {t.adminCoHostControl}
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl font-bold text-[#8B735B]">
            {t.adminTitle}
          </h2>
          <p className="text-[#5D5449] text-xs sm:text-sm mt-1">
            {t.adminSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopyUniversalMessage}
            className="btn-accent text-xs sm:text-sm py-2.5 px-3.5 cursor-pointer inline-flex items-center"
            title={t.copyMessageBtn}
          >
            {copiedKey === 'universal-msg' ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
            <span>{t.copyMessageBtn} ({language})</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopyUniversalUrl}
            className="btn-outline-accent text-xs sm:text-sm py-2.5 px-3.5 cursor-pointer inline-flex items-center"
            title={t.copyLink}
          >
            {copiedKey === 'universal-url' ? <Check className="w-3.5 h-3.5 mr-1" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
            <span>{t.copyLink}</span>
          </motion.button>
          {!rehearsalActive && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleStartRehearsal}
              className="btn-outline-accent text-xs sm:text-sm py-2.5 px-3.5 cursor-pointer inline-flex items-center"
              title={t.rehearsalStartTitle}
            >
              <FlaskConical className="w-3.5 h-3.5 mr-1" />
              <span>{t.rehearsalBtn}</span>
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleWipeData}
            className="btn-outline-accent text-xs sm:text-sm py-2.5 px-3.5 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-colors cursor-pointer"
            title={t.deleteAllDataTitle}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1 text-red-600" />
            <span>{t.wipeDbBtn}</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#8B735B]" aria-label="Breadcrumb">
        <span className="text-[#A09080]">{t.adminTitle}</span>
        <ChevronRight className="w-3.5 h-3.5 text-[#CBAE94]" />
        <span className="text-[#4A3F35]">{tabLabel(adminSubTab)}</span>
      </nav>

      {/* Mobile sticky bar */}
      <div className="md:hidden sticky top-0 z-30 bg-[#FDFBF7]/95 backdrop-blur-sm border border-[#CBAE94]/40 rounded-2xl px-3 py-2 flex items-center justify-between shadow-2xs">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-xl hover:bg-[#EFE6DC] text-[#4A3F35] transition-colors cursor-pointer"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-xs font-bold font-mono text-[#4A3F35] truncate px-2">{tabLabel(adminSubTab)}</span>
        <span className="w-9" />
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar backdrop (mobile) */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
            />
          )}
        </AnimatePresence>

        {/* Sidebar nav */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:w-56 md:shrink-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="h-full md:h-auto bg-[#FFFDF9] border-r border-[#CBAE94]/40 md:border md:rounded-2xl md:shadow-xs p-3 space-y-1 overflow-y-auto">
            <div className="md:hidden flex items-center justify-between px-2 pb-2 mb-2 border-b border-[#CBAE94]/30">
              <span className="label-mono">{t.adminTitle}</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-3 rounded-lg hover:bg-[#EFE6DC] text-[#5D5449] transition-colors cursor-pointer"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = adminSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setAdminSubTab(tab.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-xs font-bold font-mono text-left transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#8B735B] text-white shadow-xs'
                      : 'text-[#5D5449] hover:bg-[#EFE6DC]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${tab.id === 'alerts' && !isActive ? 'text-amber-500' : ''}`} />
                  <span className="truncate flex-1">{tabLabel(tab.id)}</span>
                  {tab.id === 'alerts' && alerts.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold shrink-0">
                      {alerts.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content column */}
        <div className="flex-1 min-w-0 space-y-6">

      {adminSubTab === 'guests' && (
        <AdminGuestsTab
          language={language}
          t={t}
          guests={guests}
          onRefresh={refreshOverview}
        />
      )}

      {adminSubTab === 'settings' && (
        <AdminSettingsTab
          key={settings ? 'configured' : 'unconfigured'}
          language={language}
          t={t}
          settings={settings}
          onSave={handleSaveSettings}
        />
      )}

      {adminSubTab === 'alerts' && (
        <AdminAlertsTab
          language={language}
          t={t}
          guests={guests}
          alerts={alerts}
          settings={settings}
          onRefresh={refreshOverview}
          onDeleteAlert={handleDeleteAlertRequest}
        />
      )}

      {adminSubTab === 'guestbook' && (
        <AdminGuestbookFeed entries={guestbookEntries} onRefresh={refreshOverview} />
      )}

      {adminSubTab === 'photos' && (
        <TabPane>
          <HostPhotoGalleryPage />
        </TabPane>
      )}

      {adminSubTab === 'checkin' && (
        <TabPane>
          <GuestCheckIn />
        </TabPane>
      )}

      {adminSubTab === 'catering' && (
        <TabPane>
          <CateringSummaryView guests={guests} />
        </TabPane>
      )}

      {adminSubTab === 'escort' && (
        <TabPane>
          <EscortCardsGenerator guests={guests} settings={settings} />
        </TabPane>
      )}

      {adminSubTab === 'gifts' && (
        <TabPane>
          <ThankYouTrackerView gifts={gifts} guests={guests} settings={settings} onRefreshData={refreshOverview} />
        </TabPane>
      )}

      {adminSubTab === 'agenda' && (
        <TabPane>
          <AdminAgendaTab
            language={language}
            t={t}
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        </TabPane>
      )}

        </div>
      </div>
    </motion.div>
  );
};

