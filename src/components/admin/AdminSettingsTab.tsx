import React, { useState } from 'react';
import { TextInput } from '../shared/ui';
import { motion } from 'motion/react';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import {
  Settings,
  Clock,
  Building,
  Gift,
  Calendar as CalendarIcon,
  Palette,
  Save,
  Trash2,
  Plus,
  Lock,
  GripVertical,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EventSettings, ScheduleItem, Language } from '../../types';
import { Translations } from '../../translations';
import { parseToYmd, formatDateLong, parseTimeRange, formatTimeRangeString } from '../../lib/dateUtils';
import { THEME_PRESETS, getThemeById, applyThemeToDocument, getContrastTextColor } from '../../themePresets';
import { useToast } from '../shared/ToastContext';

// ISO timestamp -> <TextInput type="datetime-local"> value (local time)
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface AdminSettingsTabProps {
  language: Language;
  t: Translations;
  settings?: EventSettings | null;
  onSave: (data: Partial<EventSettings>) => Promise<EventSettings>;
}

interface SortableScheduleItemProps {
  item: ScheduleItem;
  index: number;
  t: Translations;
  onRemove: (index: number) => void;
  onChange: (index: number, key: keyof ScheduleItem, value: string) => void;
}

const SortableScheduleItem: React.FC<SortableScheduleItemProps> = ({ item, index, t, onRemove, onChange }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      className={`p-4 rounded-2xl bg-[#FFFDF9] border-2 border-[#CBAE94] shadow-xs space-y-3 relative group ${isDragging ? 'z-10 shadow-lg opacity-90' : ''}`}
    >
      <div className="flex items-center justify-between border-b border-[#CBAE94]/40 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            {...listeners}
            title="Drag to reorder"
            aria-label={`Drag schedule item ${index + 1} to reorder`}
            className="cursor-grab active:cursor-grabbing touch-none text-[#8B735B] hover:text-[#5D5449] hover:bg-[#EFE6DC] p-1 rounded-lg transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold font-mono text-[#8B735B]">Schedule Item #{index + 1}</span>
        </div>
        <button type="button" onClick={() => onRemove(index)}
          className="text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-xl transition-colors flex items-center gap-1">
          <Trash2 className="w-3.5 h-3.5" /><span>{t.removeBtn}</span>
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
        <div className="sm:col-span-3">
          <label className="label-mono block mb-1">{t.timeLabel}</label>
          <TextInput type="text" value={item.time} onChange={(e) => onChange(index, 'time', e.target.value)}
            placeholder={t.timeExamplePh}
            variant="soft" />
        </div>
        <div className="sm:col-span-4 space-y-2">
          <div>
            <label className="label-mono block mb-1">{t.titleEnLabel}</label>
            <TextInput type="text" value={item.titleEn} onChange={(e) => onChange(index, 'titleEn', e.target.value)}
              placeholder="Guest Arrival & Refreshments"
              variant="soft" />
          </div>
          <div>
            <label className="label-mono block mb-1">{t.descEnLabel}</label>
            <TextInput type="text" value={item.descEn || ''} onChange={(e) => onChange(index, 'descEn', e.target.value)}
              placeholder="Mingle and sign guestbook..."
              variant="soft" />
          </div>
        </div>
        <div className="sm:col-span-5 space-y-2">
          <div>
            <label className="label-mono block mb-1">{t.titleFrLabel}</label>
            <TextInput type="text" value={item.titleFr} onChange={(e) => onChange(index, 'titleFr', e.target.value)}
              placeholder="Arrivée des invités..."
              variant="soft" />
          </div>
          <div>
            <label className="label-mono block mb-1">{t.descFrLabel}</label>
            <TextInput type="text" value={item.descFr || ''} onChange={(e) => onChange(index, 'descFr', e.target.value)}
              placeholder="Discitez et signez le livre d'or..."
              variant="soft" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const AdminSettingsTab: React.FC<AdminSettingsTabProps> = ({ language, t, settings, onSave }) => {
  const { toast } = useToast();

  const [parentsNames, setParentsNames] = useState(settings?.parentsNames ?? '');
  const [babyName, setBabyName] = useState(settings?.babyName ?? '');
  const [datePickerValue, setDatePickerValue] = useState(settings?.date ? parseToYmd(settings.date) : '');
  const parsedInitialTimes = parseTimeRange(settings?.time ?? '');
  const [startTime, setStartTime] = useState(parsedInitialTimes.startTime);
  const [endTime, setEndTime] = useState(parsedInitialTimes.endTime);
  const [venueName, setVenueName] = useState(settings?.venueName ?? '');
  const [venueAddress, setVenueAddress] = useState(settings?.venueAddress ?? '');
  const [registryUrl, setRegistryUrl] = useState(settings?.registryUrl ?? '');
  const [contentOpenAt, setContentOpenAt] = useState(settings?.contentOpenAt ? isoToLocalInput(settings.contentOpenAt) : '');
  const [contentCloseAt, setContentCloseAt] = useState(settings?.contentCloseAt ? isoToLocalInput(settings.contentCloseAt) : '');
  const [showScheduleTime, setShowScheduleTime] = useState(settings?.showScheduleTime ?? true);
  const [selectedThemeId, setSelectedThemeId] = useState<string>(settings?.themeId || 'teddy-warmth');
  const [schedule, setSchedule] = useState<ScheduleItem[]>(settings?.schedule && Array.isArray(settings.schedule) ? settings.schedule : [
    { id: 'sch-1', time: '2:00 PM', titleEn: 'Guest Arrival & Welcome Refreshments', titleFr: 'Arrivée des invités & rafraîchissements', descEn: 'Mingle, find your table on the floor map, and sign the digital guestbook.', descFr: 'Discutez, trouvez votre table sur la carte et signez le livre d\'or virtuel.' },
    { id: 'sch-2', time: '2:45 PM', titleEn: 'Baby Shower Games & Trivia', titleFr: 'Jeux & quiz sur le thème de bébé', descEn: 'Fun guessing games with special prizes for table winners!', descFr: 'Des jeux amusants avec des prix spéciaux pour les gagnants !' },
    { id: 'sch-3', time: '3:45 PM', titleEn: 'Gourmet Treats & Cake Cutting', titleFr: 'Buffet gourmand & découpe du gâteau', descEn: 'Enjoy sweet treats, tea, coffee, and celebrate the parents-to-be.', descFr: 'Dégustez des douceurs, du thé, du café et célébrez les futurs parents.' },
    { id: 'sch-4', time: '4:45 PM', titleEn: 'Gift Opening & Thank You Toast', titleFr: 'Ouverture des cadeaux & toast de remerciement', descEn: 'The parents open gifts from the baby registry and share warm words.', descFr: 'Les parents ouvrent les cadeaux du registre et partagent leurs mots doux.' },
  ]);
  const [savingSettings, setSavingSettings] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = schedule.findIndex((i) => i.id === active.id);
    const newIndex = schedule.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setSchedule(arrayMove(schedule, oldIndex, newIndex));
  };

  const updateScheduleItem = (index: number, key: keyof ScheduleItem, value: string) => {
    const u = [...schedule];
    u[index][key] = value;
    setSchedule(u);
  };

  // Prefill the guest content window from the event date/time until the host overrides it
  const syncWindowFromEvent = (date: string, start: string, end: string) => {
    if (!date) return;
    if (!contentOpenAt) setContentOpenAt(`${date}T${start}`);
    if (!contentCloseAt) setContentCloseAt(`${date}T${end}`);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const formattedDate = formatDateLong(datePickerValue, language);
      const formattedTime = formatTimeRangeString(startTime, endTime);
      await onSave({
        parentsNames,
        babyName,
        date: formattedDate,
        time: formattedTime,
        venueName,
        venueAddress,
        registryUrl,
        showScheduleTime,
        schedule,
        themeId: selectedThemeId,
        contentOpenAt: contentOpenAt ? new Date(contentOpenAt).toISOString() : '',
        contentCloseAt: contentCloseAt ? new Date(contentCloseAt).toISOString() : '',
      });
      toast.love(t.settingsSavedToast);
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error(t.settingsSaveFailedToast);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <motion.div
      key="settings"
      variants={adminContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-[#CBAE94]/40 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-[#EFE6DC] text-[#8B735B] rounded-2xl border border-[#CBAE94]">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-sans text-2xl font-bold text-[#8B735B]">{t.hostCustomizationTitle}</h3>
              <p className="text-xs text-[#5D5449]">{t.hostCustomizationDesc}</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label-mono block mb-1">{t.parentsNamesLabel2}</label>
              <TextInput type="text" required value={parentsNames} onChange={(e) => setParentsNames(e.target.value)}
                placeholder={t.parentsNamesExamplePh} />
            </div>
            <div>
              <label className="label-mono block mb-1">{t.babyNameOptionalLabel}</label>
              <TextInput type="text" value={babyName} onChange={(e) => setBabyName(e.target.value)}
                placeholder={t.babyNameOptionalPh} />
            </div>

            <div className="space-y-1">
              <label className="label-mono block mb-1">{t.eventDateLabel2}</label>
              <div className="relative">
                <CalendarIcon className="w-4 h-4 text-[#CBAE94] absolute left-3.5 top-3.5 pointer-events-none" />
                <TextInput type="date" required value={datePickerValue} onChange={(e) => { const v = e.target.value; setDatePickerValue(v); syncWindowFromEvent(v, startTime, endTime); }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white cursor-pointer" />
              </div>
              <div className="bg-[#EFE6DC]/60 px-3 py-1.5 rounded-xl border border-[#CBAE94]/40 text-[11px] font-mono text-[#8B735B] flex items-center justify-between">
                <span className="font-bold">{t.formattedLabel}</span>
                <span className="font-sans font-bold text-[#5D5449]">{formatDateLong(datePickerValue, language)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="label-mono block mb-1">{t.eventTimeRangeLabel}</label>
              <div className="grid grid-cols-2 gap-2 bg-[#EFE6DC]/30 p-2.5 rounded-2xl border-2 border-[#CBAE94]/60">
                <div>
                  <span className="text-[10px] uppercase font-mono font-bold text-[#8B735B] block mb-1">{t.startTimeLabel}</span>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-[#CBAE94] absolute left-2.5 top-2.5 pointer-events-none" />
                    <TextInput type="time" required value={startTime} onChange={(e) => { const v = e.target.value; setStartTime(v); syncWindowFromEvent(datePickerValue, v, endTime); }}
                      className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white cursor-pointer" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono font-bold text-[#8B735B] block mb-1">{t.endTimeLabel}</span>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-[#CBAE94] absolute left-2.5 top-2.5 pointer-events-none" />
                    <TextInput type="time" required value={endTime} onChange={(e) => { const v = e.target.value; setEndTime(v); syncWindowFromEvent(datePickerValue, startTime, v); }}
                      className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white cursor-pointer" />
                  </div>
                </div>
              </div>
              <div className="bg-[#EFE6DC]/60 px-3 py-1.5 rounded-xl border border-[#CBAE94]/40 text-[11px] font-mono text-[#8B735B] flex items-center justify-between">
                <span className="font-bold">{t.combinedLabel}</span>
                <span className="font-sans font-bold text-[#5D5449]">{formatTimeRangeString(startTime, endTime)}</span>
              </div>
            </div>

            <div>
              <label className="label-mono block mb-1">{t.venueNameLabel2}</label>
              <div className="relative">
                <Building className="w-4 h-4 text-[#CBAE94] absolute left-3.5 top-3" />
                <TextInput type="text" required value={venueName} onChange={(e) => setVenueName(e.target.value)}
                  placeholder={t.venueExamplePh}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white" />
              </div>
            </div>
            <div>
              <label className="label-mono block mb-1">{t.fullVenueAddressLabel}</label>
              <TextInput type="text" required value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)}
                placeholder={t.venueAddressExamplePh} />
            </div>
          </div>

          <div>
            <label className="label-mono block mb-1">{t.registryLinkLabel}</label>
            <div className="relative">
              <Gift className="w-4 h-4 text-[#CBAE94] absolute left-3.5 top-3" />
              <TextInput type="url" value={registryUrl} onChange={(e) => setRegistryUrl(e.target.value)}
                placeholder="https://..."
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white" />
            </div>
          </div>

          <div className="pt-6 border-t-2 border-[#CBAE94]/40 space-y-4">
            <div>
              <h4 className="font-sans text-xl font-bold text-[#8B735B] flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#8B735B]" />{t.contentWindowTitle}
              </h4>
              <p className="text-xs text-[#5D5449]">{t.contentWindowSubtitle}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-mono block mb-1">{t.contentOpenLabel}</label>
                <TextInput
                  type="datetime-local"
                  value={contentOpenAt}
                  onChange={(e) => setContentOpenAt(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white"
                />
              </div>
              <div>
                <label className="label-mono block mb-1">{t.contentCloseLabel}</label>
                <TextInput
                  type="datetime-local"
                  value={contentCloseAt}
                  onChange={(e) => setContentCloseAt(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white"
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t-2 border-[#CBAE94]/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-sans text-xl font-bold text-[#8B735B] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#8B735B]" />Schedule of the Day
                </h4>
                <p className="text-xs text-[#5D5449]">{t.scheduleDesc}</p>
              </div>
              <label className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#EFE6DC] border border-[#CBAE94] cursor-pointer hover:bg-[#E2D4C3] transition-colors select-none">
                <input type="checkbox" checked={showScheduleTime} onChange={(e) => setShowScheduleTime(e.target.checked)}
                  className="w-4 h-4 text-[#8B735B] rounded focus:ring-[#8B735B] border-[#CBAE94]" />
                <span className="text-xs font-bold text-[#4A3F35]">{t.showScheduleTimesLabel}</span>
              </label>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={schedule.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  {schedule.map((item, index) => (
                    <SortableScheduleItem
                      key={item.id}
                      item={item}
                      index={index}
                      t={t}
                      onRemove={(i) => setSchedule(schedule.filter((_, idx) => idx !== i))}
                      onChange={updateScheduleItem}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button type="button" onClick={() => setSchedule([...schedule, { id: `sch-${Date.now()}`, time: '5:00 PM', titleEn: 'New Event Activity', titleFr: 'Nouvelle activité', descEn: 'Activity description details...', descFr: 'Détails de l\'activité...' }])}
              className="w-full py-2.5 rounded-2xl border-2 border-dashed border-[#CBAE94] text-xs font-bold text-[#8B735B] hover:bg-[#EFE6DC]/50 transition-colors flex items-center justify-center gap-1.5">
              <Plus className="w-4 h-4" /><span>{t.addScheduleItemBtn}</span>
            </button>
          </div>

          <div className="pt-6 border-t-2 border-[#CBAE94]/40 space-y-4">
            <div>
              <h4 className="font-sans text-xl font-bold text-[#8B735B] flex items-center gap-2">
                <Palette className="w-5 h-5 text-[#8B735B]" />Theme & Color Combo Selector
              </h4>
              <p className="text-xs text-[#5D5449] mt-0.5">{t.themeDesc}</p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#4A3F35] uppercase tracking-wider font-mono">{t.selectThemeLabel}</label>
              <div className="relative">
                <select value={selectedThemeId} onChange={(e) => { const theme = getThemeById(e.target.value); setSelectedThemeId(e.target.value); applyThemeToDocument(theme); }}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#CBAE94] bg-white text-sm font-bold text-[#4A3F35] focus:outline-none focus:border-[#8B735B] shadow-xs cursor-pointer appearance-none pr-10">
                  {THEME_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>{preset.name} ({preset.category}) — Font: {preset.displayFontName}</option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#8B735B] font-bold">▼</div>
              </div>
            </div>

            {(() => {
              const currentTheme = getThemeById(selectedThemeId);
              const col1Text = getContrastTextColor(currentTheme.bg);
              const col2Text = getContrastTextColor(currentTheme.ink);
              const col3Text = getContrastTextColor(currentTheme.accent);
              const cardHeaderBg = currentTheme.surface || (currentTheme.isDark ? '#1E293B' : '#FFFFFF');
              return (
                <div className="p-4 rounded-2xl border-2 shadow-sm space-y-3 transition-all"
                  style={{ backgroundColor: currentTheme.bg, color: currentTheme.ink, borderColor: currentTheme.accent }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-current/20 pb-2.5">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-85">Active Theme • {currentTheme.category}</span>
                      <h5 className="text-lg font-bold leading-tight">{currentTheme.name}</h5>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-mono font-bold block opacity-85">{t.signatureTypographyLabel}</span>
                      <span className="text-xs font-bold" style={{ fontFamily: currentTheme.fontFamily }}>{currentTheme.displayFontName}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div className="p-2.5 rounded-xl border border-black/10 text-center space-y-1 shadow-2xs" style={{ backgroundColor: cardHeaderBg, color: currentTheme.ink }}>
                      <span className="text-[10px] font-mono font-bold uppercase block opacity-80">{t.color1BgLabel}</span>
                      <div className="h-8 rounded-lg border border-black/10 flex items-center justify-center font-mono font-bold text-xs shadow-2xs"
                        style={{ backgroundColor: currentTheme.bg, color: col1Text }}>{currentTheme.bg}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-black/10 text-center space-y-1 shadow-2xs" style={{ backgroundColor: cardHeaderBg, color: currentTheme.ink }}>
                      <span className="text-[10px] font-mono font-bold uppercase block opacity-80">{t.color2InkLabel}</span>
                      <div className="h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs border border-black/10 shadow-2xs"
                        style={{ backgroundColor: currentTheme.ink, color: col2Text }}>{currentTheme.ink}</div>
                    </div>
                    <div className="p-2.5 rounded-xl border border-black/10 text-center space-y-1 shadow-2xs" style={{ backgroundColor: cardHeaderBg, color: currentTheme.ink }}>
                      <span className="text-[10px] font-mono font-bold uppercase block opacity-80">{t.color3AccentLabel}</span>
                      <div className="h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs border border-black/10 shadow-2xs"
                        style={{ backgroundColor: currentTheme.accent, color: col3Text }}>{currentTheme.accent}</div>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl border border-dashed text-center space-y-0.5" style={{ backgroundColor: currentTheme.bg, borderColor: currentTheme.accent }}>
                    <p className="text-xl font-bold" style={{ fontFamily: currentTheme.fontFamily, color: currentTheme.ink }}>Bébé Baby Shower Celebration</p>
                    <p className="text-xs font-medium opacity-85" style={{ color: currentTheme.ink }}>{t.livePreviewLabel}</p>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={savingSettings} className="btn-accent px-8 py-3 text-xs flex items-center space-x-2">
              <Save className="w-4 h-4" /><span>{savingSettings ? t.savingSettingsBtn : t.saveAllSettingsBtn}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};
