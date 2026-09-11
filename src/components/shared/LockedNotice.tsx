import { Lock } from 'lucide-react';
import { formatGuestWindow } from '../../lib/dateUtils';
import type { Language } from '../../types';
import type { GuestContentLockInfo } from '../../lib/guestLock';

interface LockedNoticeProps {
  title: string;
  message: string;
  lockInfo?: GuestContentLockInfo | null;
  language: Language;
}

// The shared "this opens during the event window" card. Each guest page keeps
// its own outer layout; this is the card itself.
export const LockedNotice = ({ title, message, lockInfo, language }: LockedNoticeProps) => (
  <div className="card-paper p-10 sm:p-14 text-center space-y-4">
    <div className="w-14 h-14 bg-[#E9E0D2] text-[#8B735B] rounded-full flex items-center justify-center mx-auto border-2 border-[#CBAE94]">
      <Lock className="w-6 h-6" />
    </div>
    <h2 className="font-newsreader text-2xl sm:text-3xl font-bold text-[#4A3F35]">{title}</h2>
    <p className="text-sm text-[#4A3F35]/70 font-sans leading-relaxed max-w-md mx-auto">{message}</p>
    {lockInfo && (
      <p className="text-xs font-mono font-bold text-[#8B735B] pt-2">
        {formatGuestWindow(lockInfo.opensAt, lockInfo.closesAt, language)}
      </p>
    )}
  </div>
);
