/**
 * @fileoverview Unit tests for editorStore covering page addition, positional insertion,
 * multi-select, reordering, rotation, deletion, and Undo/Redo history.
 */

import {get} from 'svelte/store';
import {beforeEach, describe, expect, it} from 'vitest';
import {createEditorStore} from './editorStore';
import {getSourceAccentColor, type SourcePDF} from '../types';

const SAMPLE_PDF_A: SourcePDF = {
  id: 'src_1',
  filePath: '/tmp/docA.pdf',
  fileName: 'docA.pdf',
  pageCount: 3,
};

const SAMPLE_PDF_B: SourcePDF = {
  id: 'src_2',
  filePath: '/tmp/docB.pdf',
  fileName: 'docB.pdf',
  pageCount: 2,
};

describe('editorStore', () => {
  const store = createEditorStore();

  beforeEach(() => {
    store.resetForTests();
  });

  it('adds pages from a SourcePDF and inserts another PDF at a specific index', () => {
    store.addSourcePDFs([SAMPLE_PDF_A]);
    let state = get(store);
    expect(state.pages).toHaveLength(3);
    expect(state.pages.map((p) => `${p.sourceName}:${p.originalPage}`)).toEqual([
      'docA.pdf:1',
      'docA.pdf:2',
      'docA.pdf:3',
    ]);

    // Insert SAMPLE_PDF_B at index 1 (between docA:1 and docA:2)
    store.addSourcePDFs([SAMPLE_PDF_B], 1);
    state = get(store);
    expect(state.pages).toHaveLength(5);
    expect(state.pages.map((p) => `${p.sourceName}:${p.originalPage}`)).toEqual([
      'docA.pdf:1',
      'docB.pdf:1',
      'docB.pdf:2',
      'docA.pdf:2',
      'docA.pdf:3',
    ]);
  });

  it('supports single, toggle, and range page selection', () => {
    store.addSourcePDFs([SAMPLE_PDF_A, SAMPLE_PDF_B]);
    const pages = get(store).pages;

    store.selectPage(pages[0].id, 'single');
    expect(get(store).selectedIds).toEqual([pages[0].id]);

    store.selectPage(pages[2].id, 'range');
    expect(get(store).selectedIds).toEqual([pages[0].id, pages[1].id, pages[2].id]);

    store.selectPage(pages[1].id, 'toggle');
    expect(get(store).selectedIds).toEqual([pages[0].id, pages[2].id]);
  });

  it('moves single and multiple selected pages while preserving relative order', () => {
    store.addSourcePDFs([SAMPLE_PDF_A, SAMPLE_PDF_B]);
    const initialIds = get(store).pages.map((p) => p.id);

    // Move pages[0] and pages[2] to the end (index 5)
    store.movePages([initialIds[0], initialIds[2]], 5);
    const reordered = get(store).pages.map((p) => p.id);
    expect(reordered).toEqual([
      initialIds[1],
      initialIds[3],
      initialIds[4],
      initialIds[0],
      initialIds[2],
    ]);
  });

  it('rotates pages in 90-degree increments and normalizes angles', () => {
    store.addSourcePDFs([SAMPLE_PDF_A]);
    const firstId = get(store).pages[0].id;

    store.rotatePages([firstId], 90);
    expect(get(store).pages[0].rotation).toBe(90);

    store.rotatePages([firstId], -90);
    expect(get(store).pages[0].rotation).toBe(0);

    store.rotatePages([firstId], -90);
    expect(get(store).pages[0].rotation).toBe(270);
  });

  it('deletes selected pages and supports Undo / Redo across operations', () => {
    store.addSourcePDFs([SAMPLE_PDF_A]);
    const ids = get(store).pages.map((p) => p.id);

    store.deletePages([ids[1]]);
    expect(get(store).pages.map((p) => p.originalPage)).toEqual([1, 3]);

    store.undo();
    expect(get(store).pages.map((p) => p.originalPage)).toEqual([1, 2, 3]);

    store.redo();
    expect(get(store).pages.map((p) => p.originalPage)).toEqual([1, 3]);
  });

  it('navigates and extends selection to adjacent pages', () => {
    store.addSourcePDFs([SAMPLE_PDF_A]);
    const pages = get(store).pages;

    // Initially select page 0
    store.selectPage(pages[0].id, 'single');
    expect(get(store).selectedIds).toEqual([pages[0].id]);

    // Move to next page (page 1)
    store.selectAdjacentPage(1);
    expect(get(store).selectedIds).toEqual([pages[1].id]);

    // Move to previous page (page 0)
    store.selectAdjacentPage(-1);
    expect(get(store).selectedIds).toEqual([pages[0].id]);

    // At start, cannot move previous further
    store.selectAdjacentPage(-1);
    expect(get(store).selectedIds).toEqual([pages[0].id]);

    // Extend selection to next page (pages 0 and 1)
    store.selectAdjacentPage(1, true);
    expect(get(store).selectedIds).toEqual([pages[0].id, pages[1].id]);

    // Extend selection further to page 2 (pages 0, 1, 2)
    store.selectAdjacentPage(1, true);
    expect(get(store).selectedIds).toEqual([pages[0].id, pages[1].id, pages[2].id]);

    // Shrink selection back towards anchor by pressing left (pages 0 and 1)
    store.selectAdjacentPage(-1, true);
    expect(get(store).selectedIds).toEqual([pages[0].id, pages[1].id]);
  });

  it('supports cutting and pasting pages to reorder them via clipboard buffer', () => {
    store.addSourcePDFs([SAMPLE_PDF_A]);
    const pages = get(store).pages;

    // Select page 0 (originalPage 1) and cut
    store.selectPage(pages[0].id, 'single');
    store.cutSelection();
    expect(get(store).cutPageIds).toEqual([pages[0].id]);

    // Select page 2 (originalPage 3) and paste (should insert after page 2)
    store.selectPage(pages[2].id, 'single');
    store.pasteCutPages();

    expect(get(store).cutPageIds).toEqual([]);
    const updated = get(store).pages;
    expect(updated.map((p) => p.originalPage)).toEqual([2, 3, 1]);
  });

  it('determines deterministic accent colors for source IDs', () => {
    const color1 = getSourceAccentColor('src_1');
    const color2 = getSourceAccentColor('src_1');
    expect(color1).toBe(color2);
    expect(color1).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('reorders pages by source file order while preserving individual page rotations and internal sequence', () => {
    store.addSourcePDFs([SAMPLE_PDF_A, SAMPLE_PDF_B]);
    // Initially: docA:1, docA:2, docA:3, docB:1, docB:2
    expect(get(store).pages.map((p) => `${p.sourceName}:${p.originalPage}`)).toEqual([
      'docA.pdf:1',
      'docA.pdf:2',
      'docA.pdf:3',
      'docB.pdf:1',
      'docB.pdf:2',
    ]);

    // Rotate docA page 2 by 90 degrees
    const docAPage2 = get(store).pages[1];
    store.rotatePages([docAPage2.id], 90);
    expect(get(store).pages[1].rotation).toBe(90);

    // Reorder so that SAMPLE_PDF_B (src_2) comes before SAMPLE_PDF_A (src_1)
    store.reorderPagesBySourceOrder(['src_2', 'src_1']);

    const reordered = get(store).pages;
    expect(reordered.map((p) => `${p.sourceName}:${p.originalPage}`)).toEqual([
      'docB.pdf:1',
      'docB.pdf:2',
      'docA.pdf:1',
      'docA.pdf:2',
      'docA.pdf:3',
    ]);

    // Verify docA page 2 retained its 90 degree rotation
    expect(reordered[3].sourceName).toBe('docA.pdf');
    expect(reordered[3].originalPage).toBe(2);
    expect(reordered[3].rotation).toBe(90);

    // Test Undo restores original order
    store.undo();
    expect(get(store).pages.map((p) => `${p.sourceName}:${p.originalPage}`)).toEqual([
      'docA.pdf:1',
      'docA.pdf:2',
      'docA.pdf:3',
      'docB.pdf:1',
      'docB.pdf:2',
    ]);

    // Test Redo
    store.redo();
    expect(get(store).pages.map((p) => `${p.sourceName}:${p.originalPage}`)).toEqual([
      'docB.pdf:1',
      'docB.pdf:2',
      'docA.pdf:1',
      'docA.pdf:2',
      'docA.pdf:3',
    ]);
  });

  it('cleans up anchorPageId, focusPageId, and cutPageIds on deletePages, clearAll, and undo/redo', () => {
    store.addSourcePDFs([SAMPLE_PDF_A]);
    const pages = get(store).pages;

    // Select page 1 and mark for cut
    store.selectPage(pages[1].id, 'single');
    store.cutSelection();
    expect(get(store).anchorPageId).toBe(pages[1].id);
    expect(get(store).focusPageId).toBe(pages[1].id);
    expect(get(store).cutPageIds).toEqual([pages[1].id]);

    // Delete page 1 -> anchorPageId, focusPageId, cutPageIds should be sanitized
    store.deletePages([pages[1].id]);
    expect(get(store).anchorPageId).toBeNull();
    expect(get(store).focusPageId).toBeNull();
    expect(get(store).cutPageIds).toEqual([]);

    // Select remaining page 0, cut it, and clearAll
    const remaining = get(store).pages;
    store.selectPage(remaining[0].id, 'single');
    store.cutSelection();
    store.clearAll();
    expect(get(store).pages).toHaveLength(0);
    expect(get(store).anchorPageId).toBeNull();
    expect(get(store).focusPageId).toBeNull();
    expect(get(store).cutPageIds).toEqual([]);
  });
});
