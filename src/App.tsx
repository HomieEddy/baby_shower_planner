import { useEffect } from 'react';
import { motion } from 'motion/react';
import { Heart } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { RsvpPage } from './components/rsvp/RsvpPage';
import { GuestbookPage } from './components/guestbook/GuestbookPage';
import { FloorPlanPage } from './components/seating/FloorPlanPage';
import { GuestFinderPage } from './components/seating/GuestFinderPage';
import { GuestPhotoUploadPage } from './components/photos/GuestPhotoUploadPage';
import { HostPhotoGalleryPage } from './components/photos/HostPhotoGalleryPage';
import { AdminLogin } from './components/admin/AdminLogin';
import { LandingPage } from './components/landing/LandingPage';
import { ToastProvider } from './components/shared/ToastContext';
import { ConfirmProvider } from './components/shared/ConfirmDialog';
import { useSettingsStore } from './stores/settingsStore';
import { useAppStore } from './stores/appStore';
import { applyThemeToDocument, getThemeById } from './themePresets';
import { requireAuth } from './lib/api';
import { useT } from './components/shared/i18n';

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  if (!requireAuth()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfirmProvider>
        <ToastProvider>
          <MainAppContent />
        </ToastProvider>
      </ConfirmProvider>
    </BrowserRouter>
  );
}

function MainAppContent() {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
  const language = useAppStore((s) => s.language);
  const location = useLocation();

  // Guest-facing pages render without the admin header/nav — unless the
  // visitor is an authenticated admin, who keeps the header everywhere.
  // /find-my-table and /check-in are the exceptions: nobody sees admin menus
  // there, only a slim bar with the FR/EN toggle.
  const isAdminSurface =
    location.pathname === '/login' ||
    location.pathname.startsWith('/admin') ||
    location.pathname === '/photo-gallery';
  const isGuestDayOf = location.pathname === '/find-my-table' || location.pathname === '/check-in';
  const showHeader = (isAdminSurface || requireAuth()) && !isGuestDayOf;
  const showFinderLangBar = isGuestDayOf;

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    const activeTheme = getThemeById(settings?.themeId, settings?.customTheme);
    applyThemeToDocument(activeTheme);
  }, [settings?.themeId, settings?.customTheme]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#5D5449] font-sans flex flex-col selection:bg-[#CBAE94] selection:text-white">
      {showHeader && <Header />}
      {showFinderLangBar && <Header minimal />}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Routes>
          <Route path="/login" element={<AdminLogin />} />
          <Route path="/" element={<LandingPage />} />
          <Route path="/rsvp" element={<Navigate to="/" replace />} />
          <Route path="/rsvp/:token" element={<RsvpPage />} />
          <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="/photo-gallery" element={<RequireAdmin><HostPhotoGalleryPage /></RequireAdmin>} />
          <Route path="/guestbook" element={<GuestbookPage />} />
          {/* One merged day-of page: check in + find your seat.
              /check-in is an alias so old links and QRs keep working. */}
          <Route path="/find-my-table" element={<GuestFinderPage />} />
          <Route path="/check-in" element={<GuestFinderPage />} />
          <Route path="/seating" element={<RequireAdmin><FloorPlanPage /></RequireAdmin>} />
          <Route path="/upload-photos" element={<GuestPhotoUploadPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="mt-auto py-8 px-4 text-center text-xs text-[#5D5449]/80 border-t border-dashed border-[#CBAE94]/60 space-y-2.5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-[#8B735B] font-bold">
          {t.footerCopyright
            .replace('{{year}}', String(new Date().getFullYear()))
            .replace('{{parentsNames}}', settings?.parentsNames?.trim() || 'Bébé Baby Shower')}
        </p>
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-[#5D5449]/70">
          <motion.span
            aria-hidden
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Heart className="w-3 h-3 text-rose-400 fill-rose-300" />
          </motion.span>
          {t.footerLove.replace(
            '{{babyName}}',
            settings?.babyName?.trim() ? `Bébé ${settings.babyName.trim()}` : t.footerCub
          )}
        </p>
        <button
          type="button"
          onClick={() => useAppStore.getState().toggleLanguage()}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#CBAE94]/60 bg-white/60 hover:bg-[#EFE6DC] text-[10px] font-bold font-mono text-[#8B735B] transition-colors cursor-pointer"
          title="Switch Language / Changer de langue"
        >
          {language === 'EN' ? 'Français (FR)' : 'English (EN)'}
        </button>
      </footer>
    </div>
  );
}
