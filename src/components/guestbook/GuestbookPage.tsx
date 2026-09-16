import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GuestbookEntry } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  BookOpen,
  Printer,
  Pencil,
  Trash2,
  KeyRound,
  Building2,
  ShieldCheck,
  Check,
  X,
  Camera,
} from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm, useConfirm } from '../shared/ConfirmDialog';
import { EmptyState } from '../shared/EmptyState';
import { BackButton } from '../shared/BackButton';
import { LockedNotice } from '../shared/LockedNotice';
import { readGuestLock } from '../../lib/guestLock';
import { uploadPhotoBase64 } from '../../lib/fileUtils';
import { compressImage } from '../../lib/imageCompressor';
import { GuestbookEntrySchema } from '../../lib/validation';
import { isValidCode } from '../../lib/validation';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
import { usePrint, useFloorMapTables } from '../shared/hooks';
import { decodeApiError } from '../../lib/errors';
import { GuestbookForm, GuestbookSuccess } from './GuestbookForm';
import { GuestbookEntryCard } from './GuestbookEntryCard';

export const GuestbookPage = () => {
  const language = useAppStore((s) => s.language);
  const t = useT();
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const confirm = useConfirm();
  const [searchParams] = useSearchParams();

  const initialCode = searchParams.get('code') || '';
  const initialTableId = searchParams.get('table') || '';
  const lockedIdentity = initialCode.length > 0;

  const [locked, setLocked] = useState(false);
  const [lockInfo, setLockInfo] = useState<{ opensAt?: string; closesAt?: string } | null>(null);

  const [code, setCode] = useState(initialCode);
  const [tableId, setTableId] = useState(initialTableId);
  const { data: tables = [] } = useFloorMapTables();
  const tableName = tables.find((tbl) => tbl.id === tableId)?.name || '';

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
  const [printing, setPrinting] = useState(false);

  // Inline edit of one of the guest's own wishes.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editExistingPhoto, setEditExistingPhoto] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
  const [editRemovePhoto, setEditRemovePhoto] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const printKeepsake = usePrint();

  // Fetch the guest's own wishes; without a valid code there is nothing to show.
  const fetchEntries = async (rawCode: string) => {
    try {
      const trimmed = rawCode.trim();
      const url = isValidCode(trimmed)
        ? `/api/guestbook?code=${encodeURIComponent(trimmed)}`
        : '/api/guestbook';
      const res = await fetch(url);
      const lock = await readGuestLock(res);
      if (lock) {
        setLocked(true);
        setLockInfo(lock);
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
    (async () => { await fetchEntries(initialCode); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch once a typed-in code becomes valid.
  useEffect(() => {
    if (!lockedIdentity && isValidCode(code.trim())) {
      (async () => { await fetchEntries(code); })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    const after = () => setPrinting(false);
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      toast.info(t.gbPhotoAttachedToast);
    }
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    toast.info(t.gbPhotoRemovedToast);
  };

  const onValid = async (values: z.infer<typeof GuestbookEntrySchema>) => {
    if (!isValidCode(code.trim())) {
      toast.error(t.uploadCodeRequiredToast);
      return;
    }
    if (!(await confirmAction(t.gbSubmitBtn))) return;
    try {
      setSubmitting(true);

      let uploadedPhotoUrl = '';
      if (selectedFile) {
        const compressed = await compressImage(selectedFile);
        uploadedPhotoUrl = await uploadPhotoBase64(compressed.file);
        if (!uploadedPhotoUrl) {
          toast.error(t.gbPostErrorToast);
          return;
        }
      }

      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: values.guest_name.trim(),
          message: values.message.trim(),
          photo_url: uploadedPhotoUrl,
          reservation_code: code.trim(),
          table_name: tableName,
          table_id: tableId,
        }),
      });

      const lock = await readGuestLock(res);
      if (lock) {
        setLocked(true);
        setLockInfo(lock);
        return;
      }

      if (res.ok) {
        setSubmitted(true);
        toast.love(t.gbPostedToast);
        fetchEntries(code);
        reset({ guest_name: '', message: '' });
      } else {
        const payload = await res.json().catch(() => ({}));
        const { code: errCode } = decodeApiError(payload, res.status);
        toast.error(errCode === 'GUESTBOOK_TABLE_FULL' ? t.gbTableFullMsg : t.gbPostFailedToast);
      }
    } catch (err) {
      console.error('Guestbook submit error:', err);
      toast.error(t.gbPostErrorToast);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    reset({ guest_name: '', message: '' });
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSubmitted(false);
  };

  const startEdit = (entry: GuestbookEntry) => {
    setEditingId(entry.id);
    setEditName(entry.guest_name);
    setEditMessage(entry.message);
    if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    setEditFile(null);
    setEditPreviewUrl(null);
    setEditExistingPhoto(entry.photo_url || '');
    setEditRemovePhoto(false);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
      setEditPreviewUrl(URL.createObjectURL(file));
      setEditFile(file);
      setEditRemovePhoto(false);
    }
  };

  const handleRemoveEditPhoto = () => {
    if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    setEditPreviewUrl(null);
    setEditFile(null);
    setEditRemovePhoto(true);
    if (editFileInputRef.current) editFileInputRef.current.value = '';
  };

  const handleSaveEdit = async (id: string) => {
    if (!isValidCode(code.trim())) {
      toast.error(t.uploadCodeRequiredToast);
      return;
    }
    if (!editName.trim() || !editMessage.trim()) {
      toast.error(t.gbEditValidationMsg);
      return;
    }
    try {
      setSavingEdit(true);

      // A new file replaces the photo; "remove" clears it; otherwise keep the
      // existing one (server leaves it untouched when photo_url is omitted).
      let photoUrl: string | undefined = undefined;
      if (editFile) {
        const compressed = await compressImage(editFile);
        const url = await uploadPhotoBase64(compressed.file);
        if (!url) {
          toast.error(t.gbPostErrorToast);
          return;
        }
        photoUrl = url;
      } else if (editRemovePhoto) {
        photoUrl = '';
      }

      const res = await fetch(`/api/guestbook/mine/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_code: code.trim(),
          guest_name: editName.trim(),
          message: editMessage.trim(),
          ...(photoUrl !== undefined ? { photo_url: photoUrl } : {}),
        }),
      });
      if (res.ok) {
        toast.success(t.gbWishUpdatedToast);
        if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
        setEditPreviewUrl(null);
        setEditFile(null);
        setEditingId(null);
        fetchEntries(code);
      } else {
        toast.error(t.gbPostFailedToast);
      }
    } catch (err) {
      console.error('Guestbook edit error:', err);
      toast.error(t.gbPostErrorToast);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (entry: GuestbookEntry) => {
    if (!isValidCode(code.trim())) return;
    const ok = await confirm({
      title: t.gbDeleteWishTitle,
      message: t.gbDeleteWishMsg,
      confirmText: t.gbDeleteWishBtn,
    });
    if (!ok) return;
    try {
      const res = await fetch(
        `/api/guestbook/mine/${entry.id}?code=${encodeURIComponent(code.trim())}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        toast.info(t.gbWishDeletedToast);
        fetchEntries(code);
      } else {
        toast.error(t.gbPostFailedToast);
      }
    } catch (err) {
      console.error('Guestbook delete error:', err);
      toast.error(t.gbPostErrorToast);
    }
  };

  if (locked) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="max-w-2xl mx-auto"
      >
        <LockedNotice
          title={t.guestbookLockedTitle}
          message={t.guestbookLockedMsg}
          lockInfo={lockInfo}
          language={language}
        />
      </motion.div>
    );
  }

  const identityBlock = (
    <div className="space-y-4">
      {lockedIdentity && (
        <div className="p-4 rounded-2xl bg-[#EFE6DC]/60 border border-[#CBAE94]/50 text-[#5D5449] text-xs font-medium flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#8B735B] shrink-0 mt-0.5" />
          <span>{t.uploadLockedIdentityNote}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[#4A3F35] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-[#8B735B]" />
            {t.uploadCodeLabel} *
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            disabled={lockedIdentity}
            placeholder={t.uploadCodePlaceholder}
            className={`w-full px-4 py-3 rounded-2xl border text-sm font-bold tracking-[0.3em] text-[#4A3F35] placeholder-[#8B735B]/60 placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-[#8B735B] ${
              lockedIdentity
                ? 'bg-[#EFE6DC]/60 border-[#CBAE94]/40 cursor-not-allowed'
                : 'bg-[#FAF6F0] border-[#CBAE94]/60'
            }`}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-[#4A3F35] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#8B735B]" />
            {t.yourTableLabel}
          </label>
          {lockedIdentity ? (
            <div className="w-full px-4 py-3 rounded-2xl border border-[#CBAE94]/40 bg-[#EFE6DC]/60 text-sm font-bold text-[#4A3F35]">
              {tableName || '—'}
            </div>
          ) : (
            <select
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-[#CBAE94]/60 bg-[#FAF6F0] text-sm font-bold text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
            >
              <option value="">{t.selectTablePlaceholder}</option>
              {tables.map((tbl) => (
                <option key={tbl.id} value={tbl.id}>
                  {tbl.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <BackButton />

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

        <div className="pt-2 flex justify-end border-t border-[#CBAE94]/30">
          <button
            type="button"
            onClick={() => { setPrinting(true); printKeepsake(t.gbPrintToast); }}
            className="min-h-[44px] px-4 rounded-xl bg-[#8B735B] text-white font-bold text-xs hover:bg-[#705C47] transition-all flex items-center gap-1.5 shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{t.printMemoryBookBtn}</span>
          </button>
        </div>
      </motion.div>

      {/* Leave-a-wish form or success card */}
      <div className="card-paper p-6 sm:p-8 print:hidden">
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
              identity={identityBlock}
              onFileChange={handleFileChange}
              onRemovePhoto={handleRemovePhoto}
              onSubmit={handleSubmit(onValid)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* The guest's own wishes */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35] flex items-center gap-2">
            <Heart className="w-5 h-5 text-rose-500 fill-rose-400" />
            <span>{t.gbYourWishesTitle}</span>
          </h3>
          {entries.length > 0 && (
            <span className="text-xs font-bold text-[#8B735B]">{entries.length}</span>
          )}
        </div>

        {loadingEntries ? (
          <div className="p-8 text-center text-xs font-bold text-[#8B735B] animate-pulse">
            {t.loadingGuestbookMsg}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState type="guestbook" title={t.gbNoWishesYet} />
        ) : printing ? (
          <div className="space-y-4">
            {entries.map((entry) => (
              <GuestbookEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.id}>
                {editingId === entry.id ? (
                  <div className="card-paper p-5 border-2 border-[#8B735B]/50 space-y-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t.gbNamePlaceholder}
                      className="w-full px-4 py-3 rounded-2xl border-2 border-[#CBAE94] text-sm font-bold bg-white text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
                    />
                    <textarea
                      rows={3}
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      placeholder={t.gbMessagePlaceholder}
                      className="w-full px-4 py-3 rounded-2xl border-2 border-[#CBAE94] text-sm font-medium bg-white text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
                    />

                    {/* Attached photo — replace or remove */}
                    <div className="space-y-2">
                      <label className="label-mono block text-xs">{t.gbPhotoLabel}</label>
                      {editPreviewUrl || (!editRemovePhoto && editExistingPhoto) ? (
                        <div className="relative rounded-2xl overflow-hidden border-2 border-[#CBAE94] bg-white">
                          <img
                            src={editPreviewUrl || editExistingPhoto}
                            alt={t.selectedUploadPreviewAlt}
                            className="w-full h-40 object-cover"
                          />
                          <button
                            type="button"
                            onClick={handleRemoveEditPhoto}
                            aria-label={t.removePhotoBtn}
                            title={t.removePhotoBtn}
                            className="absolute top-2 right-2 min-w-[44px] min-h-[44px] bg-[#8B735B] hover:bg-[#5D5449] text-white rounded-full flex items-center justify-center"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => editFileInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-[#CBAE94] hover:border-[#8B735B] bg-[#EFE6DC]/40 hover:bg-[#EFE6DC] rounded-2xl p-5 text-center cursor-pointer transition-colors space-y-1.5"
                        >
                          <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center mx-auto border border-[#CBAE94]">
                            <Camera className="w-4 h-4 text-[#8B735B]" />
                          </div>
                          <p className="text-xs font-bold text-[#5D5449]">{t.tapToChoosePhoto}</p>
                        </button>
                      )}
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleEditFileChange}
                        className="hidden"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="min-h-[44px] px-4 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#4A3F35] inline-flex items-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        {t.gbCancelWishBtn}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(entry.id)}
                        disabled={savingEdit}
                        className="min-h-[44px] px-4 rounded-xl bg-[#8B735B] text-white text-xs font-bold hover:bg-[#705C47] disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {t.gbSaveWishBtn}
                      </button>
                    </div>
                  </div>
                ) : (
                  <GuestbookEntryCard
                    entry={entry}
                    actions={
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="min-h-[44px] px-3 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#4A3F35] hover:bg-[#EFE6DC] inline-flex items-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {t.gbEditWishBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(entry)}
                          className="min-h-[44px] px-3 rounded-xl border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t.gbDeleteWishBtn}
                        </button>
                      </>
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
