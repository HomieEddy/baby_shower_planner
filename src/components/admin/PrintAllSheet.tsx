import { EventSettings, TableElement } from '../../types';
import { useT, useTf } from '../shared/i18n';

// Printable pieces for the single "print everything" job on the escort cards
// page. Each piece is a self-contained card with a dashed cut border, sized to
// pack tightly with the escort cards and badges on narrow-margin paper.

const tableQrUrl = (tableId: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    `${window.location.origin}/scan?table=${tableId}`
  )}`;

const findTableQrUrl = () =>
  `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(
    `${window.location.origin}/find-my-table`
  )}&color=4A3F35&bgcolor=FFFDF9`;

/** Find-My-Table welcome poster (moved here from the check-in page). */
export const PrintablePoster = ({ settings }: { settings?: EventSettings | null }) => {
  const t = useT();
  const tf = useTf();
  const babyName = settings?.babyName || '';
  const parents = settings?.parentsNames || '';
  const venue = settings?.venueName || '';
  const date = settings?.date || '';

  return (
    <div className="print-keep-color print-full-page break-inside-avoid border-2 border-dashed border-[#CBAE94] bg-[#FAF6F0] p-4 print:p-12 h-80 sm:h-72 flex flex-col items-center justify-center text-center gap-2 print:gap-6 md:col-span-2">
      <span className="inline-block px-3 py-0.5 print:px-6 print:py-2 rounded-full bg-[#EFE6DC] text-[#8B735B] text-[10px] print:text-lg font-mono font-bold uppercase tracking-wider">
        {t.posterWelcome}
      </span>
      <h3 className="font-newsreader text-xl print:text-5xl font-bold text-[#4A3F35] leading-tight">
        {babyName ? tf('printPosterHeading', { name: babyName }) : 'Baby Shower'}
      </h3>
      {(parents || venue) && (
        <p className="text-[11px] print:text-2xl font-bold text-[#8B735B]">{[parents, venue].filter(Boolean).join(' • ')}</p>
      )}
      <div className="w-32 h-32 print:w-[120mm] print:h-[120mm] bg-white p-1.5 print:p-4 border-2 print:border-4 border-[#CBAE94] flex items-center justify-center">
        <img src={findTableQrUrl()} alt={t.posterScanTitle} className="w-full h-full object-contain" />
      </div>
      <p className="text-sm print:text-3xl font-bold text-[#4A3F35] leading-tight">{t.posterScanTitle}</p>
      {date && <p className="text-[10px] print:text-lg font-mono text-[#8B735B]">{date} • {t.dayOfTitle}</p>}
    </div>
  );
};

/** Table QR standee: guests scan it to drop photos for their table. */
export const PrintableStandee = ({ table }: { table: TableElement }) => {
  const t = useT();
  const tf = useTf();
  return (
    <div className="print-keep-color break-inside-avoid border-2 border-dashed border-[#8B735B] bg-[#FAF6F0] p-4 h-80 sm:h-72 flex flex-col items-center justify-center text-center gap-2">
      <span className="inline-block px-3 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold uppercase tracking-wider">
        {table.name} • {t.tableQrPhotoDrop}
      </span>
      <h4 className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-tight">{t.tableQrShareTitle}</h4>
      <div className="w-32 h-32 bg-white p-1.5 border-2 border-[#CBAE94] flex items-center justify-center">
        <img src={tableQrUrl(table.id)} alt={tf('tableQrAlt', { name: table.name })} className="w-full h-full object-contain" />
      </div>
      <p className="text-[11px] font-medium text-[#8B735B] leading-snug max-w-xs">{t.tableQrScanDesc}</p>
    </div>
  );
};
