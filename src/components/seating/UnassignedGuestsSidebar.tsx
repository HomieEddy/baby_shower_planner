import { Search, UserX, CheckCircle2, Users, Utensils, X } from 'lucide-react';
import { Guest, FloorMapData, TableElement } from '../../types';
import { getGuestPartySize, getTableOccupiedSeats } from './floorPlanHelpers';
import { useT } from '../shared/i18n';

interface UnassignedGuestsSidebarProps {
  unassignedGuests: Guest[];
  floorMap: FloorMapData | null;
  guests: Guest[];
  selectedGuest: Guest | null;
  filterQuery: string;
  onFilterQueryChange: (q: string) => void;
  onSelectGuest: (guest: Guest | null) => void;
  onAssign: (guestId: string, tableId: string) => Promise<boolean>;
}

export const UnassignedGuestsSidebar = ({
  unassignedGuests,
  floorMap,
  guests,
  selectedGuest,
  filterQuery,
  onFilterQueryChange,
  onSelectGuest,
  onAssign,
}: UnassignedGuestsSidebarProps) => {
  const t = useT();
  const pSize = selectedGuest ? getGuestPartySize(selectedGuest) : 0;

  const matchingTables: TableElement[] = selectedGuest
    ? (floorMap?.tables.filter((tbl) => tbl.capacity - getTableOccupiedSeats(tbl, guests) >= pSize) ?? [])
    : [];

  return (
    <div className="bg-[#FFFDF9] rounded-3xl p-5 shadow-lg border-2 border-[#CBAE94] space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#CBAE94]/40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#8B735B]/10 text-[#8B735B] flex items-center justify-center font-bold">
            <UserX className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-gaegu text-xl font-bold text-[#4A3F35] leading-none">
              {t.unassignedGuestsLabel}
            </h3>
            <p className="text-[11px] text-[#8B735B] font-medium">
              {t.selectPartyHint}
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold border border-[#CBAE94]">
          {unassignedGuests.length} Unseated
        </span>
      </div>

      {/* Search Filter Box */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder={t.filterUnassignedPh}
          value={filterQuery}
          onChange={(e) => onFilterQueryChange(e.target.value)}
          className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white focus:outline-none focus:ring-2 focus:ring-[#8B735B]/30"
        />
      </div>

      {/* Active Selected Party Highlight Banner */}
      {selectedGuest && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 space-y-2.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-mono font-bold uppercase">
                Active Seating Target
              </span>
              <h4 className="font-bold text-[#4A3F35] text-sm mt-1">
                {selectedGuest.name}
              </h4>
              <p className="text-xs text-emerald-800 font-bold">
                Party of {pSize} ({pSize} seats needed)
              </p>
            </div>
            <button
              onClick={() => onSelectGuest(null)}
              className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-200 transition-colors"
              title={t.clearSelectionBtn}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-emerald-900 bg-emerald-100/70 p-2 rounded-xl border border-emerald-200 leading-snug">
            <strong>{t.mapGuidanceLabel}</strong> Available tables with at least {pSize} free seats are highlighted in <strong className="text-emerald-700 font-extrabold">{t.greenLegend}</strong> {t.greenLegendHint}
          </p>

          {/* Available Table Direct Seating Buttons */}
          <div className="space-y-1 pt-1 border-t border-emerald-200">
            <span className="text-[10px] font-mono font-bold uppercase text-emerald-800 block">
              Matching Tables with Capacity:
            </span>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {matchingTables.map((tbl) => {
                const occ = getTableOccupiedSeats(tbl, guests);
                const free = tbl.capacity - occ;
                return (
                  <button
                    key={tbl.id}
                    onClick={async () => {
                      const success = await onAssign(selectedGuest.id, tbl.id);
                      if (success) onSelectGuest(null);
                    }}
                    className="w-full p-2 rounded-xl bg-white hover:bg-emerald-100 border border-emerald-300 text-left transition-all flex items-center justify-between group shadow-sm"
                  >
                    <span className="text-xs font-bold text-[#4A3F35] group-hover:text-emerald-900 flex items-center gap-1">
                      <Utensils className="w-3 h-3" /> {tbl.name}
                    </span>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      {free} free seats
                    </span>
                  </button>
                );
              })}
              {matchingTables.length === 0 && (
                <p className="text-xs text-amber-700 italic bg-amber-50 p-2 rounded-xl border border-amber-200">
                  No single table currently has {pSize} free seats.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scrollable Unassigned Guest Cards List */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {unassignedGuests.length === 0 ? (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
            <p className="text-xs font-bold text-emerald-900">
              {t.allSeatedTitle}
            </p>
            <p className="text-[11px] text-emerald-700">
              {t.allSeatedMsg}
            </p>
          </div>
        ) : (
          unassignedGuests.map((g) => {
            const guestPSize = getGuestPartySize(g);
            const isSelected = selectedGuest?.id === g.id;

            return (
              <div
                key={g.id}
                onClick={() => onSelectGuest(isSelected ? null : g)}
                className={`p-3 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                  isSelected
                    ? 'bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-300'
                    : 'bg-white hover:bg-[#EFE6DC]/40 border-[#CBAE94]/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-[#4A3F35] text-xs">
                      {g.name}
                    </h4>
                    <p className="text-[11px] text-[#8B735B] font-medium">
                      {g.email}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#EFE6DC] text-[#8B735B] text-[10px] font-bold border border-[#CBAE94]/60 whitespace-nowrap">
                    Party of {guestPSize}
                  </span>
                </div>

                {g.attendee_names && g.attendee_names.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {g.attendee_names.map((att, aIdx) => (
                      <span
                        key={aIdx}
                        className="px-2 py-0.5 rounded-md bg-[#FAF6F0] border border-[#CBAE94]/40 text-[10px] text-[#5D5449] font-medium"
                      >
                        • {att}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectGuest(isSelected ? null : g);
                  }}
                  className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-[#EFE6DC] hover:bg-[#CBAE94]/40 text-[#8B735B]'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Highlighting Available Tables
                    </>
                  ) : (
                    <>
                      <Users className="w-3.5 h-3.5" /> Select & Highlight Tables
                    </>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
