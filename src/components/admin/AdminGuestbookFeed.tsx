import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Heart, MessageSquare, Trash2, Eye, EyeOff } from 'lucide-react';
import { GuestbookEntry } from '../../types';
import { adminCardVariants, adminContainerVariants } from '../shared/motionPresets';
import { useT, useTf } from '../shared/i18n';
import { useToast } from '../shared/ToastContext';
import { useConfirm, useActionConfirm } from '../shared/ConfirmDialog';
import { SearchInput } from '../shared/ui';
import { Segmented } from '../shared/Segmented';
import { IconButton } from '../shared/IconButton';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../shared/hooks';
import { AdminToolbar } from './AdminToolbar';
import { adminFetch } from '../../lib/api';

export const AdminGuestbookFeed = ({ entries, onRefresh }: { entries: GuestbookEntry[]; onRefresh: () => Promise<void> }) => {
  const t = useT();
  const tf = useTf();
  const { toast } = useToast();
  const confirm = useConfirm();
  const confirmAction = useActionConfirm();
  const [searchTerm, setSearchTerm] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  const hiddenCount = entries.filter((e) => e.visible === false).length;

  const filteredEntries = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return entries.filter((e) => {
      const matchesSearch = e.guest_name.toLowerCase().includes(q) || e.message.toLowerCase().includes(q);
      const matchesVisibility =
        visibilityFilter === 'all' ||
        (visibilityFilter === 'hidden' ? e.visible === false : e.visible !== false);
      return matchesSearch && matchesVisibility;
    });
  }, [entries, searchTerm, visibilityFilter]);

  const entriesPager = usePagination(filteredEntries);

  const handleToggleVisibility = async (entry: GuestbookEntry) => {
    const label = entry.visible === false ? t.moderationShowBtn : t.moderationHideBtn;
    if (!(await confirmAction(label))) return;
    try {
      const res = await adminFetch(`/api/guestbook/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: entry.visible === false }),
      });
      if (res.ok) {
        toast.info(entry.visible === false ? t.gbEntryShownToast : t.gbEntryHiddenToast);
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to toggle entry visibility:', err);
    }
  };

  const handleDelete = async (entry: GuestbookEntry) => {
    const ok = await confirm({
      title: t.deleteGbEntryTitle,
      message: tf('deleteGbEntryMsg', { name: entry.guest_name }),
      confirmText: t.deleteGbEntryBtn,
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/guestbook/${entry.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.love(t.gbEntryDeletedToast);
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  return (
    <motion.div variants={adminContainerVariants} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-6">
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

        {entries.length > 0 && (
          <AdminToolbar
            primary={
              <div className="min-w-0 flex-1">
                <SearchInput
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t.searchGuestbookPh}
                  aria-label={t.searchGuestbookPh}
                  className="w-full"
                />
              </div>
            }
            secondary={
              <Segmented
                value={visibilityFilter}
                onChange={setVisibilityFilter}
                options={[
                  { value: 'all', label: t.filterAllOption, count: entries.length },
                  { value: 'visible', label: t.moderationVisibleBadge, count: entries.length - hiddenCount },
                  { value: 'hidden', label: t.moderationHiddenBadge, count: hiddenCount },
                ]}
              />
            }
          />
        )}

        {entries.length === 0 ? (
          <div className="text-center py-12 bg-[#EFE6DC]/30 rounded-3xl border-2 border-dashed border-[#CBAE94]">
            <MessageSquare className="w-10 h-10 text-[#CBAE94] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#8B735B]">
              {t.noEntriesYet}
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <p className="text-center py-10 text-[#A09080] font-mono text-xs">{t.noSearchMatch}</p>
        ) : (
          <motion.div variants={adminContainerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {entriesPager.pageItems.map((entry) => (
              <motion.div
                key={entry.id}
                variants={adminCardVariants}
                className={`bg-[#FAF4EF] rounded-3xl p-5 border-2 border-[#CBAE94] shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow ${
                  entry.visible === false ? 'opacity-60 border-dashed' : ''
                }`}
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
                    {entry.visible === false && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold font-mono uppercase">
                        {t.moderationHiddenBadge}
                      </span>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[#5D5449] text-xs sm:text-sm italic leading-relaxed font-sans">
                    "{entry.message}"
                  </p>
                </div>

                <div className="pt-3 border-t border-dashed border-[#CBAE94] flex items-center justify-between text-xs text-[#5D5449]">
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

                {/* Moderation */}
                <div className="flex items-center justify-end gap-1.5">
                  <IconButton
                    variant="outline"
                    label={entry.visible === false ? t.moderationShowBtn : t.moderationHideBtn}
                    onClick={() => handleToggleVisibility(entry)}
                  >
                    {entry.visible === false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </IconButton>
                  <IconButton
                    variant="danger"
                    label={t.deleteGbEntryBtn}
                    onClick={() => handleDelete(entry)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        <Pagination
          page={entriesPager.page}
          totalPages={entriesPager.totalPages}
          rangeStart={entriesPager.rangeStart}
          rangeEnd={entriesPager.rangeEnd}
          total={entriesPager.total}
          onPageChange={entriesPager.setPage}
        />
      </motion.div>
    </motion.div>
  );
};
