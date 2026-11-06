/**
 * @fileoverview Frontend data structures and domain types for PdfPageComposer.
 * Follows Google TypeScript Style Guide conventions.
 */

export type RotationAngle = 0 | 90 | 180 | 270;

export type ThumbnailSize = 'small' | 'medium' | 'large';

/** Metadata of a loaded PDF file registered in the Go backend. */
export interface SourcePDF {
  readonly id: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly pageCount: number;
}

/** Represents a single page item in the workspace grid. */
export interface PageItem {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly originalPage: number; // 1-based index in the source PDF.
  readonly rotation: RotationAngle;
}

/** Payload sent to the Go backend for composing and exporting a PDF. */
export interface PageSpec {
  readonly sourceId: string;
  readonly pageNumber: number;
  readonly rotation: number;
}

export interface ExportRequest {
  readonly outputPath: string;
  readonly pages: PageSpec[];
}

export type SelectionMode = 'single' | 'toggle' | 'range';

/** Notification banner item shown in the UI. */
export interface StatusNotice {
  readonly type: 'info' | 'success' | 'error';
  readonly message: string;
}
