// Locate + safely manipulate files under the uploads directory (server-side).

import path from 'node:path';
import fs from 'node:fs';

// UPLOAD_DIR lets deployments persist uploads on a volume (Coolify: mount a
// volume here). Defaults to public/uploads for local/dev parity.
export const UPLOADS_DIR = path.resolve(
  process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads')
);
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Joins a stored URL/name into a path, refusing path traversal (basename only).
export function getUploadFilePath(name: string): string {
  return path.join(UPLOADS_DIR, path.basename(name));
}

// Best-effort deletion of uploaded files (URLs like /uploads/x.jpg or names).
export function removeUploadFiles(names: string[]): void {
  for (const name of names) {
    if (!name) continue;
    const filePath = getUploadFilePath(name);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* best effort */ }
  }
}