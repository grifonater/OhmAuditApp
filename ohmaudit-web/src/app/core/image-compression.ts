const MAX_JPEG_QUALITY = 0.85;
const MIN_JPEG_QUALITY = 0.5;
const QUALITY_STEP = 0.05;

export interface CompressionOptions {
  maxDimension?: number;
  targetBytes?: number;
}

async function encodeToJpeg(
  source: File | Blob,
  maxDimension: number,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot process images.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
        'image/jpeg',
        quality,
      ),
    );
  } finally {
    bitmap.close();
  }
}

export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {},
): Promise<Blob> {
  const maxDimension = options.maxDimension ?? 2048;
  const targetBytes = options.targetBytes ?? 500_000;

  let quality = MAX_JPEG_QUALITY;
  let result = await encodeToJpeg(file, maxDimension, quality);

  while (result.size > targetBytes && quality > MIN_JPEG_QUALITY) {
    quality -= QUALITY_STEP;
    result = await encodeToJpeg(file, maxDimension, quality);
  }

  return result;
}

export async function compressLogo(file: File | Blob): Promise<Blob> {
  return compressImage(file, { maxDimension: 1200, targetBytes: 200_000 });
}

export async function compressPhoto(file: File | Blob): Promise<Blob> {
  return compressImage(file, { maxDimension: 2048, targetBytes: 500_000 });
}
