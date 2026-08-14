import { useRef } from 'react';
import { FieldErrors, UseFormRegister } from 'react-hook-form';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Send, X, CheckCircle2, Sparkles } from 'lucide-react';
import { z } from 'zod';
import { GuestbookEntrySchema } from '../../lib/validation';
import { useT } from '../shared/i18n';

type GuestbookFormValues = z.infer<typeof GuestbookEntrySchema>;

interface GuestbookFormProps {
  register: UseFormRegister<GuestbookFormValues>;
  errors: FieldErrors<GuestbookFormValues>;
  submitting: boolean;
  previewUrl: string | null;
  nameInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
  onSubmit: () => void;
}

export const GuestbookForm = ({
  register,
  errors,
  submitting,
  previewUrl,
  nameInputRef,
  onFileChange,
  onRemovePhoto,
  onSubmit,
}: GuestbookFormProps) => {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <motion.form
      key="form"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      onSubmit={onSubmit}
      className="space-y-6"
    >
      {/* Name Input */}
      <div className="space-y-1.5">
        <label className="label-mono block">
          {t.gbNameLabel} *
        </label>
        {(() => {
          const nameField = register('guest_name');
          const { ref: nameRef, ...nameFieldProps } = nameField;
          return (
            <input
              type="text"
              required
              ref={(el) => { nameRef(el); nameInputRef.current = el; }}
              {...nameFieldProps}
              placeholder={t.gbNamePlaceholder}
              className="w-full px-4 py-3 rounded-2xl border-2 border-[#CBAE94] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white text-[#5D5449]"
            />
          );
        })()}
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
              onClick={onRemovePhoto}
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
          onChange={onFileChange}
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
  );
};

export const GuestbookSuccess = ({ onLeaveAnother }: { onLeaveAnother: () => void }) => {
  const t = useT();
  return (
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
        onClick={onLeaveAnother}
        className="btn-accent w-full text-sm space-x-2 cursor-pointer"
      >
        <Sparkles className="w-4 h-4 mr-2 text-white" />
        <span>{t.gbLeaveAnotherBtn}</span>
      </motion.button>
    </motion.div>
  );
};
