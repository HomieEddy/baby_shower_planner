// Shared file helpers

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Upload a file as base64 JSON to /api/upload; returns the stored photo URL
// (empty string when the server rejects it).
export async function uploadPhotoBase64(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_base64: dataUrl }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.photo_url || '';
}
