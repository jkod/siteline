import {
  PHOTO_DISPLAY_MAX_PX,
  PHOTO_JPEG_QUALITY,
  PHOTO_THUMB_MAX_PX,
  PHOTO_UPLOAD_MAX_BYTES,
} from '@siteline/shared';

export interface PreparedPhoto {
  display: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export class PhotoTooLargeError extends Error {
  constructor() {
    super('photo_too_large');
    this.name = 'PhotoTooLargeError';
  }
}

/** Width and height that fit within `max` on the longest side, keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Prepares a photo in the browser before upload (PRD 4.2): rotated by its EXIF orientation, a
 * 2,560 px display version and a 640 px thumbnail, JPEG at 0.8. Re-encoding through a canvas
 * drops all metadata, GPS included.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.size > PHOTO_UPLOAD_MAX_BYTES) throw new PhotoTooLargeError();
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const display = fitWithin(bitmap.width, bitmap.height, PHOTO_DISPLAY_MAX_PX);
    const thumb = fitWithin(bitmap.width, bitmap.height, PHOTO_THUMB_MAX_PX);
    return {
      display: await encode(bitmap, display.width, display.height),
      thumb: await encode(bitmap, thumb.width, thumb.height),
      width: display.width,
      height: display.height,
    };
  } finally {
    bitmap.close();
  }
}

async function encode(bitmap: ImageBitmap, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas_unavailable');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
      'image/jpeg',
      PHOTO_JPEG_QUALITY,
    ),
  );
}
