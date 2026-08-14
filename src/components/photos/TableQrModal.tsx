import { useState } from 'react';
import { QrCode, Printer } from 'lucide-react';
import { TableElement } from '../../types';
import { Modal } from '../shared/Modal';
import { useT } from '../shared/i18n';

const qrUrl = (tableId: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    `${window.location.origin}/upload-photos?tableId=${tableId}`
  )}`;

const QrStandeeCard = ({ table, last }: { table: TableElement; last?: boolean }) => (
  <div
    className={`printable-qr-card p-6 bg-[#FAF6F0] rounded-3xl border-2 border-dashed border-[#8B735B] text-center space-y-4 ${
      last ? '' : 'page-break-after'
    }`}
  >
    <span className="inline-block px-3 py-1 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold uppercase tracking-wider">
      {table.name} • Photo Drop
    </span>

    <h4 className="font-gaegu text-3xl font-bold text-[#4A3F35]">
      Share Your Baby Shower Photos!
    </h4>

    <div className="w-40 h-40 mx-auto bg-white p-3 rounded-2xl border-2 border-[#CBAE94] shadow-md flex items-center justify-center">
      <img
        src={qrUrl(table.id)}
        alt={`QR code for ${table.name}`}
        className="w-full h-full object-contain"
      />
    </div>

    <p className="text-xs font-medium text-[#8B735B] max-w-sm mx-auto leading-relaxed">
      Scan this QR code with your smartphone camera to instantly upload table photos into the hosts' memory library!
    </p>

    <div className="text-[10px] font-mono text-[#8B735B] pt-2 border-t border-dashed border-[#CBAE94]/60">
      Table: {table.name} • Scan & Upload • No App Required
    </div>
  </div>
);

export const TableQrModal = ({ open, onClose, tables }: { open: boolean; onClose: () => void; tables: TableElement[] }) => {
  const t = useT();
  const [printScope, setPrintScope] = useState<'single' | 'all'>('single');
  const [selectedPrintTable, setSelectedPrintTable] = useState<TableElement | null>(null);

  return (
    <Modal open={open} onClose={onClose} maxWidth="2xl"
      wrapperClassName="print:p-0 print:bg-white print:static print:block"
      panelClassName="print:bg-white print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none"
      contentClassName="space-y-6 print:max-h-none print:overflow-visible"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-700 text-white flex items-center justify-center">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
              Print Table Photo Upload Standees
            </h3>
            <p className="text-xs text-[#8B735B]">
              Place these QR standees on every table so guests can upload photos!
            </p>
          </div>
        </div>
      }>
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs print:hidden">
        <strong>{t.howItWorksLabel}</strong> Guests scan the QR code placed on their table. It opens the Photo Upload portal directly with their table pre-selected!
      </div>

      {/* Print Scope Switcher */}
      <div className="space-y-2 print:hidden">
        <label className="block text-xs font-bold text-[#4A3F35]">
          Print Mode:
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPrintScope('single')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
              printScope === 'single'
                ? 'bg-[#8B735B] text-white border-[#8B735B] shadow-sm'
                : 'bg-white text-[#4A3F35] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
            }`}
          >
            Single Table Standee
          </button>
          <button
            type="button"
            onClick={() => setPrintScope('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
              printScope === 'all'
                ? 'bg-[#8B735B] text-white border-[#8B735B] shadow-sm'
                : 'bg-white text-[#4A3F35] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
            }`}
          >
            All Venue Tables ({tables.length} Standees)
          </button>
        </div>
      </div>

      {/* Table Selection for Single Table Mode */}
      {printScope === 'single' && (
        <div className="print:hidden">
          <label className="block text-xs font-bold text-[#4A3F35] mb-2">
            Select Venue Table Standee:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
            {tables.map((tbl) => (
              <button
                key={tbl.id}
                type="button"
                onClick={() => setSelectedPrintTable(tbl)}
                className={`p-3 rounded-2xl text-xs font-bold border transition-all text-left ${
                  selectedPrintTable?.id === tbl.id
                    ? 'bg-[#8B735B] text-white border-[#8B735B] shadow-md'
                    : 'bg-white border-[#CBAE94]/60 text-[#4A3F35] hover:bg-[#EFE6DC]'
                }`}
              >
                {tbl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Standee Preview Cards Container */}
      <div className="space-y-6">
        {printScope === 'single' && selectedPrintTable && (
          <QrStandeeCard table={selectedPrintTable} last />
        )}

        {printScope === 'all' && (
          <div className="space-y-8 max-h-[50vh] overflow-y-auto print:max-h-none print:overflow-visible">
            {tables.map((tbl, idx) => (
              <QrStandeeCard key={tbl.id} table={tbl} last={idx === tables.length - 1} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 print:hidden">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#4A3F35]"
        >
          Close
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-xl bg-[#8B735B] text-white text-xs font-bold flex items-center gap-2 hover:bg-[#705C47]"
        >
          <Printer className="w-4 h-4" />
          <span>Print {printScope === 'all' ? `All (${tables.length})` : 'Selected'} Standees</span>
        </button>
      </div>
    </Modal>
  );
};
