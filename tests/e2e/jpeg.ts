// Minimal JPEG helpers for checking what the app stores (PRD F4: no GPS data, at most 2,560 px).

/** Inserts an Exif segment with a GPS latitude tag right after the start-of-image marker. */
export function withGpsExif(jpeg: Buffer): Buffer {
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // big-endian TIFF, IFD0 at 8
    0x00,
    0x01, // IFD0: one entry
    0x88,
    0x25,
    0x00,
    0x04,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x1a, // GPSInfo → offset 26
    0x00,
    0x00,
    0x00,
    0x00, // no next IFD
    0x00,
    0x01, // GPS IFD: one entry
    0x00,
    0x01,
    0x00,
    0x02,
    0x00,
    0x00,
    0x00,
    0x02,
    0x4e,
    0x00,
    0x00,
    0x00, // GPSLatitudeRef "N"
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    length,
    payload,
    jpeg.subarray(2),
  ]);
}

export function hasExif(jpeg: Buffer): boolean {
  return jpeg.includes(Buffer.from('Exif\0\0', 'binary'));
}

/** Width and height from the first start-of-frame marker. */
export function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset < jpeg.length) {
    const marker = jpeg[offset + 1]!;
    const length = jpeg.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('No frame header');
}
