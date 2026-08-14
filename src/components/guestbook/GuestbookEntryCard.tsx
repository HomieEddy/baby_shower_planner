import { motion } from 'motion/react';
import { Clock, User } from 'lucide-react';
import { GuestbookEntry } from '../../types';
import { cardItem } from '../shared/motionPresets';

export const GuestbookEntryCard = ({ entry }: { entry: GuestbookEntry }) => {
  return (
    <motion.div
      variants={cardItem}
      className="card-paper p-5 flex flex-col justify-between gap-3 border border-[#CBAE94]/60 bg-[#FFFDF9] shadow-xs relative overflow-hidden group"
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#EFE6DC] text-[#8B735B] flex items-center justify-center font-bold text-xs">
              <User className="w-4 h-4 text-[#8B735B]" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-[#4A3F35]">
                {entry.guest_name}
              </h4>
              <p className="text-[10px] text-[#8B735B] font-mono flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(entry.created_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs sm:text-sm text-[#4A3F35] leading-relaxed font-sans italic bg-[#FAF6F0] p-3 rounded-xl border border-[#CBAE94]/30">
          "{entry.message}"
        </p>
      </div>

      {entry.photo_url && (
        <div className="rounded-xl overflow-hidden border border-[#CBAE94]/40 aspect-video max-h-48 bg-slate-100 mt-1">
          <img
            src={entry.photo_url}
            alt={`Photo by ${entry.guest_name}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
    </motion.div>
  );
};
