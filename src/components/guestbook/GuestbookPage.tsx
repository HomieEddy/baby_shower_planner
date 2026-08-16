import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GuestbookEntry } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  BookOpen,
  Printer,
  Lock,
} from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '../shared/EmptyState';
import { formatGuestWindow } from '../../lib/dateUtils';
import { uploadPhotoBase64 } from '../../lib/fileUtils';
import { compressImage } from '../../lib/imageCompressor';
import { GuestbookEntrySchema } from '../../lib/validation';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
import { usePrint } from '../shared/hooks';
import { GuestbookForm, GuestbookSuccess } from './GuestbookForm';
import { GuestbookEntryCard } from './GuestbookEntryCard';

export const GuestbookPage = () => {
  const language = useAppStore((s) => s.language);
  const t = useT();
  const { toast } = useToast();

  const [locked, setLocked] = useState(false);
  const [lockInfo, setLockInfo] = useState<{ opensAt?: string; closesAt?: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof GuestbookEntrySchema>>({
    resolver: zodResolver(GuestbookEntrySchema),
    defaultValues: { guest_name: '', message: '' },
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => feedScrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const printKeepsake = usePrint();

  // Fetch guestbook entries
  const fetchEntries = async () => {
    try {
      setLoadingEntries(true);
      const res = await fetch('/api/guestbook');
      if (res.status === 403) {
        const data = await res.json();
        setLocked(true);
        setLockInfo({ opensAt: data.opensAt, closesAt: data.closesAt });
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch (err) {
      console.error('Failed to fetch guestbook entries:', err);
    } finally {
      setLoadingEntries(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  // File selection handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      toast.info(t.gbPhotoAttachedToast);
    }
  };

  // Remove photo handler
  const handleRemovePhoto = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.info(t.gbPhotoRemovedToast);
  };

  // Form Submit
  const onValid = async (values: z.infer<typeof GuestbookEntrySchema>) => {
    try {
      setSubmitting(true);

      let uploadedPhotoUrl = '';

      // Upload photo if present (compressed to keep entries light)
      if (selectedFile) {
        const compressed = await compressImage(selectedFile);
        uploadedPhotoUrl = await uploadPhotoBase64(compressed.file);
        if (!uploadedPhotoUrl) {
          toast.error(t.gbPostErrorToast);
          return;
        }
      }

      // Submit guestbook entry
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: values.guest_name.trim(),
          message: values.message.trim(),
          photo_url: uploadedPhotoUrl,
        }),
      });

      if (res.status === 403) {
        // The window closed while this page was open.
        const data = await res.json();
        setLocked(true);
        setLockInfo({ opensAt: data.opensAt, closesAt: data.closesAt });
        return;
      }

      if (res.ok) {
        setSubmitted(true);
        toast.love(t.gbPostedToast);
        fetchEntries();
        reset({ guest_name: '', message: '' });
      } else {
        toast.error(t.gbPostFailedToast);
      }
    } catch (err) {
      console.error('Guestbook submit error:', err);
      toast.error(t.gbPostErrorToast);
    } finally {
      setSubmitting(false);
    }
  };

  // Reset form for "Leave another message"
  const handleResetForm = () => {
    reset({ guest_name: '', message: '' });
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSubmitted(false);
  };

  // Locked state: guestbook only opens during the event window
  if (locked) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="max-w-2xl mx-auto"
      >
        <div className="card-paper p-10 sm:p-14 text-center space-y-4">
          <div className="w-14 h-14 bg-[#E9E0D2] text-[#8B735B] rounded-full flex items-center justify-center mx-auto border-2 border-[#CBAE94]">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="font-newsreader text-2xl sm:text-3xl font-bold text-[#4A3F35]">
            {t.guestbookLockedTitle}
          </h2>
          <p className="text-sm text-[#4A3F35]/70 font-sans leading-relaxed max-w-md mx-auto">
            {t.guestbookLockedMsg}
          </p>
          {lockInfo && (
            <p className="text-xs font-mono font-bold text-[#8B735B] pt-2">
              {formatGuestWindow(lockInfo.opensAt, lockInfo.closesAt, language)}
            </p>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="max-w-2xl mx-auto space-y-6"
    >
      
      {/* Header Banner */}
      <motion.div
        whileHover={{ y: -2 }}
        className="card-paper p-6 sm:p-8 text-center space-y-3 transition-shadow relative overflow-hidden"
      >
        <motion.div
          whileHover={{ rotate: 10, scale: 1.1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className="w-12 h-12 bg-[#E9E0D2] border-2 border-[#4A3F35] rounded-2xl flex items-center justify-center mx-auto mb-1 shadow-xs cursor-pointer"
        >
          <BookOpen className="w-6 h-6 text-[#4A3F35]" />
        </motion.div>
        <div className="label-mono">{t.guestbookKeepsakeLabel}</div>
        <h2 className="font-newsreader text-3xl sm:text-4xl font-bold text-[#4A3F35]">
          {t.guestbookTitle}
        </h2>
        <p className="text-xs sm:text-sm text-[#4A3F35]/70 font-sans leading-relaxed max-w-lg mx-auto">
          {t.guestbookSubtitle}
        </p>

        {/* Export Action */}
        <div className="pt-2 flex justify-end border-t border-[#CBAE94]/30">
          <button
            type="button"
            onClick={() => printKeepsake(t.gbPrintToast)}
            className="px-3.5 py-2 rounded-xl bg-[#8B735B] text-white font-bold text-xs hover:bg-[#705C47] transition-all flex items-center gap-1.5 shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.printMemoryBookBtn}</span>
          </button>
        </div>
      </motion.div>

      {/* Main Form or Success Card */}
      <div className="card-paper p-6 sm:p-8">
        <AnimatePresence mode="wait">
          
          {submitted ? (
            <GuestbookSuccess onLeaveAnother={handleResetForm} />
          ) : (
            <GuestbookForm
              register={register}
              errors={errors}
              submitting={submitting}
              previewUrl={previewUrl}
              nameInputRef={nameInputRef}
              onFileChange={handleFileChange}
              onRemovePhoto={handleRemovePhoto}
              onSubmit={handleSubmit(onValid)}
            />
          )}

        </AnimatePresence>
      </div>

      {/* Guestbook Entries Feed */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35] flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-400" />
            <span>{t.gbWishesCount.replace('{{count}}', String(entries.length))}</span>
          </h3>
          <span className="text-xs font-bold text-[#8B735B]">{t.liveFeedTab}</span>
        </div>

        {loadingEntries ? (
          <div className="p-8 text-center text-xs font-bold text-[#8B735B] animate-pulse">
            {t.loadingGuestbookMsg}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            type="guestbook"
            actionLabel={t.gbWriteFirstNoteBtn}
            onAction={() => nameInputRef.current?.focus()}
          />
        ) : (
          <div ref={feedScrollRef} className="max-h-[60vh] overflow-y-auto pr-1">
            <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index];
                return (
                  <div
                    key={entry.id}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full pb-4"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <GuestbookEntryCard entry={entry} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

