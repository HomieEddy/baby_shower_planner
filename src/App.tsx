import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { ToastProvider } from './components/shared/ToastContext';
import { ConfirmProvider } from './components/shared/ConfirmDialog';
import { useSettings } from './lib/settingsQuery';
import { applyThemeToDocument, getThemeById } from './themePresets';
import { requireAuth } from './lib/api';
import { useAppStore } from './stores/appStore';
import { useT } from './components/shared/i18n';

// Route-level code splitting: each page (and the heavy admin/seating/photo
// stacks it drags in) loads on demand instead of one ~2 MB entry bundle.
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const AdminLogin = lazy(() =>
  import('./components/admin/AdminLogin').then((m) => ({ default: m.AdminLogin }))
);
const RsvpPage = lazy(() =>
  import('./components/rsvp/RsvpPage').then((m) => ({ default: m.RsvpPage }))
);
const GuestbookPage = lazy(() =>
  import('./components/guestbook/GuestbookPage').then((m) => ({ default: m.GuestbookPage }))
);
const FloorPlanPage = lazy(() =>
  import('./components/seating/FloorPlanPage').then((m) => ({ default: m.FloorPlanPage }))
);
const GuestFinderPage = lazy(() =>
  import('./components/seating/GuestFinderPage').then((m) => ({ default: m.GuestFinderPage }))
);
const GuestPhotoUploadPage = lazy(() =>
  import('./components/photos/GuestPhotoUploadPage').then((m) => ({ default: m.GuestPhotoUploadPage }))
);
const HostPhotoGalleryPage = lazy(() =>
  import('./components/photos/HostPhotoGalleryPage').then((m) => ({ default: m.HostPhotoGalleryPage }))
);
const LandingPage = lazy(() =>
  import('./components/landing/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const GuestPortalPage = lazy(() =>
  import('./components/landing/GuestPortalPage').then((m) => ({ default: m.GuestPortalPage }))
);
const EventDetailsPage = lazy(() =>
  import('./components/landing/EventDetailsPage').then((m) => ({ default: m.EventDetailsPage }))
);
const RegisterPage = lazy(() =>
  import('./components/registration/RegisterPage').then((m) => ({ default: m.RegisterPage }))
);
const NotFoundPage = lazy(() =>
  import('./components/landing/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-live="polite">
      <div className="w-8 h-8 border-2 border-[#D4A373] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
  const settings = useSettings();
  const location = useLocation();
  const language = useAppStore((s) => s.language);
  const t = useT();

  // Guest-facing pages render without the admin header/nav — unless the
  // visitor is an authenticated admin, who keeps the header everywhere.
  // /find-my-table and /check-in are the exceptions: nobody sees admin menus
  // there, only a slim bar with the FR/EN toggle.
  const isAdminSurface =
    location.pathname === '/login' ||
    location.pathname.startsWith('/admin') ||
    location.pathname === '/photo-gallery' ||
    location.pathname === '/seating';
  const isGuestDayOf = location.pathname === '/find-my-table' || location.pathname === '/check-in';
  const showHeader = (isAdminSurface || requireAuth()) && !isGuestDayOf;
  const showFinderLangBar = isGuestDayOf;
  // Full-bleed guest pages own their layout; don't letterbox them in the shell.
  const isFullBleed = ['/find-my-table', '/check-in', '/upload-photos', '/photo-gallery'].includes(
    location.pathname
  );

  useEffect(() => {
    const activeTheme = getThemeById(settings?.themeId, settings?.customTheme);
    applyThemeToDocument(activeTheme);
  }, [settings?.themeId, settings?.customTheme]);

  // Keep the document language in sync with the FR/EN toggle for screen readers.
  useEffect(() => {
    document.documentElement.lang = language === 'FR' ? 'fr' : 'en';
  }, [language]);

  // Localized document title (brand + event name).
  useEffect(() => {
    document.title = settings?.babyName
      ? `${t.appTitle} ${settings.babyName}`
      : `${t.appTitle} ${t.appSubtitle}`;
  }, [t, settings?.babyName]);

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#5D5449] font-sans flex flex-col selection:bg-[#CBAE94] selection:text-white">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-[#4A3F35] focus:text-white focus:text-sm focus:font-bold"
      >
        {t.skipToContent}
      </a>
      {showHeader && <Header sticky={!isAdminSurface} />}
      {showFinderLangBar && <Header minimal />}
      <main
        id="main-content"
        className={
          isFullBleed
            ? 'flex-1 w-full'
            : 'flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10'
        }
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<AdminLogin />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/portal" element={<GuestPortalPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/event" element={<EventDetailsPage />} />
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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {!isFullBleed && <Footer />}
    </div>
  );
}
