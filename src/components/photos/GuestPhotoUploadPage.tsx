import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Camera,
  UploadCloud,
  AlertCircle,
  Image as ImageIcon,
  ArrowRight,
  ShieldCheck,
  Building2,
  User,
  MessageSquare,
  Zap,
  FileCheck2,
  KeyRound,
} from 'lucide-react';
import { EventPhoto } from '../../types';
import { decodeApiError } from '../../lib/errors';
import { readGuestLock } from '../../lib/guestLock';
import { compressImage, formatFileSize } from '../../lib/imageCompressor';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { BackButton } from '../shared/BackButton';
import { GuestPageHeader } from '../shared/GuestPageHeader';
import { LockedNotice } from '../shared/LockedNotice';
import { uploadPhotoBase64 } from '../../lib/fileUtils';
import { useAppStore } from '../../stores/appStore';
import { useT, useTf, useApiErrorMessage } from '../shared/i18n';
import { useFloorMapTables } from '../shared/hooks';
import { isValidCode } from '../../lib/validation';
import { PhotoDropzone, PhotoFileCard, UploadSuccessScreen } from './PhotoUploadParts';

export interface OptimizedFileItem {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  width?: number;
  height?: number;
}

export const GuestPhotoUploadPage = () => {
  const language = useAppStore((s) => s.language);
  const t = useT();
  const tf = useTf();
  const apiError = useApiErrorMessage();
  const [searchParams] = useSearchParams();
  const initialTableId = searchParams.get('table') || searchParams.get('tableId') || undefined;
  const initialCode = searchParams.get('code') || '';
  // Arriving from a table QR: the seating area + reservation code are fixed.
  const lockedIdentity = initialCode.length > 0;
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const { data: tables = [] } = useFloorMapTables();
  const [selectedTableId, setSelectedTableId] = useState<string>(initialTableId || '');
  const [uploaderName, setUploaderName] = useState('');
  const [reservationCode, setReservationCode] = useState(initialCode);
  const [caption, setCaption] = useState('');

  const [fileItems, setFileItems] = useState<OptimizedFileItem[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);

  const [fileError, setFileError] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<EventPhoto[]>([]);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Locked check: photo uploads only open during the event window
  const [locked, setLocked] = useState(false);
  const [lockInfo, setLockInfo] = useState<{ opensAt?: string; closesAt?: string } | null>(null);

  useEffect(() => {
    fetch('/api/photos')
      .then(async (res) => {
        const lock = await readGuestLock(res);
        if (lock) {
          setLocked(true);
          setLockInfo(lock);
        }
      })
      .catch(() => {});
  }, []);

  // Pre-select the table from the URL (state is initialized from the query
  // param; the table list may still be loading, so the id is kept as-is).

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    if (!e.target.files || e.target.files.length === 0) return;

    const newFiles = Array.from(e.target.files);
    validateAndAddFiles(newFiles);
  };

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setFileError(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      validateAndAddFiles(droppedFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Validate files and automatically compress/resize images
  const validateAndAddFiles = async (incomingFiles: File[]) => {
    const validPhotoExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];
    const invalidFiles: string[] = [];
    const validFiles: File[] = [];

    incomingFiles.forEach((file) => {
      const isImageMime = file.type.startsWith('image/');
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isPhotoExt = validPhotoExtensions.includes(ext);

      if (isImageMime || isPhotoExt) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      setFileError(tf('uploadInvalidFileToast', { files: invalidFiles.slice(0, 2).join(', ') }));
    }

    // Per-guest quota is 12 photos — cap the batch client-side too.
    const room = Math.max(0, 12 - fileItems.length);
    if (validFiles.length > room) {
      setFileError(t.uploadBatchLimitToast);
      return;
    }

    if (validFiles.length > 0) {
      setIsCompressing(true);
      setCompressionProgress(0);

      const newOptimizedItems: OptimizedFileItem[] = [];

      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        try {
          const result = await compressImage(file, { maxWidth: 1920, maxHeight: 1920, quality: 0.84 });
          const previewUrl = URL.createObjectURL(result.file);

          newOptimizedItems.push({
            id: Math.random().toString(36).substring(2, 9),
            file: result.file,
            previewUrl,
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            width: result.width,
            height: result.height,
          });
        } catch (err) {
          console.error('Compression failed for file, using original:', err);
          const previewUrl = URL.createObjectURL(file);
          newOptimizedItems.push({
            id: Math.random().toString(36).substring(2, 9),
            file,
            previewUrl,
            originalSize: file.size,
            compressedSize: file.size,
          });
        }

        setCompressionProgress(Math.round(((i + 1) / validFiles.length) * 100));
      }

      setFileItems((prev) => [...prev, ...newOptimizedItems]);
      setIsCompressing(false);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFileItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleClearAllFiles = () => {
    fileItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setFileItems([]);
  };

  // Submit Batch Upload
  const handleBatchUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fileItems.length === 0) {
      setFileError(t.uploadSelectErrorToast);
      return;
    }
    if (!isValidCode(reservationCode.trim())) {
      setFileError(t.uploadCodeRequiredToast);
      return;
    }
    if (!(await confirmAction(t.uploadPhotosBtn))) return;

    setIsUploading(true);

    try {
      setUploadProgress(20);

      // 1) Upload each optimized photo as base64 -> /uploads/xxx.jpg
      const photoPayloads: { url: string; filename: string }[] = [];
      for (const item of fileItems) {
        const photoUrl = await uploadPhotoBase64(item.file);
        if (!photoUrl) {
          throw new Error(t.photoUploadFailedToast);
        }
        photoPayloads.push({ url: photoUrl, filename: item.file.name });
      }

      setUploadProgress(60);

      // 2) Register the photo records
      const chosenTable = tables.find((t) => t.id === selectedTableId);
      const res = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploader_name: uploaderName.trim(),
          caption: caption.trim(),
          table_name: chosenTable?.name || '',
          table_id: chosenTable?.id || '',
          reservation_code: reservationCode.trim(),
          photos: photoPayloads,
        }),
      });

      const data = await res.json();
      const { code, message, data: errData } = decodeApiError(data, res.status);

      if (res.status === 403 && code === 'GUEST_CONTENT_LOCKED') {
        // The window closed while this page was open.
        setIsUploading(false);
        setLocked(true);
        setLockInfo({
          opensAt: typeof errData.opensAt === 'string' ? errData.opensAt : undefined,
          closesAt: typeof errData.closesAt === 'string' ? errData.closesAt : undefined,
        });
        return;
      }

      if (!res.ok) {
        if (code === 'INVALID_CODE') {
          throw new Error(t.uploadInvalidCodeToast);
        }
        if (code === 'PHOTO_LIMIT_REACHED') {
          throw new Error(tf('uploadPhotoLimitToast', { remaining: String(errData.remaining ?? 0) }));
        }
        if (code === 'PHOTO_SIZE_LIMIT_REACHED') {
          throw new Error(t.uploadPhotoSizeLimitToast);
        }
        throw new Error(apiError(code, message || t.uploadFailedGeneric));
      }

      setUploadProgress(100);
      setUploadedPhotos(data.photos || []);
      setUploadSuccess(true);
      setIsUploading(false);
      toast.success(tf('uploadSuccessToast', { count: data.photos?.length || 1 }));

      // Clean preview object URLs
      fileItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setFileItems([]);
    } catch (err: any) {
      setIsUploading(false);
      const errMsg = err.message || t.uploadGenericErrorToast;
      setFileError(errMsg);
      toast.error(tf('uploadErrorToast', { error: errMsg }));
    }
  };

  const handleResetForm = () => {
    setUploadSuccess(false);
    setUploadedPhotos([]);
    handleClearAllFiles();
    setCaption('');
    setFileError(null);
  };

  const totalOriginalBytes = fileItems.reduce((acc, item) => acc + item.originalSize, 0);
  const totalCompressedBytes = fileItems.reduce((acc, item) => acc + item.compressedSize, 0);
  const totalSavedBytes = Math.max(0, totalOriginalBytes - totalCompressedBytes);
  const totalSavedPercent =
    totalOriginalBytes > 0 ? Math.round((totalSavedBytes / totalOriginalBytes) * 100) : 0;

  const selectedTableObj = tables.find((t) => t.id === selectedTableId);

  // Locked state: photo uploads only open during the event window
  if (locked) {
    return (
      <div className="py-6 sm:py-10 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-2xl mx-auto">
          <LockedNotice
            title={t.photosLockedTitle}
            message={t.photosLockedMsg}
            lockInfo={lockInfo}
            language={language}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="py-6 sm:py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        <BackButton />

        <GuestPageHeader
          icon={Camera}
          eyebrow={t.photoQrTitle}
          title={t.uploadHeroTitle}
          subtitle={t.uploadHeroDesc}
        >
          {selectedTableObj && (
            <span className="inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-bold">
              <Building2 className="w-3.5 h-3.5" />
              {tf('uploadingFromLabel', { name: selectedTableObj.name })}
            </span>
          )}
        </GuestPageHeader>

        <p className="text-xs text-[#5D5449] text-center max-w-md mx-auto leading-relaxed">
          <ShieldCheck className="inline w-4 h-4 mr-1 -mt-0.5 text-[#8B735B]" aria-hidden />
          <strong>{t.hostConfidentialityLabel}</strong> {t.hostConfidentialityText}
        </p>

        {/* Upload Form or Success Card */}
        {!uploadSuccess ? (
          <form
            onSubmit={handleBatchUpload}
            className="card-soft p-6 sm:p-8 space-y-5"
          >
            {fileError && (
              <div role="alert" className="notice-error animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{fileError}</span>
              </div>
            )}

            {lockedIdentity && (
              <div className="p-3.5 rounded-xl bg-[#EFE6DC]/60 border border-[#CBAE94]/50 text-[#5D5449] text-xs font-medium flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#8B735B] shrink-0 mt-0.5" />
                <span>{t.uploadLockedIdentityNote}</span>
              </div>
            )}

            {/* Reservation code first: the photo quota is per reservation */}
            <div>
              <label htmlFor="up-code" className="guest-label">
                <KeyRound aria-hidden />
                {t.uploadCodeLabel} *
              </label>
              <input
                id="up-code"
                type="text"
                inputMode="numeric"
                maxLength={4}
                required
                disabled={lockedIdentity}
                value={reservationCode}
                onChange={(e) => setReservationCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={t.uploadCodePlaceholder}
                className="guest-input font-mono font-bold tracking-[0.3em] placeholder:tracking-normal placeholder:font-sans placeholder:font-normal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-4">
              <div>
                <label htmlFor="up-name" className="guest-label">
                  <User aria-hidden />
                  {t.yourNameOptional}
                </label>
                <input
                  id="up-name"
                  type="text"
                  value={uploaderName}
                  onChange={(e) => setUploaderName(e.target.value)}
                  placeholder={t.nameExamplePlaceholder}
                  className="guest-input"
                />
              </div>

              <div>
                <label htmlFor="up-table" className="guest-label">
                  <Building2 aria-hidden />
                  {t.yourTableLabel}
                </label>
                <select
                  id="up-table"
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  disabled={lockedIdentity}
                  className="guest-input"
                >
                  <option value="">{t.selectTablePlaceholder}</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {tf('tableOptionWithCapacity', { name: t.name, count: t.capacity })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Photo Caption */}
            <div>
              <label htmlFor="up-caption" className="guest-label">
                <MessageSquare aria-hidden />
                {t.photoCaptionLabel}
              </label>
              <input
                id="up-caption"
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t.captionExamplePlaceholder}
                className="guest-input"
              />
            </div>

            {/* Drag and Drop Multi-Photo Picker Zone */}
            <div>
              <p className="guest-label">
                <ImageIcon aria-hidden />
                {t.selectPhotosLabel}
              </p>

              <PhotoDropzone
                fileInputRef={fileInputRef}
                onFileChange={handleFileChange}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              />
            </div>

            {/* Compression Processing Bar */}
            {isCompressing && (
              <div role="status" className="p-4 rounded-xl bg-[#EFE6DC]/60 border border-[#CBAE94]/50 text-[#4A3F35] space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#4A3F35]">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#8B735B]" />
                    {t.optimizingPhotosMsg}
                  </span>
                  <span className="font-mono">{compressionProgress}%</span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${compressionProgress}%`, backgroundColor: 'var(--accent)' }}
                  />
                </div>
              </div>
            )}

            {/* Selected File Thumbnails */}
            {fileItems.length > 0 && (
              <div className="space-y-4 border-t border-[#CBAE94]/40 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#4A3F35]">
                  <span className="flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-[#8B735B]" />
                    {tf('readyToUploadCount', { count: fileItems.length })}
                  </span>

                  <button
                    type="button"
                    onClick={handleClearAllFiles}
                    className="min-h-[44px] px-3 rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors"
                  >
                    {t.clearAllBtn}
                  </button>
                </div>

                {/* Optimization Savings Banner */}
                {totalSavedBytes > 0 && (
                  <div className="p-3 rounded-xl bg-[#EFE6DC]/60 border border-[#CBAE94]/50 text-[#4A3F35] text-xs font-bold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#8B735B] shrink-0" />
                      <span>
                        {tf('optimizationSavedMsg', { size: formatFileSize(totalSavedBytes), percent: totalSavedPercent })}
                      </span>
                    </div>
                    <span className="text-xs text-[#8B735B] font-mono hidden sm:inline-flex items-center gap-1">
                      {formatFileSize(totalOriginalBytes)}
                      <ArrowRight className="w-3 h-3" />
                      {formatFileSize(totalCompressedBytes)}
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {fileItems.map((item, idx) => (
                    <PhotoFileCard key={item.id} item={item} index={idx} onRemove={handleRemoveFile} />
                  ))}
                </div>
              </div>
            )}

            {/* Upload Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isUploading || isCompressing || fileItems.length === 0}
                className="btn-accent w-full py-3.5 min-h-[52px] text-sm font-bold gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>{tf('uploadingPhotosProgress', { percent: uploadProgress })}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>
                      {fileItems.length > 0 ? tf('uploadOptimizedCount', { count: fileItems.length }) : t.uploadPhotosBtn}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <UploadSuccessScreen uploadedPhotos={uploadedPhotos} onUploadMore={handleResetForm} />
        )}
      </div>
    </div>
  );
};
