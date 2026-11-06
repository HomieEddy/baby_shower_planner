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

/** Lay a tall section capture across A4 pages, one slice per page. */
async function pngToPdfBlob(pngDataUrl: string): Promise<Blob> {
  const img = await loadImage(pngDataUrl);
  const { naturalWidth: srcW, naturalHeight: srcH } = img;
  const usableW = A4_MM.width - PAGE_MARGIN_MM * 2;
  const usableH = A4_MM.height - PAGE_MARGIN_MM * 2;
  const mmPerPx = usableW / srcW;
  const slicePx = Math.floor(usableH / mmPerPx);

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  let offset = 0;
  while (offset < srcH) {
    const sliceH = Math.min(slicePx, srcH - offset);
    canvas.height = sliceH;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, srcW, sliceH);
    ctx.drawImage(img, 0, offset, srcW, sliceH, 0, 0, srcW, sliceH);
    if (offset > 0) pdf.addPage();
    pdf.addImage(
      canvas.toDataURL('image/jpeg', PDF_PAGE_JPG_QUALITY),
      'JPEG',
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM,
      usableW,
      sliceH * mmPerPx
    );
    offset += sliceH;
  }
  return pdf.output('blob');
}

/** Capture one print section element as an HD file in the chosen format. */
export async function exportSection(element: HTMLElement, format: ExportFormat): Promise<Blob> {
  await inlineRemoteImages(element);
  const options = { pixelRatio: HD_PIXEL_RATIO, backgroundColor: '#FFFFFF', cacheBust: false };

  if (format === 'jpg') {
    return blobFromDataUrl(await toJpeg(element, { ...options, quality: JPG_QUALITY }));
  }
  const png = await toPng(element, options);
  if (format === 'png') return blobFromDataUrl(png);
  return pngToPdfBlob(png);
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
