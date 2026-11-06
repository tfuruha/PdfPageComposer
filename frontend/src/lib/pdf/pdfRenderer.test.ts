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
});
