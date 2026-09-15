import React, { useEffect, useState } from 'react';
import { Guest, EventSettings, FloorMapData } from '../../types';
import { Printer, Scissors, Tag, QrCode } from 'lucide-react';
import { useT, useTf } from '../shared/i18n';
import { usePrint } from '../shared/hooks';
import { Select, TextInput } from '../shared/ui';
import { getAttendeeLocations } from '../../lib/tableAssignment';
import { getPartyMembers, isAttending } from '../../lib/guestAttendees';
import { TableScanQrModal } from './TableScanQrModal';

interface EscortCardsGeneratorProps {
  guests: Guest[];
  settings?: EventSettings | null;
}

interface CardRow {
  guest: Guest;
  key: string;
  name: string;
  tableName: string | null;
  seatNumber: number | null;
}

const UNASSIGNED = '__unassigned__';

export const EscortCardsGenerator: React.FC<EscortCardsGeneratorProps> = ({ guests, settings }) => {
    const t = useT();
    const tf = useTf();
  const print = usePrint();
  const [cardType, setCardType] = useState<'tent' | 'nametag'>('tent');
  const [selectedTableFilter, setSelectedTableFilter] = useState<string>('ALL');
  const [customHeader, setCustomHeader] = useState(
    settings?.babyName ? tf('escortHeaderWithBaby', { name: settings.babyName }) : t.escortHeaderDefault
  );
  const [floorMap, setFloorMap] = useState<FloorMapData | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

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
          seatNumber: loc ? loc.seatIndex + 1 : null,
        };
      });
    });

  // Extract unique tables
  const uniqueTables = Array.from(
    new Set(rows.map((r) => r.tableName || UNASSIGNED))
  ).sort();

  const filteredRows = rows.filter((r) => {
    if (selectedTableFilter === 'ALL') return true;
    return (r.tableName || UNASSIGNED) === selectedTableFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner & Controls */}
      <div className="card-paper p-6 sm:p-8 space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#CBAE94]/30 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] font-bold text-xs uppercase tracking-wider font-mono">
              <Tag className="w-3.5 h-3.5" />
              <span>{t.stationeryTitle}</span>
            </div>
            <h2 className="font-newsreader text-3xl font-bold text-[#4A3F35] mt-1">
              {t.escortTitle}
            </h2>
            <p className="text-xs text-[#8B735B] font-sans">
              {t.escortSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => print(t.escortPrintToast)}
            className="px-5 py-3 rounded-xl bg-[#8B735B] text-white font-bold text-xs hover:bg-[#705C47] transition-all flex items-center gap-2 shadow-md cursor-pointer shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>{tf('escortPrintBtn', { count: filteredRows.length })}</span>
          </button>
        </div>

        {/* Main table QR — one standee per table, opens the guest chooser */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#EFE6DC]/50 border border-[#CBAE94]/50 p-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white border border-[#CBAE94] flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-[#8B735B]" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#4A3F35]">{t.tableQrPrintTitle}</p>
              <p className="text-xs text-[#8B735B]">{t.tableQrPrintSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="px-4 py-2.5 rounded-xl border-2 border-[#CBAE94] bg-white text-[#4A3F35] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-2 cursor-pointer shrink-0"
          >
            <QrCode className="w-4 h-4" />
            <span>{t.tableQrPrintTitle}</span>
          </button>
        </div>

        {/* Customization Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label-mono block text-xs font-bold mb-1">{t.stationeryFormatLabel}</label>
            <Select
              variant="soft"
              value={cardType}
              onChange={(e) => setCardType(e.target.value as 'tent' | 'nametag')}
            >
              <option value="tent">{t.foldedTentCardsBtn}</option>
              <option value="nametag">{t.nameBadgesBtn}</option>
            </Select>
          </div>

          <div>
            <label className="label-mono block text-xs font-bold mb-1">{t.filterByTableLabel}</label>
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
            <label className="label-mono block text-xs font-bold mb-1">{t.customHeaderLabel}</label>
            <TextInput
              variant="soft"
              type="text"
              value={customHeader}
              onChange={(e) => setCustomHeader(e.target.value)}
            />
          </div>

        </div>
      </div>

      {/* Cards Display Grid (Optimized for both screen & paper printing) */}
      <div className="card-paper p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between border-b border-[#CBAE94]/30 pb-3 print:hidden">
          <h3 className="font-sans text-lg font-bold text-[#4A3F35]">
            {t.printPreviewLabel} ({tf('escortItemsCount', { count: filteredRows.length })})
          </h3>
          <span className="text-xs font-mono text-[#8B735B]">
            {t.paperLayoutLabel}: {t.escortPaperLayout}
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="text-center py-12 text-[#8B735B] font-sans">
                {t.noAttendingGuestsMsg}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2 print:gap-4 print:p-0">
            {filteredRows.map((row) => {
              const guest = row.guest;
              const tableNum = row.tableName || t.unassignedWord;
              const seatLine = row.seatNumber
                ? tf('seatedAtSeatLabel', { seat: String(row.seatNumber) })
                : '';

              if (cardType === 'tent') {
                return (
                  <div
                    key={row.key}
                    className="border-2 border-dashed border-[#CBAE94] rounded-2xl bg-[#FAF6F0] h-56 relative shadow-xs overflow-hidden print:shadow-none print:border-solid print:border-slate-300 break-inside-avoid"
                  >
                    {/* Top Fold (Folded Back / Front Header) â€” occupies the top half, centered */}
                    <div className="h-1/2 flex items-center justify-center opacity-75 transform rotate-180 print:rotate-180 text-center px-4 min-w-0">
                      <div className="space-y-1 min-w-0 w-full">
                        <p className="text-xs font-mono uppercase tracking-widest text-[#8B735B] truncate">
                          {customHeader}
                        </p>
                        <h4 className="font-newsreader text-xl font-bold text-[#4A3F35] truncate">
                          {row.name}
                        </h4>
                      </div>
                    </div>

                    {/* Fold line â€” a dedicated divider at the exact middle of the card */}
                    <div className="relative h-0 border-t border-dotted border-[#CBAE94] print:border-slate-300">
                      <span className="absolute -top-2 right-2 text-xs font-mono text-[#CBAE94] bg-[#FAF6F0] px-1 print:hidden">
                        <Scissors className="w-2.5 h-2.5 inline" /> {t.foldLineLabel}
                      </span>
                    </div>

                    {/* Bottom Fold (Primary Front Facing Display) â€” occupies the bottom half, centered */}
                    <div className="h-1/2 flex items-center justify-between gap-3 px-4">
                      <div className="space-y-1 min-w-0">
                        <p className="text-xs font-mono uppercase tracking-widest text-[#8B735B] truncate">
                          {customHeader}
                        </p>
                        <h3 className="font-newsreader text-2xl font-bold text-[#4A3F35] leading-tight break-words line-clamp-2">
                          {row.name}
                        </h3>
                        <p className="text-xs font-mono font-bold text-[#8B735B] truncate">
                          {seatLine}
                        </p>
                        <p className="text-xs font-mono font-bold text-[#4A3F35] truncate">
                          {t.uploadCodeLabel}: {guest.code}
                        </p>
                      </div>

                      <div className="flex flex-col items-center justify-center text-right shrink-0">
                        <span className="text-xs font-mono text-[#8B735B] uppercase font-bold">
                          {t.seatedAtLabel}
                        </span>
                        <div className="px-3 py-1 rounded-xl bg-[#EFE6DC] border border-[#CBAE94] text-[#4A3F35] font-bold text-sm font-mono mt-0.5">
                          {tableNum}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  /* Wearable Name Badge */
                  <div
                    key={row.key}
                    className="border-2 border-[#4A3F35] rounded-2xl p-5 bg-white flex flex-col justify-between h-48 relative shadow-sm overflow-hidden print:shadow-none print:border-slate-800 break-inside-avoid"
                  >
                    <div className="text-center border-b border-[#CBAE94]/40 pb-2 min-w-0">
                      <span className="text-xs font-mono font-bold text-[#8B735B] uppercase tracking-wider block truncate">
                        {customHeader}
                      </span>
                    </div>

                    <div className="text-center my-auto py-2 min-w-0">
                      <h2 className="font-newsreader text-3xl font-bold text-[#4A3F35] mt-1 leading-tight break-words line-clamp-2">
                        {row.name}
                      </h2>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#CBAE94]/40 pt-2 text-xs font-mono">
                      <span className="font-bold text-[#8B735B]">{t.tableFilterLabel} {tableNum}{seatLine ? ` · ${seatLine}` : ''}</span>
                      <span className="font-bold text-[#4A3F35]">{t.uploadCodeLabel} {guest.code}</span>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      <TableScanQrModal
        open={showQrModal}
        onClose={() => setShowQrModal(false)}
        tables={floorMap?.tables ?? []}
      />
    </div>
  );
};
