import React from 'react';
import { Sparkles, Play, Pause, X } from 'lucide-react';
import { EventPhoto } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { useT } from '../shared/i18n';

interface PhotoSlideshowProps {
  photos: EventPhoto[];
  currentIndex: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onClose: () => void;
}

export const PhotoSlideshow: React.FC<PhotoSlideshowProps> = ({
  photos,
  currentIndex,
  isPlaying,
  onTogglePlay,
  onClose,
}) => {
  const t = useT();
  const settings = useSettingsStore((s) => s.settings);
  const photo = photos[currentIndex];

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between p-6 animate-fadeIn">
      <div className="w-full flex items-center justify-between text-white/80 text-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span className="font-gaegu text-xl font-bold text-white">
            {settings?.parentsNames ? `${settings.parentsNames}'s Memory Slideshow` : 'Memory Slideshow'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePlay}
            className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1.5"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>{isPlaying ? t.pauseBtn : t.playBtn}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 w-full flex items-center justify-center p-4">
        <img
          src={photo.url}
          alt={photo.caption || 'Slideshow photo'}
          className="max-h-[80vh] max-w-full object-contain rounded-2xl shadow-2xl border-2 border-white/20"
        />
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 max-w-xl w-full text-center text-white space-y-1">
        <p className="text-base font-bold text-amber-200">
          {photo.caption || t.memoryMomentTitle}
        </p>
        <p className="text-xs text-white/80">
          Uploaded by {photo.uploader_name} • {photo.table_name}
        </p>
      </div>
    </div>
  );
};
