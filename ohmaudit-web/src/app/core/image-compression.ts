const MAX_JPEG_QUALITY = 0.85;
const MIN_JPEG_QUALITY = 0.5;
const QUALITY_SEARCH_PASSES = 4;

export interface CompressionOptions {
  maxDimension?: number;
  targetBytes?: number;
}

function encodeToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed.'))),
      'image/jpeg',
      quality,
    ),
  );
}

export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {},
): Promise<Blob> {
  const maxDimension = options.maxDimension ?? 2048;
  const targetBytes = options.targetBytes ?? 500_000;

  const bitmap = await createImageBitmap(file);
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

    let result = await encodeToJpeg(canvas, MAX_JPEG_QUALITY);
    if (result.size <= targetBytes) return result;

    let lowerQuality = MIN_JPEG_QUALITY;
    let upperQuality = MAX_JPEG_QUALITY;
    result = await encodeToJpeg(canvas, lowerQuality);
    if (result.size > targetBytes) return result;

    for (let pass = 0; pass < QUALITY_SEARCH_PASSES; pass += 1) {
      const quality = (lowerQuality + upperQuality) / 2;
      const candidate = await encodeToJpeg(canvas, quality);
      if (candidate.size <= targetBytes) {
        lowerQuality = quality;
        result = candidate;
      } else {
        upperQuality = quality;
      }
    }
    return result;
  } finally {
    bitmap.close();
  }
}

export async function compressLogo(file: File | Blob): Promise<Blob> {
  return compressImage(file, { maxDimension: 1200, targetBytes: 200_000 });
}

export async function compressPhoto(file: File | Blob): Promise<Blob> {
  return compressImage(file, { maxDimension: 2048, targetBytes: 500_000 });
}
