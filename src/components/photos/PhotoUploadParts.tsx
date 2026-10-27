import { RefObject, useState } from 'react';
import { motion } from 'motion/react';
import {
  UploadCloud,
  Zap,
  X,
  Check,
  Camera,
  CheckCircle2,
} from 'lucide-react';
import { EventPhoto } from '../../types';
import { formatFileSize } from '../../lib/imageCompressor';
import { cardStagger, cardItem, popIn } from '../shared/motionPresets';
import { useT, useTf } from '../shared/i18n';
import { OptimizedFileItem } from './GuestPhotoUploadPage';

export const PhotoDropzone = ({
  fileInputRef,
  onFileChange,
  onDrop,
  onDragOver,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
}) => {
  const t = useT();
  const [dragActive, setDragActive] = useState(false);
  return (
    <label
      onDrop={(e) => { setDragActive(false); onDrop(e); }}
      onDragOver={(e) => { setDragActive(true); onDragOver(e); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
      className={`block border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all space-y-3 group ${
        dragActive
          ? 'border-[#8B735B] bg-[#EFE6DC]/60 ring-2 ring-[#8B735B]/30'
          : 'border-[#CBAE94] hover:border-[#8B735B] bg-[#EFE6DC]/30'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif"
        onChange={onFileChange}
        className="sr-only"
      />

      <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-[#CBAE94]/60 flex items-center justify-center transition-transform group-hover:-translate-y-0.5">
        <UploadCloud className="w-6 h-6 text-[#8B735B]" />
      </div>

      <div>
        <p className="text-xs font-bold text-[#4A3F35]">
          {t.tapToChoosePhotos}
        </p>
        <p className="text-xs text-[#5D5449] mt-1">
          {t.uploadManyHint}
        </p>
      </div>

      <div className="pt-1 flex items-center justify-center gap-1.5 text-xs text-[#5D5449]">
        <Zap className="w-3 h-3 text-[#8B735B] shrink-0" />
        <span>{t.photoCompressedHint}</span>
      </div>
    </label>
  );
};

export const PhotoFileCard = ({
  item,
  index,
  onRemove,
}: {
  item: OptimizedFileItem;
  index: number;
  onRemove: (id: string) => void;
}) => {
  const t = useT();
  const savedPct =
    item.originalSize > 0
      ? Math.round(((item.originalSize - item.compressedSize) / item.originalSize) * 100)
      : 0;

  return (
    <div
      className="relative group rounded-2xl overflow-hidden border border-[#CBAE94]/60 bg-white shadow-xs flex flex-col"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        <img
          src={item.previewUrl}
          alt={`Upload preview ${index}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.id);
          }}
          className="absolute top-1.5 right-1.5 min-w-[44px] min-h-[44px] rounded-full bg-black/60 text-white hover:bg-rose-600 transition-colors shadow-sm z-10 flex items-center justify-center"
          title={t.removePhotoTitle}
          aria-label={t.removePhotoTitle}
        >
          <X className="w-4 h-4" />
        </button>

        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-xs font-mono text-white">
          #{index + 1}
        </span>

        {savedPct > 5 && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-xs font-bold flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5 fill-current" />-{savedPct}%
          </span>
        )}
      </div>

      {/* File details info */}
      <div className="p-2 bg-[#FFFDF9] border-t border-[#CBAE94]/30 text-xs font-medium text-[#4A3F35] flex items-center justify-between">
        <span className="truncate font-mono text-[#8B735B]">
          {formatFileSize(item.compressedSize)}
        </span>
        <span className="text-xs text-[#4A3F35] font-bold flex items-center gap-0.5">
          <Check className="w-3 h-3 text-[#8B735B]" />
          {t.readyLabel}
        </span>
      </div>
    </div>
  );
};

export const UploadSuccessScreen = ({
  uploadedPhotos,
  onUploadMore,
}: {
  uploadedPhotos: EventPhoto[];
  onUploadMore: () => void;
}) => {
  const t = useT();
  const tf = useTf();
  return (
    <motion.div
      className="card-guest p-6 sm:p-8 text-center space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        variants={popIn}
        initial="hidden"
        animate="show"
        className="w-16 h-16 mx-auto rounded-full bg-[#EFE6DC] text-[#8B735B] border border-[#CBAE94]/60 flex items-center justify-center"
      >
        <motion.span
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <CheckCircle2 className="w-10 h-10" />
        </motion.span>
      </motion.div>

      <div>
        <h2 className="font-gaegu text-3xl font-bold text-[#4A3F35]">
          {t.thankYouSharingTitle}
        </h2>
        <p className="text-sm text-[#5D5449] mt-2 max-w-md mx-auto">
          {tf('uploadSuccessMsg', { count: uploadedPhotos.length })}
        </p>
      </div>

      {/* Preview of uploaded items */}
      {uploadedPhotos.length > 0 && (
        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto"
          variants={cardStagger}
          initial="hidden"
          animate="show"
        >
          {uploadedPhotos.map((p) => (
            <motion.div
              key={p.id}
              variants={cardItem}
              className="rounded-2xl overflow-hidden border border-[#CBAE94]/40 aspect-square shadow-sm bg-slate-50"
            >
              <img src={p.url} alt={p.caption || 'Uploaded photo'} className="w-full h-full object-cover" />
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={onUploadMore}
          className="btn-accent w-full sm:w-auto px-6 py-3 text-sm font-bold gap-2"
        >
          <Camera className="w-4 h-4" />
          <span>{t.uploadMoreBtn}</span>
        </button>
      </div>
    </motion.div>
  );
};
