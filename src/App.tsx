import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Footer } from './components/layout/Footer';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { RsvpPage } from './components/rsvp/RsvpPage';
import { GuestbookPage } from './components/guestbook/GuestbookPage';
import { FloorPlanPage } from './components/seating/FloorPlanPage';
import { GuestFinderPage } from './components/seating/GuestFinderPage';
import { GuestPhotoUploadPage } from './components/photos/GuestPhotoUploadPage';
import { HostPhotoGalleryPage } from './components/photos/HostPhotoGalleryPage';
import { AdminLogin } from './components/admin/AdminLogin';
import { LandingPage } from './components/landing/LandingPage';
import { GuestPortalPage } from './components/landing/GuestPortalPage';
import { EventDetailsPage } from './components/landing/EventDetailsPage';
import { ToastProvider } from './components/shared/ToastContext';
import { ConfirmProvider } from './components/shared/ConfirmDialog';
import { useSettingsStore } from './stores/settingsStore';
import { applyThemeToDocument, getThemeById } from './themePresets';
import { requireAuth } from './lib/api';

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
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);
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
          <Route path="/portal" element={<GuestPortalPage />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
