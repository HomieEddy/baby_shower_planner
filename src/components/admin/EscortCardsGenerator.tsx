import React, { useEffect, useState } from 'react';
import { Guest, EventSettings, FloorMapData } from '../../types';
import { Printer, Scissors, Tag, Ticket } from 'lucide-react';
import { useT } from '../shared/i18n';
import { usePrint } from '../shared/hooks';
import { getAttendeeLocations } from '../seating/floorPlanHelpers';
import { getPartyMembers } from '../../lib/guestAttendees';

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

export const EscortCardsGenerator: React.FC<EscortCardsGeneratorProps> = ({ guests, settings }) => {
    const t = useT();
  const print = usePrint();
  const [cardType, setCardType] = useState<'tent' | 'nametag'>('tent');
  const [selectedTableFilter, setSelectedTableFilter] = useState<string>('ALL');
  const [showQrCode, setShowQrCode] = useState(true);
  const [customHeader, setCustomHeader] = useState(
    settings?.babyName ? `Celebrating Baby ${settings.babyName}` : 'Welcome to Our Baby Shower'
  );
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
    .filter((g) => g.rsvp_status === 'Attending')
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
    new Set(rows.map((r) => r.tableName || 'Unassigned'))
  ).sort();

  const filteredRows = rows.filter((r) => {
    if (selectedTableFilter === 'ALL') return true;
    return (r.tableName || 'Unassigned') === selectedTableFilter;
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
              Table Escort Cards & Name Tags
            </h2>
            <p className="text-xs text-[#8B735B] font-sans">
              Print ready-to-fold place cards and wearable name tags with custom table assignments and QR codes.
            </p>
          </div>

          <button
            type="button"
            onClick={() => print(t.escortPrintToast)}
            className="px-5 py-3 rounded-xl bg-[#8B735B] text-white font-bold text-xs hover:bg-[#705C47] transition-all flex items-center gap-2 shadow-md cursor-pointer shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>Print {filteredRows.length} Cards</span>
          </button>
        </div>

        {/* Customization Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label-mono block text-xs font-bold mb-1">{t.stationeryFormatLabel}</label>
            <div className="inline-flex rounded-xl bg-[#EFE6DC] p-1 w-full border border-[#CBAE94]/40">
              <button
                type="button"
                onClick={() => setCardType('tent')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  cardType === 'tent' ? 'bg-white text-[#4A3F35] shadow-xs' : 'text-[#8B735B]'
                }`}
              >
                <Ticket className="w-3.5 h-3.5 inline" /> {t.foldedTentCardsBtn}
              </button>
              <button
                type="button"
                onClick={() => setCardType('nametag')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  cardType === 'nametag' ? 'bg-white text-[#4A3F35] shadow-xs' : 'text-[#8B735B]'
                }`}
              >
                <Tag className="w-3.5 h-3.5 inline" /> {t.nameBadgesBtn}
              </button>
            </div>
          </div>

          <div>
            <label className="label-mono block text-xs font-bold mb-1">{t.filterByTableLabel}</label>
            <select
              value={selectedTableFilter}
              onChange={(e) => setSelectedTableFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold bg-white text-[#4A3F35]"
            >
              <option value="ALL">{t.allTablesOption.replace('{{count}}', String(rows.length))}</option>
              {uniqueTables.map((tbl) => (
                <option key={tbl} value={tbl}>
                  {t.tableFilterLabel} {tbl}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-mono block text-xs font-bold mb-1">{t.customHeaderLabel}</label>
            <input
              type="text"
              value={customHeader}
              onChange={(e) => setCustomHeader(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold bg-white text-[#4A3F35]"
            />
          </div>

          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#4A3F35]">
              <input
                type="checkbox"
                checked={showQrCode}
                onChange={(e) => setShowQrCode(e.target.checked)}
                className="w-4 h-4 rounded-md accent-[#8B735B]"
              />
              <span>{t.includeQrLabel}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Cards Display Grid (Optimized for both screen & paper printing) */}
      <div className="card-paper p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between border-b border-[#CBAE94]/30 pb-3 print:hidden">
          <h3 className="font-sans text-lg font-bold text-[#4A3F35]">
            {t.printPreviewLabel} ({filteredRows.length} items)
          </h3>
          <span className="text-xs font-mono text-[#8B735B]">
            {t.paperLayoutLabel}: 2-Column Grid (Standard A4 / Letter)
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
                ? t.seatedAtSeatLabel.replace('{{seat}}', String(row.seatNumber))
                : '';
              const magicUrl = `${window.location.origin}/rsvp/${guest.magic_token}`;
              const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(
                magicUrl
              )}`;

              if (cardType === 'tent') {
                return (
                  <div
                    key={row.key}
                    className="border-2 border-dashed border-[#CBAE94] rounded-2xl bg-[#FAF6F0] h-56 relative shadow-xs print:shadow-none print:border-solid print:border-slate-300 break-inside-avoid"
                  >
                    {/* Top Fold (Folded Back / Front Header) â€” occupies the top half, centered */}
                    <div className="h-1/2 flex items-center justify-center opacity-75 transform rotate-180 print:rotate-180 text-center px-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-[#8B735B]">
                          {customHeader}
                        </p>
                        <h4 className="font-newsreader text-xl font-bold text-[#4A3F35]">
                          {row.name}
                        </h4>
                      </div>
                    </div>

                    {/* Fold line â€” a dedicated divider at the exact middle of the card */}
                    <div className="relative h-0 border-t border-dotted border-[#CBAE94] print:border-slate-300">
                      <span className="absolute -top-2 right-2 text-[9px] font-mono text-[#CBAE94] bg-[#FAF6F0] px-1 print:hidden">
                        <Scissors className="w-2.5 h-2.5 inline" /> {t.foldLineLabel}
                      </span>
                    </div>

                    {/* Bottom Fold (Primary Front Facing Display) â€” occupies the bottom half, centered */}
                    <div className="h-1/2 flex items-center justify-between px-4">
                      <div className="space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-[#8B735B]">
                          {customHeader}
                        </p>
                        <h3 className="font-newsreader text-2xl font-bold text-[#4A3F35]">
                          {row.name}
                        </h3>
                        <p className="text-xs font-mono font-bold text-[#8B735B]">
                          {seatLine}
                        </p>
                      </div>

                      <div className="flex flex-col items-center justify-center text-right">
                        <span className="text-[9px] font-mono text-[#8B735B] uppercase font-bold">
                          {t.seatedAtLabel}
                        </span>
                        <div className="px-3 py-1 rounded-xl bg-[#EFE6DC] border border-[#CBAE94] text-[#4A3F35] font-bold text-sm font-mono mt-0.5">
                          {tableNum}
                        </div>
                        {showQrCode && (
                          <img
                            src={qrApi}
                            alt="QR"
                            className="w-10 h-10 mt-1.5 rounded-md border border-[#CBAE94]"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  /* Wearable Name Badge */
                  <div
                    key={row.key}
                    className="border-2 border-[#4A3F35] rounded-2xl p-5 bg-white flex flex-col justify-between h-48 relative shadow-sm print:shadow-none print:border-slate-800 break-inside-avoid"
                  >
                    <div className="text-center border-b border-[#CBAE94]/40 pb-2">
                      <span className="text-[11px] font-mono font-bold text-[#8B735B] uppercase tracking-wider">
                        {customHeader}
                      </span>
                    </div>

                    <div className="text-center my-auto py-2">
                      <p className="text-[10px] text-[#8B735B] uppercase font-mono tracking-widest">
                        {t.helloMyNameIsLabel}
                      </p>
                      <h2 className="font-newsreader text-3xl font-bold text-[#4A3F35] mt-1">
                        {row.name}
                      </h2>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#CBAE94]/40 pt-2 text-xs font-mono">
                      <span className="font-bold text-[#8B735B]">{t.tableFilterLabel} {tableNum}</span>
                      <span className="text-[10px] text-[#8B735B]">{seatLine}</span>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
};
