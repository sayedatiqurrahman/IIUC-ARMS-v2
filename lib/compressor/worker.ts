'use client';

// Web Worker that runs the CPU-heavy image + archive compression off the main
// thread so the Studio UI stays responsive. It receives a File + mode, runs the
// matching engine, and posts back a serialised File (or null when the file
// can't be reduced). Decode/encode is fully worker-safe (OffscreenCanvas +
// createImageBitmap); the wasm codecs are fetched from /jsquash at runtime.

import { compressImageFile, optimizeArchive, type CompressMode } from './engines';

interface WorkerRequest {
  id: number;
  kind: 'image' | 'archive';
  file: File;
  mode: CompressMode;
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  result: { name: string; type: string; buffer: ArrayBuffer } | null;
  error?: string;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void;
};

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, kind, file, mode } = e.data;
  try {
    const out = kind === 'archive' ? await optimizeArchive(file, mode) : await compressImageFile(file, mode);
    if (!out) {
      ctx.postMessage({ id, ok: true, result: null });
      return;
    }
    const buffer = await out.arrayBuffer();
    ctx.postMessage({ id, ok: true, result: { name: out.name, type: out.type, buffer } }, [buffer]);
  } catch (err) {
    ctx.postMessage({ id, ok: false, result: null, error: err instanceof Error ? err.message : String(err) });
  }
};
