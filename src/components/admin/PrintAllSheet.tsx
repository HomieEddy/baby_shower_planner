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

/**
 * Find-My-Table welcome poster (moved here from the check-in page).
 * `fullPage` renders it at its printed size, filling the parent (an A4 page in
 * the export), instead of the small preview card.
 */
export const PrintablePoster = ({ settings, fullPage }: { settings?: EventSettings | null; fullPage?: boolean }) => {
  const t = useT();
  const tf = useTf();
  const babyName = settings?.babyName || '';
  const parents = settings?.parentsNames || '';
  const venue = settings?.venueName || '';
  const date = settings?.date || '';

  // Tailwind needs literal class names, so both size sets are spelled out.
  const c = fullPage
    ? {
        root: 'w-full h-full p-12 gap-6',
        pill: 'px-6 py-2 text-lg',
        heading: 'text-5xl',
        sub: 'text-2xl',
        qr: 'w-[120mm] h-[120mm] p-4 border-4',
        scan: 'text-3xl',
        date: 'text-lg',
      }
    : {
        root: 'border-2 border-dashed border-[#CBAE94] p-4 print:p-12 h-80 sm:h-72 gap-2 print:gap-6 md:col-span-2',
        pill: 'px-3 py-0.5 print:px-6 print:py-2 text-[10px] print:text-lg',
        heading: 'text-xl print:text-5xl',
        sub: 'text-[11px] print:text-2xl',
        qr: 'w-32 h-32 print:w-[120mm] print:h-[120mm] p-1.5 print:p-4 border-2 print:border-4',
        scan: 'text-sm print:text-3xl',
        date: 'text-[10px] print:text-lg',
      };

  return (
    <div className={`print-keep-color print-full-page break-inside-avoid bg-[#FAF6F0] flex flex-col items-center justify-center text-center ${c.root}`}>
      <span className={`inline-block rounded-full bg-[#EFE6DC] text-[#8B735B] font-mono font-bold uppercase tracking-wider ${c.pill}`}>
        {t.posterWelcome}
      </span>
      <h3 className={`font-newsreader font-bold text-[#4A3F35] leading-tight ${c.heading}`}>
        {babyName ? tf('printPosterHeading', { name: babyName }) : 'Baby Shower'}
      </h3>
      {(parents || venue) && (
        <p className={`font-bold text-[#8B735B] ${c.sub}`}>{[parents, venue].filter(Boolean).join(' • ')}</p>
      )}
      <div className={`bg-white border-[#CBAE94] flex items-center justify-center ${c.qr}`}>
        <img src={findTableQrUrl()} alt={t.posterScanTitle} className="w-full h-full object-contain" />
      </div>
      <p className={`font-bold text-[#4A3F35] leading-tight ${c.scan}`}>{t.posterScanTitle}</p>
      {date && <p className={`font-mono text-[#8B735B] ${c.date}`}>{date} • {t.dayOfTitle}</p>}
    </div>
  );
};

/**
 * Table QR standee: guests scan it to drop photos for their table. It is one
 * half of a portrait A4 sheet (200 x 143 mm, the printable width and half the
 * printable height), so two standees fill one page. Sizes are in mm so the
 * print and the PDF/image export look the same.
 */
export const PrintableStandee = ({ table }: { table: TableElement }) => {
  const t = useT();
  const tf = useTf();
  return (
    <div className="print-keep-color break-inside-avoid border-2 border-dashed border-[#8B735B] bg-[#FAF6F0] w-full h-[143mm] px-[10mm] py-[6mm] flex flex-col items-center justify-center text-center gap-[4mm]">
      <span className="inline-block max-w-full px-[4mm] py-[1mm] rounded-full bg-amber-200 text-amber-900 text-[3.2mm] font-bold uppercase tracking-wider text-center leading-snug break-words [overflow-wrap:anywhere]">
        {table.name} • {t.tableQrPhotoDrop}
      </span>
      <h4 className="font-gaegu text-[10mm] font-bold text-[#4A3F35] leading-tight">{t.tableQrShareTitle}</h4>
      <div className="w-[60mm] h-[60mm] bg-white p-[3mm] border-2 border-[#CBAE94] flex items-center justify-center">
        <img src={tableQrUrl(table.id)} alt={tf('tableQrAlt', { name: table.name })} className="w-full h-full object-contain" />
      </div>
      <p className="text-[3.6mm] font-medium text-[#8B735B] leading-snug max-w-[150mm]">{t.tableQrScanDesc}</p>
    </div>
  );
};

/**
 * Two table QR standees stacked on one portrait A4 sheet, one per half. The
 * pair is one page in print and one page in the PDF export.
 */
export const PrintableStandeePair = ({ tables }: { tables: TableElement[] }) => (
  <div className="print-standee-pair md:col-span-2 flex flex-col">
    {tables.map((tbl) => (
      <PrintableStandee key={tbl.id} table={tbl} />
    ))}
  </div>
);
