export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

export async function compressImage(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    outputType?: string;
  } = {}
): Promise<CompressionResult> {
  const { maxWidth = 1920, maxHeight = 1920, quality = 0.84, outputType = 'image/jpeg' } = options;

  // Return original file if non-compressible or very small (< 150KB)
  if (file.type === 'image/gif' || file.size < 150 * 1024) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => {
      resolve({ file, originalSize: file.size, compressedSize: file.size, width: 0, height: 0 });
    };

    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => {
        resolve({ file, originalSize: file.size, compressedSize: file.size, width: 0, height: 0 });
      };

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate proportional scaling
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ file, originalSize: file.size, compressedSize: file.size, width, height });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              // If compression produced a larger blob or failed, preserve original
              resolve({
                file,
                originalSize: file.size,
                compressedSize: file.size,
                width: img.width,
                height: img.height,
              });
              return;
            }

            const fileName = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            const compressedFile = new File([blob], fileName, {
              type: outputType,
              lastModified: Date.now(),
            });

            resolve({
              file: compressedFile,
              originalSize: file.size,
              compressedSize: compressedFile.size,
              width,
              height,
            });
          },
          outputType,
          quality
        );
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
