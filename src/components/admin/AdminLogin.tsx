import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { AppMark } from '../shared/AppMark';
import { useSettings } from '../../lib/settingsQuery';
import { eventDisplayName } from '../../lib/eventName';
import { useT } from '../shared/i18n';
import { BackButton } from '../shared/BackButton';
import { GuestPageHeader } from '../shared/GuestPageHeader';

export const AdminLogin = () => {
  const t = useT();
  const settings = useSettings();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!password.trim()) { setError(t.passwordRequiredError); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/guests', {
        headers: { 'x-admin-token': password },
      });
      if (!res.ok) {
        setError(t.wrongPasswordMsg);
        setLoading(false);
        return;
      }
      sessionStorage.setItem('admin_token', password);
      navigate('/admin');
    } catch {
      setError(t.connectError);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <BackButton label={t.backHomeBtn} />

      <div className="card-soft p-6 sm:p-8 space-y-6">
        <GuestPageHeader
          mark={<AppMark settings={settings} className="w-6 h-6 text-[#8B735B]" />}
          eyebrow={t.adminLoginLabel}
          title={eventDisplayName(settings, t.eventFallbackTitle)}
        />

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-password" className="label-mono block mb-2">{t.passwordLabel}</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A09080]" aria-hidden />
              <input
                id="admin-password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t.passwordPh}
                aria-invalid={!!error}
                aria-describedby={error ? 'admin-password-error' : undefined}
                className="guest-input pl-10 pr-11"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? t.hidePasswordLabel : t.showPasswordLabel}
                aria-pressed={showPw}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#A09080] hover:text-[#4A3F35] cursor-pointer"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p id="admin-password-error" role="alert" className="notice-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-accent w-full py-3.5 text-sm font-bold gap-2 cursor-pointer disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? t.checkingLabel : t.enterAdminBtn}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
