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

interface CachedHighResPage {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
}

function createOffscreenCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D コンテキストを取得できませんでした。');
    }
    return {canvas, ctx};
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D コンテキストを取得できませんでした。');
    }
    return {canvas, ctx};
  }
  throw new Error('Canvas環境が初期化されていません。');
}

const highResCache = new Map<string, CachedHighResPage>();
const MAX_HIGH_RES_CACHE = 16;

function putHighResCache(key: string, entry: CachedHighResPage): void {
  if (highResCache.has(key)) {
    highResCache.delete(key);
  } else if (highResCache.size >= MAX_HIGH_RES_CACHE) {
    const oldestKey = highResCache.keys().next().value;
    if (oldestKey !== undefined) {
      highResCache.delete(oldestKey);
    }
  }
  highResCache.set(key, entry);
}

function getHighResCache(key: string): CachedHighResPage | undefined {
  const entry = highResCache.get(key);
  if (entry) {
    highResCache.delete(key);
    highResCache.set(key, entry);
  }
  return entry;
}

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

/** Destroys all cached PDFDocumentProxy instances and clears all in-memory caches. */
export function clearPDFDocumentCache(): void {
  for (const promise of documentCache.values()) {
    void promise.then((doc) => doc.destroy()).catch(() => {});
  }
  documentCache.clear();
  highResCache.clear();
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
  const {canvas: offscreen, ctx: offscreenCtx} = createOffscreenCanvas(pixelWidth, pixelHeight);

  offscreenCtx.fillStyle = '#ffffff';
  offscreenCtx.fillRect(0, 0, pixelWidth, pixelHeight);

  await page.render({
    canvasContext: offscreenCtx as unknown as CanvasRenderingContext2D,
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

/** ページ上の正規化された矩形領域 (0.0 〜 1.0) */
export interface PageRegion {
  readonly xPercent: number;
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
}

export interface RenderHighResRegionOptions {
  readonly canvas: HTMLCanvasElement;
  readonly sourceId: string;
  readonly pageNumber: number;
  readonly rotation: RotationAngle;
  readonly region: PageRegion;
  /** 高解像度レンダリング時の基準ページ幅 (デフォルト: 1400px) */
  readonly baseWidth?: number;
}

/**
 * 元PDFの解像度に近い高精細（基準幅1400px）でページ全体をオフスクリーンレンダリングし、
 * 指定された領域（右上コーナー等）を高解像度でターゲット Canvas に転送する。
 * 最近レンダリングした高解像度ページは LRU キャッシュに保持され、高速に再利用される。
 */
export async function renderHighResPageRegion(options: RenderHighResRegionOptions): Promise<void> {
  const {canvas, sourceId, pageNumber, rotation, region, baseWidth = 1400} = options;
  const seq = (canvasRenderSeq.get(canvas) ?? 0) + 1;
  canvasRenderSeq.set(canvas, seq);

  const cacheKey = `${sourceId}:${pageNumber}:${rotation}`;
  let cached = getHighResCache(cacheKey);

  if (!cached) {
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

    const scale = Math.max(1, baseWidth / Math.max(1, unscaledViewport.width));
    const viewport = page.getViewport({scale, rotation: baseRotation});

    const offWidth = Math.max(1, Math.floor(viewport.width));
    const offHeight = Math.max(1, Math.floor(viewport.height));

    const {canvas: offscreen, ctx: offscreenCtx} = createOffscreenCanvas(offWidth, offHeight);

    offscreenCtx.fillStyle = '#ffffff';
    offscreenCtx.fillRect(0, 0, offWidth, offHeight);

    await page.render({
      canvasContext: offscreenCtx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    if (canvasRenderSeq.get(canvas) !== seq) {
      return;
    }

    cached = {canvas: offscreen, width: offWidth, height: offHeight};
    putHighResCache(cacheKey, cached);
  }

  if (canvasRenderSeq.get(canvas) !== seq) {
    return;
  }

  const sx = Math.max(0, Math.min(cached.width, Math.round(cached.width * region.xPercent)));
  const sy = Math.max(0, Math.min(cached.height, Math.round(cached.height * region.yPercent)));
  const sWidth = Math.max(1, Math.min(cached.width - sx, Math.round(cached.width * region.widthPercent)));
  const sHeight = Math.max(1, Math.min(cached.height - sy, Math.round(cached.height * region.heightPercent)));

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('ターゲット Canvas 2D コンテキストを取得できませんでした。');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    cached.canvas,
    sx,
    sy,
    sWidth,
    sHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}
