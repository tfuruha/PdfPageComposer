/**
 * @fileoverview Unit test for PDF.js document loading via Wails Base64 IPC bridge
 * and in-process WorkerMessageHandler.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  clearPDFDocumentCache,
  getPDFDocument,
  invalidatePDFSourceCache,
  renderHighResPageRegion,
  renderPageToCanvas,
} from './pdfRenderer';

// Minimal valid 1-page PDF encoded as Base64
const MINIMAL_PDF_TEXT = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
188
%%EOF
`;

describe('pdfRenderer', () => {
  afterEach(() => {
    clearPDFDocumentCache();
    vi.restoreAllMocks();
  });

  function setupMockEnvironment(getPdfBase64Mock: (sourceId: string) => Promise<string>) {
    const createdOffscreenCanvases: Array<{width: number; height: number}> = [];

    const createMockContext = () => {
      const base: Record<string, unknown> = {
        canvas: null as unknown,
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        transform: vi.fn(),
        scale: vi.fn(),
        translate: vi.fn(),
        beginPath: vi.fn(),
        clip: vi.fn(),
        getTransform: vi.fn().mockReturnValue({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
        resetTransform: vi.fn(),
        createImageData: vi.fn().mockReturnValue({data: []}),
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
      };
      return new Proxy(base, {
        get(target, prop) {
          if (prop in target) {
            return target[prop as string];
          }
          return vi.fn();
        },
      });
    };

    (globalThis as Record<string, unknown>)['window'] = {
      devicePixelRatio: 1,
      requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
      cancelAnimationFrame: (id: number) => clearTimeout(id),
      go: {
        main: {
          App: {
            GetPDFBase64: getPdfBase64Mock,
          },
        },
      },
    };

    (globalThis as Record<string, unknown>)['document'] = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          const ctx = createMockContext();
          const offscreen = {
            width: 0,
            height: 0,
            getContext: () => ctx,
          };
          (ctx as Record<string, unknown>).canvas = offscreen;
          createdOffscreenCanvases.push(offscreen);
          return offscreen;
        }
        return {};
      },
    };

    const createTargetCanvas = (width = 560, height = 400) => {
      const targetCtx = createMockContext();
      const targetCanvas = {
        width,
        height,
        style: {width: '', height: ''},
        getContext: vi.fn().mockReturnValue(targetCtx),
      } as unknown as HTMLCanvasElement;
      (targetCtx as Record<string, unknown>).canvas = targetCanvas;
      return {targetCanvas, targetCtx};
    };

    return {createdOffscreenCanvases, createTargetCanvas};
  }

  it('loads a PDFDocumentProxy via Wails GetPDFBase64 and in-process pdfjsWorker', async () => {
    const base64Pdf = btoa(MINIMAL_PDF_TEXT);
    (globalThis as Record<string, unknown>)['window'] = {
      requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
      cancelAnimationFrame: (id: number) => clearTimeout(id),
      go: {
        main: {
          App: {
            GetPDFBase64: async () => base64Pdf,
          },
        },
      },
    };

    const doc = await getPDFDocument('src_test_1');
    expect(doc.numPages).toBe(1);

    const page = await doc.getPage(1);
    const viewport = page.getViewport({scale: 1, rotation: 0});
    expect(viewport.width).toBe(595);
    expect(viewport.height).toBe(842);
  });

  it('decodes Japanese CIDFont text (90ms-RKSJ-H CMap) without falling back to ErrorFont', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const cMapDir = decodeURIComponent(
      new URL('../../../node_modules/pdfjs-dist/cmaps/', import.meta.url).pathname,
    ).replace(/^\/([A-Za-z]:)/, '$1');

    // Shift-JIS hex for "■コンタクト" is <81a183528393835e834e8367>
    const japanesePdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 6 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /90ms-RKSJ-H /DescendantFonts [5 0 R] >>
endobj
5 0 obj
<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> /FontDescriptor 7 0 R >>
endobj
6 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 72 720 Td <81a183528393835e834e8367> Tj ET
endstream
endobj
7 0 obj
<< /Type /FontDescriptor /FontName /HeiseiKakuGo-W5 /Flags 4 /FontBBox [0 -200 1000 800] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000340 00000 n 
0000000499 00000 n 
0000000593 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
760
%%EOF
`;

    const rawBytes = new TextEncoder().encode(japanesePdf);
    const doc = await pdfjsLib.getDocument({
      data: rawBytes,
      cMapUrl: cMapDir,
      cMapPacked: true,
      useSystemFonts: true,
    }).promise;

    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    const extractedText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join('');
    expect(extractedText).toBe('■コンタクト');
  });

  it('renders high-res region of a PDF page onto target canvas and utilizes caching', async () => {
    clearPDFDocumentCache();
    const base64Pdf = btoa(MINIMAL_PDF_TEXT);
    (globalThis as Record<string, unknown>)['window'] = {
      requestAnimationFrame: (cb: () => void) => setTimeout(cb, 0),
      cancelAnimationFrame: (id: number) => clearTimeout(id),
      go: {
        main: {
          App: {
            GetPDFBase64: async () => base64Pdf,
          },
        },
      },
    };

    const createMockContext = () => {
      const base: Record<string, unknown> = {
        canvas: null as unknown,
        fillStyle: '',
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        transform: vi.fn(),
        scale: vi.fn(),
        translate: vi.fn(),
        beginPath: vi.fn(),
        clip: vi.fn(),
        getTransform: vi.fn().mockReturnValue({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
        resetTransform: vi.fn(),
        createImageData: vi.fn().mockReturnValue({data: []}),
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
      };
      return new Proxy(base, {
        get(target, prop) {
          if (prop in target) {
            return target[prop as string];
          }
          return vi.fn();
        },
      });
    };

    const offscreenCtx = createMockContext();
    const offscreenCanvasObj = {
      width: 0,
      height: 0,
      getContext: () => offscreenCtx,
    };
    (offscreenCtx as Record<string, unknown>).canvas = offscreenCanvasObj;

    (globalThis as Record<string, unknown>)['document'] = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return offscreenCanvasObj;
        }
        return {};
      },
    };

    const targetCtx = createMockContext();
    const targetCanvas = {
      width: 560,
      height: 400,
      getContext: vi.fn().mockReturnValue(targetCtx),
    } as unknown as HTMLCanvasElement;
    (targetCtx as Record<string, unknown>).canvas = targetCanvas;

    // 1回目のレンダリング
    await renderHighResPageRegion({
      canvas: targetCanvas,
      sourceId: 'src_test_region',
      pageNumber: 1,
      rotation: 0,
      region: {
        xPercent: 0.60,
        yPercent: 0.00,
        widthPercent: 0.40,
        heightPercent: 0.28,
      },
      baseWidth: 1400,
    });

    expect(targetCtx.fillRect).toHaveBeenCalled();
    expect(targetCtx.drawImage).toHaveBeenCalled();

    // 呼び出しパラメータの確認 (アスペクト比を維持して切り出され、ターゲットCanvasに描画されたこと)
    const drawImageMock = targetCtx.drawImage as ReturnType<typeof vi.fn>;
    const callArgs = drawImageMock.mock.calls[0];
    expect(callArgs.length).toBe(9);
    // [image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight]
    expect(callArgs[5]).toBe(0); // dx
    expect(callArgs[6]).toBe(0); // dy
    expect(callArgs[7]).toBe(560); // dWidth
    expect(callArgs[8]).toBe(400); // dHeight

    // 2回目のレンダリング (キャッシュヒット)
    drawImageMock.mockClear();
    await renderHighResPageRegion({
      canvas: targetCanvas,
      sourceId: 'src_test_region',
      pageNumber: 1,
      rotation: 0,
      region: {
        xPercent: 0.60,
        yPercent: 0.00,
        widthPercent: 0.40,
        heightPercent: 0.28,
      },
      baseWidth: 1400,
    });
    expect(drawImageMock).toHaveBeenCalledTimes(1);
  });

  it('caches high-res regions separately by baseWidth and deduplicates concurrent in-flight renders', async () => {
    const base64Pdf = btoa(MINIMAL_PDF_TEXT);
    const {createdOffscreenCanvases, createTargetCanvas} = setupMockEnvironment(
      async () => base64Pdf,
    );
    const {targetCanvas: canvasA} = createTargetCanvas();
    const {targetCanvas: canvasB} = createTargetCanvas();
    const region = {
      xPercent: 0.60,
      yPercent: 0.00,
      widthPercent: 0.40,
      heightPercent: 0.28,
    };

    // 同一パラメータへの同時呼び出しではオフスクリーン生成・描画が1回に集約されること
    await Promise.all([
      renderHighResPageRegion({
        canvas: canvasA,
        sourceId: 'src_dedup',
        pageNumber: 1,
        rotation: 0,
        region,
        baseWidth: 1400,
      }),
      renderHighResPageRegion({
        canvas: canvasB,
        sourceId: 'src_dedup',
        pageNumber: 1,
        rotation: 0,
        region,
        baseWidth: 1400,
      }),
    ]);
    expect(createdOffscreenCanvases).toHaveLength(1);

    // baseWidth が異なる場合は別キャッシュとして新しくレンダリングされること
    await renderHighResPageRegion({
      canvas: canvasA,
      sourceId: 'src_dedup',
      pageNumber: 1,
      rotation: 0,
      region,
      baseWidth: 1800,
    });
    expect(createdOffscreenCanvases).toHaveLength(2);
  });

  it('selectively invalidates caches for a specific sourceId without touching others', async () => {
    const base64Pdf = btoa(MINIMAL_PDF_TEXT);
    const getPdfMock = vi.fn(async () => base64Pdf);
    const {createdOffscreenCanvases, createTargetCanvas} = setupMockEnvironment(getPdfMock);
    const {targetCanvas} = createTargetCanvas();
    const region = {
      xPercent: 0.60,
      yPercent: 0.00,
      widthPercent: 0.40,
      heightPercent: 0.28,
    };

    await renderHighResPageRegion({
      canvas: targetCanvas,
      sourceId: 'src_1',
      pageNumber: 1,
      rotation: 0,
      region,
      baseWidth: 1400,
    });
    await renderHighResPageRegion({
      canvas: targetCanvas,
      sourceId: 'src_10',
      pageNumber: 1,
      rotation: 0,
      region,
      baseWidth: 1400,
    });
    expect(getPdfMock).toHaveBeenCalledTimes(2);
    expect(createdOffscreenCanvases).toHaveLength(2);

    // src_1 のみ無効化（src_10 はプレフィックス一致で誤爆しないこと）
    invalidatePDFSourceCache('src_1');
    expect(createdOffscreenCanvases[0].width).toBe(0);
    expect(createdOffscreenCanvases[1].width).toBeGreaterThan(0);

    // src_10 はキャッシュヒットして GetPDFBase64 が呼ばれないこと
    await renderHighResPageRegion({
      canvas: targetCanvas,
      sourceId: 'src_10',
      pageNumber: 1,
      rotation: 0,
      region,
      baseWidth: 1400,
    });
    expect(getPdfMock).toHaveBeenCalledTimes(2);

    // src_1 は再取得・再レンダリングされること
    await renderHighResPageRegion({
      canvas: targetCanvas,
      sourceId: 'src_1',
      pageNumber: 1,
      rotation: 0,
      region,
      baseWidth: 1400,
    });
    expect(getPdfMock).toHaveBeenCalledTimes(3);
  });

  it('cancels stale renderPageToCanvas requests when rapidly invoked on the same canvas', async () => {
    const base64Pdf = btoa(MINIMAL_PDF_TEXT);
    const {createTargetCanvas} = setupMockEnvironment(async () => base64Pdf);
    const {targetCanvas, targetCtx} = createTargetCanvas(210, 280);

    const drawImageMock = targetCtx.drawImage as ReturnType<typeof vi.fn>;

    // 同一 canvas へ連続して異なる回転角でレンダリングを要求する
    await Promise.all([
      renderPageToCanvas({
        canvas: targetCanvas,
        sourceId: 'src_rapid',
        pageNumber: 1,
        rotation: 0,
        targetWidth: 210,
      }),
      renderPageToCanvas({
        canvas: targetCanvas,
        sourceId: 'src_rapid',
        pageNumber: 1,
        rotation: 90,
        targetWidth: 210,
      }),
    ]);

    // 最終リクエスト（rotation: 90 で横長サイズ）のみがターゲット canvas へ反映されること
    expect(drawImageMock).toHaveBeenCalledTimes(1);
    expect(targetCanvas.width).toBeGreaterThan(targetCanvas.height);
  });
});
