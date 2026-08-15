import React from 'react';
import { useT } from '../shared/i18n';
import { Heart, Trash2, Check, Square, EyeOff, Eye } from 'lucide-react';
import { EventPhoto } from '../../types';

interface PhotoCardProps {
  photo: EventPhoto;
  isSelected: boolean;
  layoutMode: 'masonry' | 'grid';
  liked: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onClick: (photo: EventPhoto) => void;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({
  photo,
  isSelected,
  layoutMode,
  liked,
  onSelect,
  onDelete,
  onLike,
  onToggleHidden,
  onClick,
}) => {
  const t = useT();
  const hidden = photo.visible === false;
  return (
    <div
      onClick={() => onClick(photo)}
      className={`group relative bg-white rounded-3xl overflow-hidden border transition-all cursor-pointer flex flex-col ${
        hidden ? 'opacity-60 border-dashed' : ''
      } ${
        isSelected
          ? 'ring-2 ring-[#8B735B] border-[#8B735B] shadow-md bg-amber-50/20'
          : 'border-[#CBAE94]/50 shadow-sm hover:shadow-md'
      } ${layoutMode === 'masonry' ? 'break-inside-avoid mb-4' : ''}`}
    >
      <div
        className={`relative overflow-hidden bg-[#EFE6DC]/30 ${
          layoutMode === 'grid' ? 'aspect-square' : ''
        }`}
      >
        <img
          src={photo.url}
          alt={photo.caption || 'Guest photo'}
          loading="lazy"
          className={`w-full object-cover group-hover:scale-105 transition-transform duration-300 block ${
            layoutMode === 'masonry' ? 'h-auto max-h-[550px]' : 'h-full'
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3.5 text-white">
          <span className="text-xs font-medium line-clamp-2 leading-tight">
            {photo.caption || t.tapToViewDetails}
          </span>
        </div>

        {hidden && (
          <span className="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 rounded-full bg-rose-600 text-white text-[10px] font-bold font-mono uppercase shadow-sm">
            {t.moderationHiddenBadge}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(photo.id); }}
          className={`absolute top-2.5 left-2.5 z-10 p-1.5 rounded-xl transition-all shadow-sm flex items-center justify-center ${
            isSelected
              ? 'bg-[#8B735B] text-white ring-2 ring-white scale-105 opacity-100'
              : 'bg-black/50 text-white/90 hover:bg-black/70 group-hover:opacity-100 opacity-80 sm:opacity-0'
          } ${hidden ? 'left-16' : ''}`}
          title={isSelected ? t.deselectPhotoTitle : t.selectPhotoTitle}
        >
          {isSelected ? <Check className="w-4 h-4 stroke-[3]" /> : <Square className="w-4 h-4" />}
        </button>

        {photo.table_name && (
          <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-bold border border-white/20 shadow-sm pointer-events-none">
            {photo.table_name}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleHidden(photo.id); }}
          className="absolute top-2.5 right-10 p-1.5 rounded-xl bg-black/60 text-white hover:bg-[#8B735B] transition-colors opacity-0 group-hover:opacity-100 shadow-sm"
          title={hidden ? t.moderationShowBtn : t.moderationHideBtn}
        >
          {hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-xl bg-black/60 text-white hover:bg-rose-600 transition-colors opacity-0 group-hover:opacity-100 shadow-sm"
          title={t.deletePhotoBtn}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3.5 bg-[#FFFDF9] flex items-center justify-between gap-2 border-t border-[#CBAE94]/30">
        <div className="truncate">
          <p className="text-xs font-bold text-[#4A3F35] truncate">
            {photo.uploader_name || t.guestPhotoAlt}
          </p>
          <p className="text-[10px] text-[#8B735B]">
            {new Date(photo.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onLike(photo.id); }}
          className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:scale-110 transition-transform p-1"
        >
          <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-rose-500' : ''}`} />
          <span>{photo.likes || 0}</span>
        </button>
      </div>
    </div>
  );
};
