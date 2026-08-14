import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import { useT } from '../shared/i18n';

export const AdminLogin = () => {
    const t = useT();
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
      if (res.status === 401) {
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
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#E9E0D2] border-2 border-[#4A3F35] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
            <Sparkles className="w-8 h-8 text-[#4A3F35]" />
          </div>
          <h1 className="font-gaegu text-3xl font-bold text-[#4A3F35]">Bébé Planner</h1>
          <p className="text-sm text-[#A09080] mt-1 font-mono">{t.adminLoginLabel}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-[#CBAE94]/40 p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-[#5D5449] font-mono mb-1.5">{t.passwordLabel}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A09080]" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t.passwordPh}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-[#CBAE94] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A09080] hover:text-[#4A3F35]"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {error && <p className="text-red-600 text-xs mt-1.5 font-medium">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[#8B735B] text-white font-bold text-sm hover:bg-[#4A3F35] transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? t.checkingLabel : t.enterAdminBtn}</span>
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-[#A09080] mt-6 font-mono">
          Bébé Baby Shower Planner
        </p>
      </div>
    </div>
  );
};
