/**
 * @fileoverview Wrapper around Wails Go backend bindings and runtime events.
 * Gracefully handles browser-only preview/test environments when window.go is absent.
 */

import type {ExportRequest, SourcePDF} from '../types';

interface WailsAppBindings {
  SelectPDFs(): Promise<SourcePDF[]>;
  GetPDFBase64(sourceId: string): Promise<string>;
  ExportPDF(req: ExportRequest): Promise<string>;
}

interface WailsRuntime {
  EventsOn(eventName: string, callback: (...data: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: WailsAppBindings;
      };
    };
    runtime?: WailsRuntime;
  }
}

function getAppBindings(): WailsAppBindings {
  const app = window.go?.main?.App;
  if (!app) {
    throw new Error('Wails バックエンドバインディングが初期化されていません。');
  }
  return app;
}

/** Decodes a standard Base64 string into a Uint8Array. */
function decodeBase64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Opens the native file selection dialog and returns the registered SourcePDFs. */
export async function selectPDFsViaDialog(): Promise<SourcePDF[]> {
  const result = await getAppBindings().SelectPDFs();
  return result ?? [];
}

/**
 * Fetches the raw PDF bytes for a registered sourceId via Wails Go IPC (GetPDFBase64),
 * falling back to /local-pdf/{sourceId} HTTP fetch if needed.
 */
export async function getPDFBytes(sourceId: string): Promise<Uint8Array> {
  const app = window.go?.main?.App;
  if (app?.GetPDFBase64) {
    const base64Data = await app.GetPDFBase64(sourceId);
    return decodeBase64ToBytes(base64Data);
  }

  const response = await fetch(`/local-pdf/${encodeURIComponent(sourceId)}`);
  if (!response.ok) {
    throw new Error(`PDFデータの取得に失敗しました (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Exports the composed PDF via the Go backend and returns the saved file path (or "" if cancelled). */
export async function exportComposedPDF(req: ExportRequest): Promise<string> {
  return getAppBindings().ExportPDF(req);
}

/** Subscribes to native file drop events emitted by the Go backend. */
export function subscribeToFileDrop(
  onFilesDropped: (sources: SourcePDF[]) => void,
  onDropError: (message: string) => void,
): () => void {
  const runtime = window.runtime;
  if (!runtime?.EventsOn) {
    return () => {};
  }

  const offDropped = runtime.EventsOn('pdf:files-dropped', (data: unknown) => {
    if (Array.isArray(data)) {
      onFilesDropped(data as SourcePDF[]);
    }
  });

  const offError = runtime.EventsOn('pdf:drop-error', (errMessage: unknown) => {
    if (typeof errMessage === 'string') {
      onDropError(errMessage);
    }
  });

  return () => {
    offDropped();
    offError();
  };
}
