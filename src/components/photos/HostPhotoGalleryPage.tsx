import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Camera,
  Image as ImageIcon,
  Trash2,
  Heart,
  QrCode,
  Play,
  Filter,
  Search,
  Building2,
  RefreshCw,
  LayoutGrid,
  Columns,
  CheckSquare,
  Square,
  DownloadCloud,
} from 'lucide-react';
import { useToast } from '../shared/ToastContext';
import { useConfirm } from '../shared/ConfirmDialog';
import { Modal } from '../shared/Modal';
import { adminFetch } from '../../lib/api';
import { useSettingsStore } from '../../stores/settingsStore';
import { EmptyState } from '../shared/EmptyState';
import { PhotoCard } from './PhotoCard';
import { PhotoLightbox } from './PhotoLightbox';
import { PhotoSlideshow } from './PhotoSlideshow';
import { TableQrModal } from './TableQrModal';
import { EventPhoto } from '../../types';
import { useT } from '../shared/i18n';
import { useFloorMapTables } from '../shared/hooks';

export const HostPhotoGalleryPage: React.FC = () => {
  const t = useT();
  const { toast } = useToast();
  const confirm = useConfirm();
  const settings = useSettingsStore((s) => s.settings);
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTableFilter, setSelectedTableFilter] = useState('all');

  // Lightbox Modal state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  // Layout mode state: default to masonry
  const [layoutMode, setLayoutMode] = useState<'masonry' | 'grid'>('masonry');

  // Slideshow state
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [isSlideshowPlaying, setIsSlideshowPlaying] = useState(true);

  // Table QR printable modal state
  const [isTableQrModalOpen, setIsTableQrModalOpen] = useState(false);

  // Photo Selection & ZIP Download State
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [zipStatusMessage, setZipStatusMessage] = useState('');

  const handleToggleSelectPhoto = (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedPhotoIds((prev) =>
      prev.includes(photoId) ? prev.filter((id) => id !== photoId) : [...prev, photoId]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredPhotos.map((p) => p.id);
    const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedPhotoIds.includes(id));
    if (allSelected) {
      setSelectedPhotoIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedPhotoIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPhotoIds.length === 0) return;
    const ok = await confirm({
      title: 'Delete Selected Photos?',
      message: `Are you sure you want to delete ${selectedPhotoIds.length} selected photo(s) from the memory library?`,
      confirmText: 'Delete Photos',
    });
    if (!ok) return;

    try {
      const count = selectedPhotoIds.length;
      for (const photoId of selectedPhotoIds) {
        await adminFetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      }
      setPhotos((prev) => prev.filter((p) => !selectedPhotoIds.includes(p.id)));
      setSelectedPhotoIds([]);
      toast.success(t.galleryDeletedToast.replace('{{count}}', String(count)));
    } catch (err) {
      console.error('Failed to delete selected photos:', err);
      toast.error(t.galleryDeleteFailedToast);
    }
  };

  // ZIP Download Generator
  const handleDownloadZip = async (photosToZip: EventPhoto[], filenamePrefix = 'baby_shower_photos') => {
    if (photosToZip.length === 0) return;
    setIsZipping(true);
    setZipProgress(0);
    setZipStatusMessage('Initializing ZIP archive...');

    try {
      const zip = new JSZip();
      const folder = zip.folder('Baby_Shower_Photos');

      for (let i = 0; i < photosToZip.length; i++) {
        const p = photosToZip[i];
        setZipStatusMessage(`Adding photo ${i + 1} of ${photosToZip.length}...`);

        let ext = 'jpg';
        let dataBuffer: Uint8Array | Blob;

        if (p.url.startsWith('data:')) {
          const mimeMatch = p.url.match(/^data:(image\/\w+);base64,/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          ext = mime.split('/')[1] || 'jpg';
          if (ext === 'jpeg') ext = 'jpg';

          const base64Str = p.url.split(',')[1];
          const binaryStr = atob(base64Str);
          const bytes = new Uint8Array(binaryStr.length);
          for (let j = 0; j < binaryStr.length; j++) {
            bytes[j] = binaryStr.charCodeAt(j);
          }
          dataBuffer = bytes;
        } else {
          const resp = await fetch(p.url);
          dataBuffer = await resp.blob();
          ext = p.url.split('.').pop()?.split('?')[0] || 'jpg';
        }

        const sanitizeName = (str: string) => (str || '').replace(/[^a-zA-Z0-9_-]/g, '_');
        const tableName = sanitizeName(p.table_name || 'Table');
        const uploaderName = sanitizeName(p.uploader_name || 'Guest');
        const filename = `${tableName}_${uploaderName}_${i + 1}.${ext}`;

        if (folder) {
          folder.file(filename, dataBuffer);
        } else {
          zip.file(filename, dataBuffer);
        }

        setZipProgress(Math.round(((i + 1) / photosToZip.length) * 85));
      }

      setZipStatusMessage('Compressing ZIP archive...');
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        setZipProgress(85 + Math.round(metadata.percent * 0.15));
      });

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setZipProgress(100);
      setZipStatusMessage('ZIP download started!');
      setTimeout(() => {
        setIsZipping(false);
        setZipStatusMessage('');
      }, 1200);
    } catch (err) {
      console.error('Error generating ZIP archive:', err);
      alert('Failed to generate ZIP archive. Please try again.');
      setIsZipping(false);
    }
  };

  const fetchPhotos = async () => {
    setIsLoading(true);
    try {
      const res = await adminFetch('/api/photos');
      const data = await res.json();
      if (data.photos) setPhotos(data.photos);
    } catch (err) {
      console.error('Error fetching photos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const { data: tables = [] } = useFloorMapTables();

  useEffect(() => {
    fetchPhotos();
  }, []);

  // Slideshow auto-advance timer
  useEffect(() => {
    if (!isSlideshowActive || !isSlideshowPlaying || photos.length === 0) return;

    const timer = setInterval(() => {
      setSlideshowIndex((prev) => (prev + 1) % photos.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [isSlideshowActive, isSlideshowPlaying, photos.length]);

  const handleDeletePhoto = async (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const ok = await confirm({
      title: 'Delete Photo?',
      message: 'Are you sure you want to delete this photo from the memory library?',
      confirmText: 'Delete Photo',
    });
    if (!ok) return;

    try {
      const res = await adminFetch(`/api/photos/${photoId}`, { method: 'DELETE' });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
        if (selectedPhotoIndex !== null) {
          setSelectedPhotoIndex(null);
        }
        toast.success(t.galleryPhotoRemovedToast);
      } else {
        toast.error(t.galleryDeleteErrorToast);
      }
    } catch (err) {
      console.error('Failed to delete photo:', err);
      toast.error(t.galleryDeleteErrToast);
    }
  };

  const handleLikePhoto = async (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    try {
      const res = await adminFetch(`/api/photos/${photoId}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.photo) {
        setPhotos((prev) => prev.map((p) => (p.id === photoId ? data.photo : p)));
        toast.love(t.galleryLikedToast);
      }
    } catch (err) {
      console.error('Failed to like photo:', err);
    }
  };

  // Filtered photos
  const filteredPhotos = photos.filter((p) => {
    const matchesSearch =
      (p.caption || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.uploader_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.table_name || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTable =
      selectedTableFilter === 'all' ||
      p.table_id === selectedTableFilter ||
      p.table_name === selectedTableFilter;

    return matchesSearch && matchesTable;
  });

  const selectedPhoto = selectedPhotoIndex !== null ? filteredPhotos[selectedPhotoIndex] : null;

  return (
    <div className="min-h-screen bg-[#FAF6F0] py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#FFFDF9] p-6 sm:p-8 rounded-3xl border border-[#CBAE94]/60 shadow-lg">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold uppercase tracking-wider border border-amber-300">
              <Camera className="w-3.5 h-3.5 text-amber-700" />
              <span>{t.privateHostGalleryLabel}</span>
            </div>
            <h1 className="font-gaegu text-3xl sm:text-4xl font-bold text-[#4A3F35]">
              {settings?.parentsNames ? `${settings.parentsNames}'s Photo Memory Library` : "Hosts' Photo Memory Library"}
            </h1>
            <p className="text-xs sm:text-sm text-[#8B735B]">
              Real-time gallery of pictures snapped & uploaded by guests from their event tables.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsTableQrModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2"
            >
              <QrCode className="w-4 h-4" />
              <span>{t.printTableQrBtn}</span>
            </button>

            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => handleDownloadZip(photos, 'all_baby_shower_photos')}
                disabled={isZipping}
                className="px-4 py-2.5 rounded-2xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-md transition-all flex items-center gap-2"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>{t.downloadZipBtn}</span>
              </button>
            )}

            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSlideshowIndex(0);
                  setIsSlideshowPlaying(true);
                  setIsSlideshowActive(true);
                }}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-800 hover:brightness-110 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{t.venueSlideshowBtn}</span>
              </button>
            )}

            <button
              type="button"
              onClick={fetchPhotos}
              className="p-2.5 rounded-2xl bg-[#EFE6DC] hover:bg-[#CBAE94]/40 text-[#4A3F35] transition-colors"
              title={t.refreshGalleryBtn}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Gallery Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#FFFDF9] p-5 rounded-2xl border border-[#CBAE94]/40 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8B735B]">
                {t.totalUploadedPhotos}
              </p>
              <p className="text-2xl font-bold text-[#4A3F35] mt-0.5">{photos.length}</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <ImageIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#FFFDF9] p-5 rounded-2xl border border-[#CBAE94]/40 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8B735B]">
                {t.activeGuestTables}
              </p>
              <p className="text-2xl font-bold text-[#4A3F35] mt-0.5">
                {new Set(photos.map((p) => p.table_name)).size}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-[#FFFDF9] p-5 rounded-2xl border border-[#CBAE94]/40 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#8B735B]">
                {t.totalGuestLikes}
              </p>
              <p className="text-2xl font-bold text-[#4A3F35] mt-0.5">
                {photos.reduce((sum, p) => sum + (p.likes || 0), 0)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center">
              <Heart className="w-5 h-5 fill-rose-500" />
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#FFFDF9] p-4 rounded-2xl border border-[#CBAE94]/50">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[#8B735B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPhotosPh}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-[#FAF6F0] border border-[#CBAE94]/60 text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* Select All Toggle Button */}
            {filteredPhotos.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                  filteredPhotos.length > 0 && filteredPhotos.every((p) => selectedPhotoIds.includes(p.id))
                    ? 'bg-[#8B735B] text-white border-[#8B735B] shadow-xs'
                    : 'bg-[#FAF6F0] text-[#4A3F35] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
                }`}
              >
                {filteredPhotos.length > 0 && filteredPhotos.every((p) => selectedPhotoIds.includes(p.id)) ? (
                  <CheckSquare className="w-4 h-4 text-white" />
                ) : (
                  <Square className="w-4 h-4 text-[#8B735B]" />
                )}
                <span className="hidden sm:inline">
                  {filteredPhotos.length > 0 && filteredPhotos.every((p) => selectedPhotoIds.includes(p.id))
                    ? 'Deselect All'
                    : `Select All (${filteredPhotos.length})`}
                </span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#8B735B]" />
              <select
                value={selectedTableFilter}
                onChange={(e) => setSelectedTableFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#CBAE94]/60 text-xs font-bold text-[#4A3F35] focus:outline-none"
              >
                <option value="all">All Venue Tables ({photos.length})</option>
                {tables.map((t) => {
                  const count = photos.filter(
                    (p) => p.table_id === t.id || p.table_name === t.name
                  ).length;
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name} ({count} photos)
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Layout Mode Switcher */}
            <div className="flex items-center bg-[#FAF6F0] p-1 rounded-xl border border-[#CBAE94]/60">
              <button
                type="button"
                onClick={() => setLayoutMode('masonry')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                  layoutMode === 'masonry'
                    ? 'bg-[#8B735B] text-white shadow-xs'
                    : 'text-[#8B735B] hover:text-[#4A3F35]'
                }`}
                title={t.masonryLayoutLabel}
              >
                <Columns className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px]">{t.masonryLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                  layoutMode === 'grid'
                    ? 'bg-[#8B735B] text-white shadow-xs'
                    : 'text-[#8B735B] hover:text-[#4A3F35]'
                }`}
                title={t.gridLayoutLabel}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px]">{t.gridLabel}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sticky Batch Actions Toolbar */}
        {selectedPhotoIds.length > 0 && (
          <div className="sticky top-4 z-30 bg-[#4A3F35] text-white px-5 py-3.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 transition-all">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-amber-400 text-[#4A3F35] text-xs font-bold flex items-center justify-center">
                {selectedPhotoIds.length}
              </span>
              <span className="text-xs sm:text-sm font-bold">
                {selectedPhotoIds.length} photo{selectedPhotoIds.length > 1 ? 's' : ''} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const selectedPhotos = photos.filter((p) => selectedPhotoIds.includes(p.id));
                  handleDownloadZip(selectedPhotos, `selected_photos_${selectedPhotoIds.length}`);
                }}
                disabled={isZipping}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#4A3F35] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>Download Selected ZIP ({selectedPhotoIds.length})</span>
              </button>

              <button
                type="button"
                onClick={handleBatchDelete}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.deleteSelectedBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPhotoIds([])}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Photos Grid / Masonry Wall */}
        {filteredPhotos.length === 0 ? (
          <EmptyState
            type={photos.length === 0 ? 'photos' : 'search'}
            title={photos.length === 0 ? 'No Guest Photos Uploaded Yet' : 'No Matching Photos Found'}
            description={
              photos.length === 0
                ? 'Your memory library is sparkling clean! Print Table QR Cards or invite guests to start uploading candid photos from their seats.'
                : 'No photos matched your current search keyword or table filter. Try adjusting your query or resetting filters.'
            }
            actionLabel={photos.length === 0 ? t.galleryPrintQrBtn2 : t.galleryClearFiltersBtn}
            onAction={
              photos.length === 0
                ? () => setIsTableQrModalOpen(true)
                : () => {
                    setSearchQuery('');
                    setSelectedTableFilter('all');
                    toast.info(t.galleryFiltersResetToast);
                  }
            }
          />
        ) : (
          <div
            className={
              layoutMode === 'masonry'
                ? 'columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4'
                : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
            }
          >
            {filteredPhotos.map((photo, index) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                isSelected={selectedPhotoIds.includes(photo.id)}
                layoutMode={layoutMode}
                onSelect={(id) => handleToggleSelectPhoto(id)}
                onDelete={handleDeletePhoto}
                onLike={handleLikePhoto}
                onClick={() => setSelectedPhotoIndex(index)}
              />
            ))}
          </div>
        )}

        {/* Lightbox Single Photo Modal */}
        {selectedPhoto && (
          <PhotoLightbox
            photo={selectedPhoto}
            onClose={() => setSelectedPhotoIndex(null)}
            onPrev={selectedPhotoIndex !== null && selectedPhotoIndex > 0 ? () => setSelectedPhotoIndex(selectedPhotoIndex - 1) : undefined}
            onNext={selectedPhotoIndex !== null && selectedPhotoIndex < filteredPhotos.length - 1 ? () => setSelectedPhotoIndex(selectedPhotoIndex + 1) : undefined}
            onDelete={handleDeletePhoto}
          />
        )}

        {/* Venue Fullscreen Slideshow Mode */}
        {isSlideshowActive && photos.length > 0 && (
          <PhotoSlideshow
            photos={photos}
            currentIndex={slideshowIndex}
            isPlaying={isSlideshowPlaying}
            onTogglePlay={() => setIsSlideshowPlaying(!isSlideshowPlaying)}
            onClose={() => setIsSlideshowActive(false)}
          />
        )}

        {/* Print Table QR Cards Modal */}
        <TableQrModal open={isTableQrModalOpen} onClose={() => setIsTableQrModalOpen(false)} tables={tables} />

        {/* ZIP Compression Progress Modal */}
        <Modal open={isZipping} onClose={() => {}} dismissible={false} maxWidth="md">
          <div className="text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 text-amber-800 flex items-center justify-center animate-bounce">
              <DownloadCloud className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
                Packaging Photo ZIP Archive
              </h3>
              <p className="text-xs text-[#8B735B] font-medium mt-1">
                {zipStatusMessage || 'Compressing photos into a ZIP archive...'}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-[#EFE6DC] h-3 rounded-full overflow-hidden p-0.5 border border-[#CBAE94]/40">
              <div
                className="bg-gradient-to-r from-amber-600 to-amber-700 h-full rounded-full transition-all duration-300"
                style={{ width: `${zipProgress}%` }}
              />
            </div>
            <p className="text-[11px] font-mono font-bold text-[#8B735B]">
              {zipProgress}% Completed
            </p>
          </div>
        </Modal>
      </div>
    </div>
  );
};
