'use client';

// Thin, lazy-initialised wrapper around the jsquash wasm codecs (mozjpeg +
// webp). These produce markedly smaller files than the browser's native
// canvas JPEG/WebP encoder at the same visual quality, which is what lets the
// client-side compressor shrink images and PDFs far more aggressively.
//
// The wasm binaries are served from /jsquash (copied there by
// scripts/copy-jsquash-wasm.js at build time) and located via `locateFile`.

import jpegEncode, { init as jpegInit } from '@jsquash/jpeg/encode';
import jpegDecode from '@jsquash/jpeg/decode';

const BASE = '/jsquash';
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  if (ready) return ready;
  const locateFile = (file: string) => `${BASE}/${file}`;
  ready = jpegInit({ locateFile }).then(() => undefined);
  return ready;
}

export interface RawImage {
  data: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

// Encode raw RGBA pixels to a JPEG using MozJPEG at the given quality (0-1).
// MozJPEG beats the browser's native canvas JPEG at the same quality, so
// compressed images come out noticeably smaller for the same visual result.
export async function encodeJpeg(img: RawImage, quality: number): Promise<Uint8Array<ArrayBuffer>> {
  await ensureReady();
  const buf = await jpegEncode(img as unknown as ImageData, { quality: Math.round(quality * 100) });
  return new Uint8Array(buf);
}

// Decode a JPEG byte stream (e.g. an embedded PDF image XObject) into RGBA
// pixels so it can be re-encoded at a lower quality / resolution.
export async function decodeJpeg(bytes: Uint8Array): Promise<RawImage> {
  await ensureReady();
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const img = (await jpegDecode(ab)) as unknown as RawImage;
  return img;
}
