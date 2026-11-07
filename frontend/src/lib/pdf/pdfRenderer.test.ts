/**
 * @fileoverview Unit test for PDF.js document loading via Wails Base64 IPC bridge
 * and in-process WorkerMessageHandler.
 */

import {describe, expect, it} from 'vitest';
import {getPDFDocument} from './pdfRenderer';

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
  it('loads a PDFDocumentProxy via Wails GetPDFBase64 and in-process pdfjsWorker', async () => {
    const base64Pdf = btoa(MINIMAL_PDF_TEXT);
    (globalThis as Record<string, unknown>)['window'] = {
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
});
