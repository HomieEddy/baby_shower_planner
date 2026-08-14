import React, { useState } from 'react';
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
import { useToast } from '../shared/ToastContext';
import { useConfirm } from '../shared/ConfirmDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../../stores/settingsStore';
import { adminFetch } from '../../lib/api';
import { motion, AnimatePresence, Variants } from 'motion/react';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
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
  Sparkles,
  UserCheck,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

const TABS = [
  { id: 'guests', icon: Users },
  { id: 'catering', icon: Utensils },
  { id: 'escort', icon: Tag },
  { id: 'gifts', icon: Gift },
  { id: 'checkin', icon: UserCheck },
  { id: 'settings', icon: Settings },
  { id: 'alerts', icon: AlertTriangle },
  { id: 'guestbook', icon: MessageSquare },
  { id: 'photos', icon: Camera },
] as const;

type TabId = (typeof TABS)[number]['id'];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.38,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const language = useAppStore((s) => s.language);
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const t = useT();
  const { toast } = useToast();

  const [adminSubTab, setAdminSubTab] = useState<TabId>('guests');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const tabLabel = (id: TabId): string => {
    switch (id) {
      case 'guests': return `${t.tabGuestRsvps} (${guests.length})`;
      case 'catering': return t.tabCatering;
      case 'escort': return t.tabEscort;
      case 'gifts': return `${t.tabGifts} (${gifts.length})`;
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
      const [resGuests, resGb, resAlt, resGifts] = await Promise.all([
        adminFetch('/api/guests'),
        adminFetch('/api/guestbook'),
        adminFetch('/api/alerts'),
        adminFetch('/api/gifts'),
      ]);
      return {
        guests: ((await resGuests.json()).guests ?? []) as Guest[],
        guestbookEntries: ((await resGb.json()).entries ?? []) as GuestbookEntry[],
        alerts: ((await resAlt.json()).alerts ?? []) as EventAlert[],
        gifts: ((await resGifts.json()).gifts ?? []) as GiftLog[],
      };
    },
  });
  const { guests, guestbookEntries, alerts, gifts } = overviewQuery.data ?? {
    guests: [] as Guest[],
    guestbookEntries: [] as GuestbookEntry[],
    alerts: [] as EventAlert[],
    gifts: [] as GiftLog[],
  };
  const refreshOverview = async () => { await queryClient.invalidateQueries({ queryKey: ['admin-overview'] }); };

  const [notification, setNotification] = useState<string | null>(null);

  const confirm = useConfirm();

  const handleDeleteAlertRequest = async (alertId: string) => {
    const ok = await confirm({
      title: 'Delete Broadcast Alert?',
      message: 'Are you sure you want to delete this broadcast alert from the guest view?',
      confirmText: 'Delete Alert',
    });
    if (!ok) return;
    await fetch(`/api/alerts/${alertId}`, { method: 'DELETE' });
    refreshOverview();
    setNotification(t.alertDeletedToast);
    setTimeout(() => setNotification(null), 3000);
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
      message: 'This will permanently remove all guests, guestbook entries, alerts, seating maps, photos, predictions, and gifts. Event settings (parents\' names, date, venue) are preserved. This cannot be undone.',
      confirmText: 'Yes, Clear All Data',
    });
    if (!ok) return;
    await adminFetch('/api/wipe-data', { method: 'POST' });
    refreshOverview();
    setNotification(t.wipeDbConfirm);
    setTimeout(() => setNotification(null), 3000);
  };


  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >

      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-[#8B735B] text-white px-5 py-3 rounded-full shadow-xl flex items-center space-x-2 text-xs font-bold font-mono"
          >
            <Sparkles className="w-4 h-4 text-white animate-spin" />
            <span>{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={cardVariants} className="card-paper p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
        <motion.div
          key="guestbook"
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-8"
        >
          <motion.div variants={cardVariants} className="card-paper p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="label-mono">{t.dayOfGuestbookTab}</div>
                <h3 className="font-sans text-2xl font-bold text-[#8B735B]">
                  {t.guestbookFeedTitle}
                </h3>
                <p className="text-xs text-[#5D5449]">
                  {t.guestbookFeedSubtitle}
                </p>
              </div>
            </div>

            {guestbookEntries.length === 0 ? (
              <div className="text-center py-12 bg-[#EFE6DC]/30 rounded-3xl border-2 border-dashed border-[#CBAE94]">
                <MessageSquare className="w-10 h-10 text-[#CBAE94] mx-auto mb-2" />
                <p className="text-sm font-bold text-[#8B735B]">
                  {t.noEntriesYet}
                </p>
              </div>
            ) : (
              <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {guestbookEntries.map((entry) => (
                  <motion.div
                    key={entry.id}
                    variants={cardVariants}
                    className="bg-[#FAF4EF] rounded-3xl p-5 border-2 border-[#CBAE94] shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
                  >
                    {entry.photo_url && (
                      <div className="relative rounded-2xl overflow-hidden bg-[#EFE6DC] aspect-video border border-[#CBAE94]">
                        <img
                          src={entry.photo_url}
                          alt={entry.guest_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-[#5D5449] text-xs sm:text-sm italic leading-relaxed font-sans">
                        "{entry.message}"
                      </p>
                    </div>

                    <div className="pt-3 border-t border-dashed border-[#CBAE94] flex items-center justify-between text-[11px] text-[#5D5449]">
                      <span className="font-bold text-[#8B735B]">
                        <Heart className="w-3.5 h-3.5 inline" /> {entry.guest_name}
                      </span>
                      <span className="font-mono">
                        {new Date(entry.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}

      {adminSubTab === 'photos' && (
        <motion.div
          key="photos"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <HostPhotoGalleryPage />
        </motion.div>
      )}

      {adminSubTab === 'checkin' && (
        <motion.div
          key="checkin"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <GuestCheckIn />
        </motion.div>
      )}

      {adminSubTab === 'catering' && (
        <motion.div
          key="catering"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <CateringSummaryView guests={guests} />
        </motion.div>
      )}

      {adminSubTab === 'escort' && (
        <motion.div
          key="escort"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <EscortCardsGenerator guests={guests} settings={settings} />
        </motion.div>
      )}

      {adminSubTab === 'gifts' && (
        <motion.div
          key="gifts"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
        >
          <ThankYouTrackerView gifts={gifts} guests={guests} settings={settings} onRefreshData={refreshOverview} />
        </motion.div>
      )}

        </div>
      </div>
    </motion.div>
  );
};

