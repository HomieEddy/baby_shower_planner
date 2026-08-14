import { Wand2, Sparkles } from 'lucide-react';
import { Guest, TableElement } from '../../types';
import { Modal } from '../shared/Modal';
import { useT } from '../shared/i18n';

export interface SmartSuggestion {
  id: string;
  guest: Guest;
  table: TableElement;
  partySize: number;
  freeSeats: number;
  matchBadge: 'Exact Fit' | 'Optimal Capacity' | 'Party Grouping';
  reason: string;
}

interface SmartSuggestionsModalProps {
  open: boolean;
  suggestions: SmartSuggestion[];
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSuggestion: (id: string) => void;
  onApply: () => void;
  onClose: () => void;
}

export const SmartSuggestionsModal = ({
  open,
  suggestions,
  selectedIds,
  onToggleSelectAll,
  onToggleSuggestion,
  onApply,
  onClose,
}: SmartSuggestionsModalProps) => {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} maxWidth="xl"
      panelClassName="flex flex-col max-h-[90vh]"
      contentClassName="overflow-y-auto max-h-none flex-1"
      title={
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-600 to-[#8B735B] text-white flex items-center justify-center shadow-md">
            <Wand2 className="w-5 h-5 text-amber-200" />
          </div>
          <div>
            <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-none">
              Smart Seating Suggestions
            </h3>
            <p className="text-xs text-[#8B735B] font-medium mt-1">
              Auto-matches unassigned guest parties to available venue tables by optimal capacity fit.
            </p>
          </div>
        </div>
      }>
      {/* Suggestions Count & Actions */}
      <div className="flex items-center justify-between text-xs bg-[#EFE6DC]/60 p-3 rounded-2xl border border-[#CBAE94]/40">
        <span className="font-bold text-[#4A3F35]">
          {t.seatingProposalsCount.replace('{{count}}', String(suggestions.length))}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSelectAll}
            className="px-2.5 py-1 rounded-lg bg-white border border-[#CBAE94] text-[11px] font-bold text-[#8B735B] hover:bg-[#EFE6DC]"
          >
            {selectedIds.size === suggestions.length
              ? t.deselectAllBtn
              : t.selectAllBtn}
          </button>
        </div>
      </div>

      {/* Suggestions List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {suggestions.map((sug) => {
          const isChecked = selectedIds.has(sug.id);

          return (
            <div
              key={sug.id}
              onClick={() => onToggleSuggestion(sug.id)}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                isChecked
                  ? 'bg-amber-50/60 border-amber-500 shadow-sm ring-1 ring-amber-300'
                  : 'bg-white border-[#CBAE94]/40 opacity-75 hover:opacity-100'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-[#CBAE94]"
                  />
                  <div>
                    <h4 className="font-bold text-[#4A3F35] text-sm flex items-center gap-2">
                      <span>{sug.guest.name}</span>
                      <span className="text-xs font-normal text-[#8B735B]">
                        ({sug.guest.email})
                      </span>
                    </h4>
                    <p className="text-xs text-[#5D5449] mt-0.5">
                      Party Size: <strong className="text-[#4A3F35]">{sug.partySize} guest(s)</strong>
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                    {sug.matchBadge}
                  </span>
                  <div className="text-xs font-bold text-[#8B735B] mt-1">
                    Assign to <span className="text-[#4A3F35] underline">{sug.table.name}</span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#8B735B] bg-[#FAF6F0] p-2 rounded-xl border border-[#CBAE94]/30 font-medium">
                {sug.reason}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Footer Controls */}
      <div className="flex items-center justify-between border-t border-[#CBAE94]/40 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] hover:bg-[#EFE6DC]"
        >
          {t.cancelBtn}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={selectedIds.size === 0}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-700 to-emerald-700 hover:brightness-110 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-4 h-4 text-amber-200" />
          {t.applySeatingBtn.replace('{{count}}', String(selectedIds.size))}
        </button>
      </div>
    </Modal>
  );
};
