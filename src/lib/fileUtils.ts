// Shared file helpers

import { adminFetch } from './api';

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Upload a file as base64 JSON to /api/upload; returns the stored photo URL
// (empty string when the server rejects it). `admin` sends the host token, which
// the upload route needs for host-side uploads outside the guest content window.
export async function uploadPhotoBase64(file: File, { admin = false }: { admin?: boolean } = {}): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const send = admin ? adminFetch : fetch;
  const res = await send('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_base64: dataUrl }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.photo_url || '';
}
