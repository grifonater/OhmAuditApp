export const maximumImageBytes = 2_000_000;

export const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Builds a base64 `data:` URI suitable for vision model input.
 */
export function dataUri(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
