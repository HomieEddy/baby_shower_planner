import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Guest, EventSettings, FloorMapData, TableElement } from '../../types';
import { Download, Printer, Scissors, Tag } from 'lucide-react';
import { useT, useTf } from '../shared/i18n';
import { usePrint } from '../shared/hooks';
import { useToast } from '../shared/ToastContext';
import { fitFontPx } from '../../lib/cardText';
import { Select, TextInput } from '../shared/ui';
import { getAttendeeLocations } from '../../lib/tableAssignment';
import { getPartyMembers, isAttending } from '../../lib/guestAttendees';
import { A4_PX, downloadExportFiles, exportSection, ExportFile, ExportFormat } from '../../lib/printExport';
import { PrintableStandeePair, PrintablePoster } from './PrintAllSheet';
import { AdminPageHeader, AdminSectionTitle } from './AdminPageHeader';

interface EscortCardsGeneratorProps {
  guests: Guest[];
  settings?: EventSettings | null;
  onSaveSettings?: (data: Partial<EventSettings>) => Promise<EventSettings>;
}

interface CardRow {
  guest: Guest;
  key: string;
  name: string;
  tableName: string | null;
}

const UNASSIGNED = '__unassigned__';

type PrintSection = 'poster' | 'standees' | 'tents' | 'badges';

const PRINT_SECTIONS: PrintSection[] = ['poster', 'standees', 'tents', 'badges'];

// File names for exports: one file per section.
const SECTION_FILE_NAMES: Record<PrintSection, string> = {
  poster: 'find-my-table-poster',
  standees: 'table-qr-standees',
  tents: 'folded-tent-cards',
  badges: 'name-badges',
};

// Export captures are rendered at this fixed width, independent of the viewport.
const EXPORT_WIDTH_PX = 800;
// A4 printable width (200 mm) at 96 css px per inch: one standee pair is this wide.
const STANDEE_PAIR_WIDTH_PX = 756;

export const EscortCardsGenerator: React.FC<EscortCardsGeneratorProps> = ({ guests, settings, onSaveSettings }) => {
    const t = useT();
    const tf = useTf();
  const print = usePrint();
  const { toast } = useToast();
  const [sections, setSections] = useState<Record<PrintSection, boolean>>({
    poster: true,
    standees: true,
    tents: true,
    badges: false,
  });
  // Tent cards and name badges are alternatives: turning one on turns the other off.
  const toggleSection = (s: PrintSection) =>
    setSections((prev) => {
      const next = { ...prev, [s]: !prev[s] };
      if (next[s] && s === 'tents') next.badges = false;
      if (next[s] && s === 'badges') next.tents = false;
      return next;
    });
  const [selectedTableFilter, setSelectedTableFilter] = useState<string>('ALL');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);
  // While exporting, every enabled section is mounted off-screen so it can be captured.
  const [exportStageSections, setExportStageSections] = useState<PrintSection[] | null>(null);
  const exportStageRef = useRef<HTMLDivElement>(null);

  // The header saved in settings wins; otherwise fall back to the baby-name default.
  const defaultHeader = settings?.babyName
    ? tf('escortHeaderWithBaby', { name: settings.babyName })
    : t.escortHeaderDefault;
  const savedHeader = settings?.escortHeader?.trim() ? settings.escortHeader : defaultHeader;
  const [headerDraft, setHeaderDraft] = useState(savedHeader);
  const [syncedHeader, setSyncedHeader] = useState(savedHeader);
  const [savingHeader, setSavingHeader] = useState(false);
  // Pick up a saved header that arrives or changes after mount (settings load async).
  if (savedHeader !== syncedHeader) {
    setSyncedHeader(savedHeader);
    setHeaderDraft(savedHeader);
  }
  const headerDirty = headerDraft.trim() !== savedHeader.trim();
  // Cards preview the draft, so edits show on the cards before they are saved.
  const customHeader = headerDraft;
  const headerPx = fitFontPx(customHeader, { maxPx: 12, minPx: 8, widthPx: 200, emPerChar: 0.7 });

  const handleSaveHeader = async () => {
    if (!onSaveSettings) return;
    const value = headerDraft.trim();
    setSavingHeader(true);
    try {
      await onSaveSettings({ escortHeader: value });
      setHeaderDraft(value || defaultHeader);
      toast.success(t.settingsSavedToast);
    } catch {
      toast.error(t.settingsSaveFailedToast);
    } finally {
      setSavingHeader(false);
    }
  };
  const [floorMap, setFloorMap] = useState<FloorMapData | null>(null);

  // Seats live on the floor map; fetch it so split parties get one card per person.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/floorplan')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setFloorMap(d.floorMap ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // One card per attending person, resolved to their own table + chair.
  const rows: CardRow[] = guests
    .filter(isAttending)
    .flatMap((g) => {
      const names = getPartyMembers(g);
      const locations = getAttendeeLocations(g.id, floorMap, guests);
      return names.map((name, i) => {
        const loc = locations.find((l) => l.attendeeIndex === i) ?? null;
        return {
          guest: g,
          key: `${g.id}:${i}`,
          name,
          tableName: loc?.tableName ?? null,
        };
      });
    });

  // Sort by table (numeric-aware, unassigned last) so cards for one table are cut together.
  const sortedRows = [...rows].sort((a, b) => {
    if (!a.tableName !== !b.tableName) return a.tableName ? -1 : 1;
    const byTable = (a.tableName ?? '').localeCompare(b.tableName ?? '', undefined, { numeric: true, sensitivity: 'base' });
    if (byTable !== 0) return byTable;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  // Extract unique tables
  const uniqueTables = Array.from(
    new Set(rows.map((r) => r.tableName || UNASSIGNED))
  ).sort();

  const filteredRows = sortedRows.filter((r) => {
    if (selectedTableFilter === 'ALL') return true;
    return (r.tableName || UNASSIGNED) === selectedTableFilter;
  });

  const tables = floorMap?.tables ?? [];
  const itemCounts: Record<PrintSection, number> = {
    poster: 1,
    standees: tables.length,
    tents: filteredRows.length,
    badges: filteredRows.length,
  };
  const itemCount = PRINT_SECTIONS.reduce((sum, s) => sum + (sections[s] ? itemCounts[s] : 0), 0);
  // Each enabled, non-empty section becomes one exported file.
  const exportSectionKeys = PRINT_SECTIONS.filter((s) => sections[s] && itemCounts[s] > 0);

  const handleExport = async () => {
    if (exporting || exportSectionKeys.length === 0) return;
    setExporting(true);
    // Mount the sections synchronously so their elements exist before capture.
    flushSync(() => setExportStageSections(exportSectionKeys));
    try {
      toast.info(t.exportPreparingToast);
      const files: ExportFile[] = [];
      for (const key of exportSectionKeys) {
        const element = exportStageRef.current?.querySelector<HTMLElement>(`[data-export-section="${key}"]`);
        if (!element) throw new Error(`Export section not mounted: ${key}`);
        files.push({
          name: `${SECTION_FILE_NAMES[key]}.${exportFormat}`,
          blob: await exportSection(element, exportFormat, key === 'poster' ? 'page' : 'cards'),
        });
      }
      await downloadExportFiles(files, `escort-cards_${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success(t.exportDoneToast);
    } catch {
      toast.error(t.exportFailedToast);
    } finally {
      setExportStageSections(null);
      setExporting(false);
    }
  };

  const renderTent = (row: CardRow) => {
    const guest = row.guest;
    const tableNum = row.tableName || t.unassignedWord;
                return (
                  <div
                    key={`tent-${row.key}`}
                    className="print-keep-color border-2 border-dashed border-[#CBAE94] rounded-none bg-[#FAF6F0] h-80 sm:h-72 relative shadow-xs overflow-hidden print:shadow-none print:border-solid print:border-slate-300 break-inside-avoid"
                  >
                    {/* Top Fold (Folded Back / Front Header) - occupies the top half, centered */}
                    <div className="h-1/2 flex flex-col items-center justify-center gap-1.5 transform rotate-180 print:rotate-180 text-center px-4 min-w-0">
                      <div className="space-y-1 min-w-0 w-full">
                        <p className="text-xs font-mono uppercase tracking-widest text-[#8B735B] break-words line-clamp-2" style={{ fontSize: `${headerPx}px` }}>
                          {customHeader}
                        </p>
                        <h4 className="font-newsreader font-bold text-[#4A3F35] break-words line-clamp-2" style={{ fontSize: `${fitFontPx(row.name, { maxPx: 20, minPx: 12, widthPx: 300 })}px` }}>
                          {row.name}
                        </h4>
                      </div>
                      {/* Back of the card: baby-name guessing vote, guests write a guess here */}
                      <div className="w-full bg-white border border-dashed border-[#8B735B] px-3 py-1.5 space-y-1">
                        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#8B735B]">
                          {t.escortVoteTitle}
                        </p>
                        <div className="h-4 border-b-2 border-[#4A3F35]" aria-hidden="true" />
                        <p className="text-[9px] font-medium text-[#5D5449] leading-tight">
                          {t.escortVoteHint}
                        </p>
                      </div>
                    </div>

                    {/* Fold line - a dedicated divider at the exact middle of the card */}
                    <div className="relative h-0 border-t border-dotted border-[#CBAE94] print:border-slate-300">
                      <span className="absolute -top-2 right-2 text-xs font-mono text-[#CBAE94] bg-[#FAF6F0] px-1 print:hidden">
                        <Scissors className="w-2.5 h-2.5 inline" aria-label={t.foldLineLabel} /> <span className="hidden sm:inline">{t.foldLineLabel}</span>
                      </span>
                    </div>

                    {/* Bottom Fold (Primary Front Facing Display) - occupies the bottom half, centered */}
                    <div className="h-1/2 flex items-center justify-between gap-3 px-4">
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs font-mono uppercase tracking-wider text-[#8B735B] break-words line-clamp-2" style={{ fontSize: `${headerPx}px` }}>
                          {customHeader}
                        </p>
                        <h3 className="font-newsreader font-bold text-[#4A3F35] leading-tight break-words line-clamp-2" style={{ fontSize: `${fitFontPx(row.name, { maxPx: 24, minPx: 14, widthPx: 200 })}px` }}>
                          {row.name}
                        </h3>
                        <p className="text-xs font-semibold text-[#4A3F35]">
                          {t.uploadCodeLabel}: <span className="font-mono whitespace-nowrap">{guest.code}</span>
                        </p>
                      </div>

                      <div className="flex flex-col items-center justify-center text-right shrink-0">
                        <div className="px-3 py-1 rounded-xl bg-[#EFE6DC] border border-[#CBAE94] text-[#4A3F35] font-bold text-sm font-mono">
                          {tableNum}
                        </div>
                      </div>
                    </div>
                  </div>
                );
  };

  const renderBadge = (row: CardRow) => {
    const guest = row.guest;
    const tableNum = row.tableName || t.unassignedWord;
                return (
                  /* Wearable Name Badge */
                  <div
                    key={`badge-${row.key}`}
                    className="print-keep-color border-2 border-[#4A3F35] rounded-none p-5 bg-white flex flex-col justify-between h-48 relative shadow-sm overflow-hidden print:shadow-none print:border-slate-800 break-inside-avoid"
                  >
                    <div className="text-center border-b border-[#CBAE94]/40 pb-2 min-w-0">
                      <span className="text-xs font-mono font-bold text-[#8B735B] uppercase tracking-wider block break-words line-clamp-2" style={{ fontSize: `${headerPx}px` }}>
                        {customHeader}
                      </span>
                    </div>

                    <div className="text-center my-auto py-2 min-w-0">
                      <h2 className="font-newsreader font-bold text-[#4A3F35] mt-1 leading-tight break-words line-clamp-2" style={{ fontSize: `${fitFontPx(row.name, { maxPx: 30, minPx: 14, widthPx: 280 })}px` }}>
                        {row.name}
                      </h2>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#CBAE94]/40 pt-2 text-xs font-mono">
                      <span className="font-bold text-[#8B735B]">{tableNum}</span>
                      <span className="font-bold text-[#4A3F35]">{t.uploadCodeLabel} {guest.code}</span>
                    </div>
                  </div>
                );
  };

  // Table QR standees go two per portrait A4 sheet, so they are grouped in pairs.
  const standeePairs: TableElement[][] = [];
  for (let i = 0; i < tables.length; i += 2) standeePairs.push(tables.slice(i, i + 2));

  const sectionOptions: { key: PrintSection; label: string }[] = [
    { key: 'poster', label: t.printSectionPoster },
    { key: 'standees', label: tf('printSectionStandees', { count: tables.length }) },
    { key: 'tents', label: `${t.foldedTentCardsBtn} (${filteredRows.length})` },
    { key: 'badges', label: `${t.nameBadgesBtn} (${filteredRows.length})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner & the single "print everything" action */}
      <AdminPageHeader
        className="print:hidden"
        icon={Tag}
        eyebrow={t.stationeryTitle}
        title={t.escortTitle}
        subtitle={t.escortSubtitle}
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || exportSectionKeys.length === 0}
              className="btn-outline-accent text-xs sm:text-sm py-2.5 px-4 gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>
                {exporting ? t.exportingLabel : tf('exportSectionsBtn', { count: exportSectionKeys.length })}
              </span>
            </button>
            <button
              type="button"
              onClick={() => print(t.printAllToast)}
              disabled={itemCount === 0}
              className="btn-accent text-xs sm:text-sm py-2.5 px-4 gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4" />
              <span>{tf('printAllBtn', { count: itemCount })}</span>
            </button>
          </div>
        }
      />

      <div className="card-soft p-6 sm:p-8 space-y-4 print:hidden">
        {/* What goes into the single print job */}
        <div>
          <label className="label-mono block mb-2">{t.printSectionsLabel}</label>
          <div className="flex flex-wrap gap-2">
            {sectionOptions.map((opt) => (
              <label
                key={opt.key}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                  sections[opt.key]
                    ? 'bg-[#8B735B] text-white border-[#8B735B]'
                    : 'bg-white text-[#4A3F35] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={sections[opt.key]}
                  onChange={() => toggleSection(opt.key)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label-mono block mb-1">{t.exportFormatLabel}</label>
            <Select
              variant="soft"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            >
              <option value="pdf">{t.exportFormatPdf}</option>
              <option value="jpg">{t.exportFormatJpg}</option>
              <option value="png">{t.exportFormatPng}</option>
            </Select>
          </div>

          <div>
            <label className="label-mono block mb-1">{t.filterByTableLabel}</label>
            <Select
              variant="soft"
              value={selectedTableFilter}
              onChange={(e) => setSelectedTableFilter(e.target.value)}
            >
              <option value="ALL">{tf('allTablesOption', { count: rows.length })}</option>
              {uniqueTables.map((tbl) => (
                <option key={tbl} value={tbl}>
                  {tbl === UNASSIGNED ? t.unassignedWord : `${t.tableFilterLabel} ${tbl}`}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="label-mono block mb-1">{t.customHeaderLabel}</label>
            <div className="flex gap-2">
              <TextInput
                variant="soft"
                type="text"
                value={headerDraft}
                onChange={(e) => setHeaderDraft(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSaveHeader}
                disabled={!headerDirty || savingHeader || !onSaveSettings}
                className="btn-outline-accent py-2 px-3 text-xs shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t.saveChangesBtn}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-[#5D5449]">{t.exportHint}</p>
      </div>

      {/* One print job: poster, standees, tent cards and badges packed edge to edge */}
      <div className="card-soft p-5 sm:p-6 space-y-4 print-all-sheet">
        <AdminSectionTitle
          className="print:hidden"
          icon={Printer}
          title={`${t.printPreviewLabel} (${tf('escortItemsCount', { count: itemCount })})`}
          subtitle={`${t.paperLayoutLabel}: ${t.printAllLayout}`}
        />

        {itemCount === 0 ? (
          <div className="text-center py-12 text-[#5D5449]">{t.noAttendingGuestsMsg}</div>
        ) : (
          <div className="print-pack grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.poster && <PrintablePoster settings={settings} />}
            {sections.standees && standeePairs.map((pair) => <PrintableStandeePair key={`qr-${pair[0].id}`} tables={pair} />)}
            {sections.tents && filteredRows.map(renderTent)}
            {sections.badges && filteredRows.map(renderBadge)}
          </div>
        )}
      </div>

      {/* Off-screen copy of each section, mounted only while exporting. */}
      {exportStageSections && (
        <div
          ref={exportStageRef}
          aria-hidden="true"
          className="print:hidden"
          style={{ position: 'fixed', left: '-100000px', top: 0, width: `${EXPORT_WIDTH_PX}px`, pointerEvents: 'none' }}
        >
          {exportStageSections.map((key) =>
            key === 'poster' ? (
              // The poster is exactly one A4 page.
              <div key={key} data-export-section={key} style={{ width: A4_PX.width, height: A4_PX.height }}>
                <PrintablePoster settings={settings} fullPage />
              </div>
            ) : key === 'standees' ? (
              // Each direct child is one A4 sheet (two standees); the PDF export puts each on its own page.
              <div key={key} data-export-section={key} className="flex flex-col bg-white" style={{ width: `${STANDEE_PAIR_WIDTH_PX}px` }}>
                {standeePairs.map((pair) => (
                  <PrintableStandeePair key={`qr-${pair[0].id}`} tables={pair} />
                ))}
              </div>
            ) : (
              // Each direct child is one card; the PDF export packs them onto pages whole.
              <div key={key} data-export-section={key} className="grid grid-cols-2 gap-4 bg-white p-6">
                {key === 'tents' && filteredRows.map(renderTent)}
                {key === 'badges' && filteredRows.map(renderBadge)}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
