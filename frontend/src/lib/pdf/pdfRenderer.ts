/**
 * @fileoverview PDF.js document cache and Canvas page renderer.
 * Uses in-process PDF.js WorkerMessageHandler and Uint8Array binary loading
 * so that rendering succeeds reliably under Wails custom URI schemes (wails://).
 */

import * as pdfjsLib from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {getPDFBytes} from '../backend/wailsBridge';
import type {RotationAngle} from '../types';

// Register WorkerMessageHandler on globalThis so PDF.js uses its direct LoopbackPort
// instead of spawning a cross-origin Blob Worker that fails on `wails://` custom schemes.
(globalThis as Record<string, unknown>)['pdfjsWorker'] = pdfjsWorker;

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();
const canvasRenderSeq = new WeakMap<HTMLCanvasElement, number>();

/** Loads or retrieves a cached PDFDocumentProxy for a given backend sourceId. */
export function getPDFDocument(sourceId: string): Promise<PDFDocumentProxy> {
  const cached = documentCache.get(sourceId);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const rawBytes = await getPDFBytes(sourceId);
    const loadingTask = pdfjsLib.getDocument({
      data: rawBytes,
      cMapUrl: '/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/standard_fonts/',
      isEvalSupported: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      useSystemFonts: true,
    });
    return await loadingTask.promise;
  })().catch((err: unknown) => {
    documentCache.delete(sourceId);
    throw err;
  });

  documentCache.set(sourceId, promise);
  return promise;
}

/** Destroys all cached PDFDocumentProxy instances and clears the in-memory document cache. */
export function clearPDFDocumentCache(): void {
  for (const promise of documentCache.values()) {
    void promise.then((doc) => doc.destroy()).catch(() => {});
  }
  documentCache.clear();
}

export interface RenderPageOptions {
  readonly canvas: HTMLCanvasElement;
  readonly sourceId: string;
  readonly pageNumber: number;
  readonly rotation: RotationAngle;
  readonly targetWidth: number;
  readonly targetHeight?: number;
}

/**
 * Renders a single PDF page onto the target HTMLCanvasElement at the requested display width
 * and relative rotation angle. Renders to an offscreen canvas first to prevent concurrent
 * render() conflicts on the same HTMLCanvasElement.
 */
export async function renderPageToCanvas(options: RenderPageOptions): Promise<void> {
  const {canvas, sourceId, pageNumber, rotation, targetWidth, targetHeight} = options;
  const seq = (canvasRenderSeq.get(canvas) ?? 0) + 1;
  canvasRenderSeq.set(canvas, seq);

  const pdfDoc = await getPDFDocument(sourceId);
  if (canvasRenderSeq.get(canvas) !== seq) {
    return;
  }

  const page = await pdfDoc.getPage(pageNumber);
  if (canvasRenderSeq.get(canvas) !== seq) {
    return;
  }

  const baseRotation = (page.rotate + rotation) % 360;
  const unscaledViewport = page.getViewport({scale: 1, rotation: baseRotation});

  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  let scale = (targetWidth / Math.max(1, unscaledViewport.width)) * devicePixelRatio;
  if (targetHeight && targetHeight > 0) {
    const scaleY = (targetHeight / Math.max(1, unscaledViewport.height)) * devicePixelRatio;
    scale = Math.min(scale, scaleY);
  }
  const viewport = page.getViewport({scale, rotation: baseRotation});

  const pixelWidth = Math.max(1, Math.floor(viewport.width));
  const pixelHeight = Math.max(1, Math.floor(viewport.height));

  // Render onto an isolated offscreen canvas so concurrent updates never collide
  const offscreen = document.createElement('canvas');
  offscreen.width = pixelWidth;
  offscreen.height = pixelHeight;

  const offscreenCtx = offscreen.getContext('2d');
  if (!offscreenCtx) {
    throw new Error('Canvas 2D コンテキストを取得できませんでした。');
  }

  offscreenCtx.fillStyle = '#ffffff';
  offscreenCtx.fillRect(0, 0, pixelWidth, pixelHeight);

  await page.render({
    canvasContext: offscreenCtx,
    viewport,
  }).promise;

  // Discard if a newer render request was started on the target canvas while we were rendering
  if (canvasRenderSeq.get(canvas) !== seq) {
    return;
  }

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  canvas.style.width = `${Math.floor(pixelWidth / devicePixelRatio)}px`;
  canvas.style.height = `${Math.floor(pixelHeight / devicePixelRatio)}px`;

  const targetCtx = canvas.getContext('2d');
  if (!targetCtx) {
    throw new Error('ターゲット Canvas 2D コンテキストを取得できませんでした。');
  }
  targetCtx.drawImage(offscreen, 0, 0);
}
