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
  Lock,
} from 'lucide-react';
import { EventPhoto } from '../../types';
import { compressImage, formatFileSize } from '../../lib/imageCompressor';
import { useToast } from '../shared/ToastContext';
import { formatGuestWindow } from '../../lib/dateUtils';
import { uploadPhotoBase64 } from '../../lib/fileUtils';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
import { useFloorMapTables } from '../shared/hooks';
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
  const [searchParams] = useSearchParams();
  const initialTableId = searchParams.get('tableId') || undefined;
  const { toast } = useToast();
  const { data: tables = [] } = useFloorMapTables();
  const [selectedTableId, setSelectedTableId] = useState<string>(initialTableId || '');
  const [uploaderName, setUploaderName] = useState('');
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
      .then((res) => {
        if (res.status === 403) {
          return res.json().then((data) => {
            setLocked(true);
            setLockInfo({ opensAt: data.opensAt, closesAt: data.closesAt });
          });
        }
        return null;
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
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setFileError(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      validateAndAddFiles(droppedFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
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
      setFileError(t.uploadInvalidFileToast.replace('{{files}}', invalidFiles.slice(0, 2).join(', ')));
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

    setIsUploading(true);

    try {
      setUploadProgress(20);

      // 1) Upload each optimized photo as base64 -> /uploads/xxx.jpg
      const photoPayloads: { url: string; filename: string }[] = [];
      for (const item of fileItems) {
        const photoUrl = await uploadPhotoBase64(item.file);
        if (!photoUrl) {
          throw new Error('Photo upload failed. Please try again.');
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
          photos: photoPayloads,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadProgress(100);
      setUploadedPhotos(data.photos || []);
      setUploadSuccess(true);
      setIsUploading(false);
      toast.success(t.uploadSuccessToast.replace('{{count}}', String(data.photos?.length || 1)));

      // Clean preview object URLs
      fileItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setFileItems([]);
    } catch (err: any) {
      setIsUploading(false);
      const errMsg = err.message || 'An error occurred during upload. Please try again.';
      setFileError(errMsg);
      toast.error(t.uploadErrorToast.replace('{{error}}', errMsg));
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
      <div className="min-h-screen bg-[#FAF6F0] py-8 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-2xl mx-auto">
          <div className="card-paper p-10 sm:p-14 text-center space-y-4">
            <div className="w-14 h-14 bg-[#E9E0D2] text-[#8B735B] rounded-full flex items-center justify-center mx-auto border-2 border-[#CBAE94]">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="font-newsreader text-2xl sm:text-3xl font-bold text-[#4A3F35]">
              {t.photosLockedTitle}
            </h2>
            <p className="text-sm text-[#4A3F35]/70 font-sans leading-relaxed max-w-md mx-auto">
              {t.photosLockedMsg}
            </p>
            {lockInfo && (
              <p className="text-xs font-mono font-bold text-[#8B735B] pt-2">
                {formatGuestWindow(lockInfo.opensAt, lockInfo.closesAt, language)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#8B735B] via-[#705C47] to-[#4A3F35] text-white p-6 sm:p-8 shadow-xl border border-[#CBAE94]/40">
          <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
            <Camera className="w-64 h-64 text-white" />
          </div>

          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-amber-200 text-xs font-bold tracking-wide uppercase border border-white/20">
              <Camera className="w-3.5 h-3.5" />
              <span>{t.photoQrTitle}</span>
            </div>

            <h1 className="font-gaegu text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              {t.uploadHeroTitle}
            </h1>

            <p className="text-sm sm:text-base text-amber-100/90 max-w-xl leading-relaxed">
              {t.uploadHeroDesc}
            </p>

            {selectedTableObj && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-400/20 border border-amber-300/40 text-amber-100 text-xs font-bold mt-2">
                <Building2 className="w-4 h-4 text-amber-200" />
                <span>Uploading from: {selectedTableObj.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Private Host Notice */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-medium">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
          <span>
            <strong>{t.hostConfidentialityLabel}</strong> {t.hostConfidentialityText}
          </span>
        </div>

        {/* Upload Form or Success Card */}
        {!uploadSuccess ? (
          <form
            onSubmit={handleBatchUpload}
            className="bg-[#FFFDF9] rounded-3xl p-6 sm:p-8 shadow-lg border border-[#CBAE94]/50 space-y-6"
          >
            {fileError && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5 animate-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{fileError}</span>
              </div>
            )}

            {/* Table & Guest Identity Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Select Table */}
              <div>
                <label className="block text-xs font-bold text-[#4A3F35] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#8B735B]" />
                  {t.yourTableLabel}
                </label>
                <select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-[#FAF6F0] border border-[#CBAE94]/60 text-xs font-bold text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
                >
                  <option value="">{t.selectTablePlaceholder}</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (Cap: {t.capacity})
                    </option>
                  ))}
                </select>
              </div>

              {/* Guest Name */}
              <div>
                <label className="block text-xs font-bold text-[#4A3F35] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#8B735B]" />
                  {t.yourNameOptional}
                </label>
                <input
                  type="text"
                  value={uploaderName}
                  onChange={(e) => setUploaderName(e.target.value)}
                  placeholder={t.nameExamplePlaceholder}
                  className="w-full px-4 py-3 rounded-2xl bg-[#FAF6F0] border border-[#CBAE94]/60 text-xs font-medium text-[#4A3F35] placeholder-[#8B735B]/60 focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
                />
              </div>
            </div>

            {/* Photo Caption */}
            <div>
              <label className="block text-xs font-bold text-[#4A3F35] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#8B735B]" />
                {t.photoCaptionLabel}
              </label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t.captionExamplePlaceholder}
                className="w-full px-4 py-3 rounded-2xl bg-[#FAF6F0] border border-[#CBAE94]/60 text-xs font-medium text-[#4A3F35] placeholder-[#8B735B]/60 focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
              />
            </div>

            {/* Drag and Drop Multi-Photo Picker Zone */}
            <div>
              <label className="block text-xs font-bold text-[#4A3F35] uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#8B735B]" />
                  {t.selectPhotosLabel}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  <Zap className="w-3 h-3 text-emerald-600 fill-emerald-500" />
                  {t.autoResizedLabel}
                </span>
              </label>

              <PhotoDropzone
                fileInputRef={fileInputRef}
                onFileChange={handleFileChange}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              />
            </div>

            {/* Compression Processing Bar */}
            {isCompressing && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-[#4A3F35] space-y-2 animate-pulse">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-600 animate-bounce" />
                    {t.optimizingPhotosMsg}
                  </span>
                  <span>{compressionProgress}%</span>
                </div>
                <div className="w-full bg-amber-200/60 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-600 h-full rounded-full transition-all duration-200"
                    style={{ width: `${compressionProgress}%` }}
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
                    Ready to Upload ({fileItems.length} photo/s)
                  </span>

                  <button
                    type="button"
                    onClick={handleClearAllFiles}
                    className="text-rose-600 hover:underline text-[11px] font-bold"
                  >
                    {t.clearAllBtn}
                  </button>
                </div>

                {/* Optimization Savings Banner */}
                {totalSavedBytes > 0 && (
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-600 fill-emerald-500 shrink-0" />
                      <span>
                        Automatic Optimization Saved {formatFileSize(totalSavedBytes)} ({totalSavedPercent}% smaller payload!)
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-mono hidden sm:inline flex items-center gap-1">
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
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#8B735B] via-[#705C47] to-[#4A3F35] hover:brightness-110 text-white text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-98"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Uploading Photos ({uploadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-5 h-5 text-amber-200" />
                    <span>
                      Upload {fileItems.length > 0 ? `${fileItems.length} Optimized Photo(s)` : 'Photos'}
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
