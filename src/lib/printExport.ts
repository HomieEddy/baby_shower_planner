import { toJpeg, toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';

// Export helpers for the escort-cards print job. Each print section is captured
// from its own element, so it can be saved as a separate PDF, JPG or PNG file.

export type ExportFormat = 'pdf' | 'jpg' | 'png';

export interface ExportFile {
  /** File name including its extension, e.g. "name-badges.pdf". */
  name: string;
  blob: Blob;
}

// 3x the CSS layout size is about 288 dpi on a 96 dpi page: print quality.
const HD_PIXEL_RATIO = 3;
const JPG_QUALITY = 0.95;
const PDF_PAGE_JPG_QUALITY = 0.92;
const A4_MM = { width: 210, height: 297 };
const PAGE_MARGIN_MM = 5;

const blobFromDataUrl = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());

const readDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode captured section'));
    img.src = src;
  });

/**
 * Inline every remote <img> (the QR codes) as a data URL before capture. A
 * failed fetch throws, so the export fails loudly instead of silently leaving
 * QR codes out of the file.
 */
async function inlineRemoteImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      const response = await fetch(src);
      if (!response.ok) throw new Error(`QR image request failed: ${response.status}`);
      img.src = await readDataUrl(await response.blob());
      await img.decode();
    })
  );
}

/**
 * How a section maps onto PDF pages:
 * - `page`: the element is one full page (the Find-My-Table poster), drawn edge to edge.
 * - `cards`: each direct child is a card, packed two per row and moved whole to the
 *   next page when it does not fit, so no card is ever split across pages.
 */
export type SectionLayout = 'page' | 'cards';

/** A4 at 96 css px per inch: the size a full-page element is rendered at. */
export const A4_PX = { width: 794, height: 1123 };

const CARD_GAP_MM = 4;

/** Crop one region of the capture into a JPEG data URL. */
function cropToJpeg(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', PDF_PAGE_JPG_QUALITY);
}

async function pagePdf(pngDataUrl: string): Promise<Blob> {
  const img = await loadImage(pngDataUrl);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const jpg = cropToJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight);
  pdf.addImage(jpg, 'JPEG', 0, 0, A4_MM.width, A4_MM.height);
  return pdf.output('blob');
}

interface CardBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Card positions in CSS px, relative to the section element. */
function measureCards(element: HTMLElement): CardBox[] {
  const origin = element.getBoundingClientRect();
  return Array.from(element.children).map((child) => {
    const r = child.getBoundingClientRect();
    return { left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height };
  });
}

async function cardsPdf(pngDataUrl: string, cards: CardBox[], sectionWidthPx: number): Promise<Blob> {
  const img = await loadImage(pngDataUrl);
  const pxScale = img.naturalWidth / sectionWidthPx; // capture px per css px
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  if (cards.length === 0) return pdf.output('blob');

  const usableW = A4_MM.width - PAGE_MARGIN_MM * 2;
  const usableH = A4_MM.height - PAGE_MARGIN_MM * 2;
  const minLeft = Math.min(...cards.map((c) => c.left));
  const maxRight = Math.max(...cards.map((c) => c.left + c.width));
  const mmPerPx = usableW / (maxRight - minLeft);

  // Group cards into the rows the grid laid them out in.
  const rows: CardBox[][] = [];
  for (const card of [...cards].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const row = rows.find((r) => Math.abs(r[0].top - card.top) < 2);
    if (row) row.push(card);
    else rows.push([card]);
  }

  let y = 0;
  rows.forEach((row) => {
    const rowH = Math.max(...row.map((c) => c.height)) * mmPerPx;
    // Move the whole row to a new page rather than cut a card in two.
    if (y > 0 && y + rowH > usableH) {
      pdf.addPage();
      y = 0;
    }
    row.forEach((card) => {
      const jpg = cropToJpeg(img, card.left * pxScale, card.top * pxScale, card.width * pxScale, card.height * pxScale);
      pdf.addImage(
        jpg,
        'JPEG',
        PAGE_MARGIN_MM + (card.left - minLeft) * mmPerPx,
        PAGE_MARGIN_MM + y,
        card.width * mmPerPx,
        card.height * mmPerPx
      );
    });
    y += rowH + CARD_GAP_MM;
  });
  return pdf.output('blob');
}

/** Capture one print section element as an HD file in the chosen format. */
export async function exportSection(element: HTMLElement, format: ExportFormat, layout: SectionLayout): Promise<Blob> {
  await inlineRemoteImages(element);
  const options = { pixelRatio: HD_PIXEL_RATIO, backgroundColor: '#FFFFFF', cacheBust: false };

  if (format === 'jpg') {
    return blobFromDataUrl(await toJpeg(element, { ...options, quality: JPG_QUALITY }));
  }
  const png = await toPng(element, options);
  if (format === 'png') return blobFromDataUrl(png);
  if (layout === 'page') return pagePdf(png);
  return cardsPdf(png, measureCards(element), element.getBoundingClientRect().width);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One file downloads as itself; several are bundled into a single zip. */
export async function downloadExportFiles(files: ExportFile[], zipName: string) {
  if (files.length === 1) {
    saveBlob(files[0].blob, files[0].name);
    return;
  }
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.name, file.blob));
  saveBlob(await zip.generateAsync({ type: 'blob' }), zipName);
}
