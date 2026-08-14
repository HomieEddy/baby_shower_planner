import { RefObject } from 'react';
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
import { useT } from '../shared/i18n';
import { OptimizedFileItem } from './GuestPhotoUploadPage';

export const PhotoDropzone = ({
  fileInputRef,
  onFileChange,
  onDrop,
  onDragOver,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
}) => {
  const t = useT();
  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onClick={() => fileInputRef.current?.click()}
      className="border-2 border-dashed border-[#CBAE94] hover:border-[#8B735B] bg-[#FAF6F0]/60 hover:bg-[#EFE6DC]/40 rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all space-y-3 group"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/gif"
        onChange={onFileChange}
        className="hidden"
      />

      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EFE6DC] group-hover:bg-[#8B735B] text-[#8B735B] group-hover:text-white flex items-center justify-center transition-colors shadow-sm">
        <UploadCloud className="w-7 h-7" />
      </div>

      <div>
        <p className="text-xs font-bold text-[#4A3F35]">
          {t.tapToChoosePhotos}
        </p>
        <p className="text-[11px] text-[#8B735B] mt-1">
          {t.uploadManyHint}
        </p>
      </div>

      <div className="pt-1 flex items-center justify-center gap-1.5 text-[10px] text-emerald-800 font-medium">
        <Zap className="w-3 h-3 text-amber-600 shrink-0" />
        <span>{t.photoCompressedHint}</span>
      </div>
    </div>
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
          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 transition-colors shadow-sm z-10"
          title={t.removePhotoTitle}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-mono text-white">
          #{index + 1}
        </span>

        {savedPct > 5 && (
          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-emerald-600/90 text-white text-[9px] font-bold shadow-sm flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5 fill-current" />-{savedPct}%
          </span>
        )}
      </div>

      {/* File details info */}
      <div className="p-2 bg-[#FFFDF9] border-t border-[#CBAE94]/30 text-[10px] font-medium text-[#4A3F35] flex items-center justify-between">
        <span className="truncate font-mono text-[#8B735B]">
          {formatFileSize(item.compressedSize)}
        </span>
        <span className="text-[9px] text-emerald-700 font-bold flex items-center gap-0.5">
          <Check className="w-3 h-3 text-emerald-600" />
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
  return (
    <motion.div
      className="bg-[#FFFDF9] rounded-3xl p-8 shadow-xl border border-[#CBAE94] text-center space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        variants={popIn}
        initial="hidden"
        animate="show"
        className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner"
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
        <p className="text-xs sm:text-sm text-[#8B735B] mt-2 max-w-md mx-auto">
          {t.uploadSuccessMsg.replace('{{count}}', String(uploadedPhotos.length))}
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
          className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" />
          <span>{t.uploadMoreBtn}</span>
        </button>
      </div>
    </motion.div>
  );
};
