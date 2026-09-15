// CSV parsing, serialization and browser download. One implementation shared
// by the guest list and the catering manifest.

// Split one CSV line into trimmed cells; quoted fields may contain commas and
// a doubled quote ("") escapes a literal quote.
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

// Quote a cell for CSV output (also used for import-compatible first columns).
export const csvCell = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Header row + data rows → CSV text. Cells must already be escaped via csvCell.
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// Trigger a UTF-8 CSV download in the browser.
export function downloadCsv(filename: string, content: string): void {
  const link = document.createElement('a');
  link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURI(content));
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
