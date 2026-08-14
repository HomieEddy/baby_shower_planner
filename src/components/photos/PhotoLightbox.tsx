import React from 'react';
import { X, ChevronLeft, ChevronRight, Download, Trash2 } from 'lucide-react';
import { EventPhoto } from '../../types';
import { useT } from '../shared/i18n';

interface PhotoLightboxProps {
  photo: EventPhoto;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete: (id: string) => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photo,
  onClose,
  onPrev,
  onNext,
  onDelete,
}) => {
    const t = useT();
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2.5 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          className="absolute left-4 p-3 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {onNext && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-4 p-3 rounded-full bg-white/20 text-white hover:bg-white/40 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <div className="max-w-4xl w-full max-h-[90vh] flex flex-col items-center space-y-4">
        <div className="max-h-[70vh] rounded-2xl overflow-hidden shadow-2xl">
          <img
            src={photo.url}
            alt={photo.caption || 'Full view photo'}
            className="max-h-[70vh] w-auto object-contain"
          />
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 w-full text-white text-center space-y-2">
          <p className="text-sm font-bold">{photo.caption || 'No caption provided'}</p>
          <div className="flex items-center justify-center gap-4 text-xs text-amber-200">
            <span>{t.uploaderLabel} <strong>{photo.uploader_name}</strong></span>
            <span>•</span>
            <span>{t.tableLabel} <strong>{photo.table_name}</strong></span>
            <span>•</span>
            <span>Uploaded: {new Date(photo.created_at).toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <a
              href={photo.url}
              download={photo.filename || 'baby-shower-photo.jpg'}
              className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>{t.downloadOriginalBtn}</span>
            </a>

            <button
              type="button"
              onClick={() => onDelete(photo.id)}
              className="px-4 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t.deletePhotoBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
