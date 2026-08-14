import React, { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GuestbookEntry } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  BookOpen,
  Camera,
  X,
  Send,
  CheckCircle2,
  Sparkles,
  Clock,
  User,
  Printer,
  Lock,
} from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { cardItem } from '../shared/motionPresets';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '../shared/EmptyState';
import { formatGuestWindow } from '../../lib/dateUtils';
import { fileToDataUrl } from '../../lib/fileUtils';
import { GuestbookEntrySchema } from '../../lib/validation';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';

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

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => feedScrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const handlePrintKeepsake = () => {
    toast.info(t.gbPrintToast);
    setTimeout(() => {
      window.print();
    }, 400);
  };

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
      setPreviewUrl(URL.createObjectURL(file));
      toast.info(t.gbPhotoAttachedToast);
    }
  };

  // Remove photo handler
  const handleRemovePhoto = () => {
    setSelectedFile(null);
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

      // Upload photo if present
      if (selectedFile) {
        const dataUrl = await fileToDataUrl(selectedFile);
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_base64: dataUrl }),
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedPhotoUrl = uploadData.photo_url || '';
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
            onClick={handlePrintKeepsake}
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
            /* Success State */
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="text-center py-6 space-y-6"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="w-16 h-16 bg-[#EFE6DC] text-[#8B735B] rounded-full flex items-center justify-center mx-auto shadow-sm border-2 border-[#CBAE94]"
              >
                <CheckCircle2 className="w-8 h-8 text-[#8B735B]" />
              </motion.div>

              <div className="space-y-2">
                <span className="label-mono bg-[#EFE6DC] px-3 py-1 rounded-full border border-[#CBAE94] inline-flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#8B735B]" />
                  {t.gbSuccessTitle}
                </span>
                <h3 className="font-sans text-2xl font-bold text-[#8B735B]">
                  {t.gbSuccessMsg}
                </h3>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleResetForm}
                className="btn-accent w-full text-sm space-x-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 mr-2 text-white" />
                <span>{t.gbLeaveAnotherBtn}</span>
              </motion.button>
            </motion.div>
          ) : (

            /* Interactive Form State */
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={handleSubmit(onValid)}
              className="space-y-6"
            >
              
              {/* Name Input */}
              <div className="space-y-1.5">
                <label className="label-mono block">
                  {t.gbNameLabel} *
                </label>
                <input
                  type="text"
                  required
                  {...register('guest_name')}
                  placeholder={t.gbNamePlaceholder}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#CBAE94] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white text-[#5D5449]"
                />
                {errors.guest_name && <p className="text-rose-600 text-[10px]">{errors.guest_name.message}</p>}
              </div>

              {/* Message Input */}
              <div className="space-y-1.5">
                <label className="label-mono block">
                  {t.gbMessageLabel} *
                </label>
                <textarea
                  required
                  rows={4}
                  {...register('message')}
                  placeholder={t.gbMessagePlaceholder}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#CBAE94] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white text-[#5D5449]"
                />
                {errors.message && <p className="text-rose-600 text-[10px]">{errors.message.message}</p>}
              </div>

              {/* Photo Upload Input */}
              <div className="space-y-2">
                <label className="label-mono block">
                  {t.gbPhotoLabel}
                </label>

                {!previewUrl ? (
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#CBAE94] hover:border-[#8B735B] bg-[#EFE6DC]/40 hover:bg-[#EFE6DC] rounded-2xl p-6 text-center cursor-pointer transition-colors space-y-2"
                  >
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto border border-[#CBAE94]">
                      <Camera className="w-5 h-5 text-[#8B735B]" />
                    </div>
                    <p className="text-xs font-bold text-[#5D5449]">
                      Tap to take or choose a photo
                    </p>
                    <p className="text-[11px] text-[#5D5449]/70 font-mono">
                      {t.gbPhotoHelper}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative rounded-2xl overflow-hidden border-2 border-[#CBAE94] bg-white shadow-md"
                  >
                    <img
                      src={previewUrl}
                      alt="Selected upload preview"
                      className="w-full h-48 object-cover"
                    />
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute top-3 right-3 p-2 bg-[#8B735B] hover:bg-[#5D5449] text-white rounded-full transition-colors shadow-xs cursor-pointer"
                      title={t.removePhotoBtn}
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Submit Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={submitting}
                className="btn-accent w-full py-4 text-base disabled:opacity-50 min-h-[52px] cursor-pointer"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-5 h-5 mr-2 text-white" />
                )}
                <span>{submitting ? t.gbSubmittingBtn : t.gbSubmitBtn}</span>
              </motion.button>

            </motion.form>
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
            onAction={() => {
              const el = document.querySelector('input[type="text"]');
              if (el) (el as HTMLElement).focus();
            }}
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

