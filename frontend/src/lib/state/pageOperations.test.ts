/**
 * @fileoverview Unit tests for pure page array operations and reference sanitizers.
 */

import {describe, expect, it} from 'vitest';
import type {PageItem, SourcePDF} from '../types';
import {
  computeFallbackPreviewId,
  computeRangeIds,
  expandSourcesToPages,
  insertPagesAt,
  movePageItems,
  normalizeRotationAngle,
  reorderPageItemsBySource,
  rotatePageItems,
  sanitizePageReferences,
} from './pageOperations';

function makePage(id: string, sourceId = 'src_1', originalPage = 1, rotation: 0 | 90 | 180 | 270 = 0): PageItem {
  return {
    id,
    sourceId,
    sourceName: `${sourceId}.pdf`,
    originalPage,
    rotation,
  };
}

describe('pageOperations', () => {
  it('normalizes positive and negative angles into 0 | 90 | 180 | 270', () => {
    expect(normalizeRotationAngle(0)).toBe(0);
    expect(normalizeRotationAngle(90)).toBe(90);
    expect(normalizeRotationAngle(360)).toBe(0);
    expect(normalizeRotationAngle(-90)).toBe(270);
    expect(normalizeRotationAngle(-180)).toBe(180);
    expect(normalizeRotationAngle(45)).toBe(0);
  });

  it('expands SourcePDF entries and inserts them at clamped positions', () => {
    const srcA: SourcePDF = {id: 'src_1', filePath: '/a.pdf', fileName: 'a.pdf', pageCount: 2};
    const srcB: SourcePDF = {id: 'src_2', filePath: '/b.pdf', fileName: 'b.pdf', pageCount: 1};
    let seq = 1;
    const pagesA = expandSourcesToPages([srcA], () => `p_${seq++}`);
    const pagesB = expandSourcesToPages([srcB], () => `p_${seq++}`);

    expect(pagesA.map((p) => p.id)).toEqual(['p_1', 'p_2']);
    expect(insertPagesAt(pagesA, pagesB, 1).map((p) => p.id)).toEqual(['p_1', 'p_3', 'p_2']);
    expect(insertPagesAt(pagesA, pagesB, 999).map((p) => p.id)).toEqual(['p_1', 'p_2', 'p_3']);
    expect(insertPagesAt(pagesA, pagesB, -5).map((p) => p.id)).toEqual(['p_3', 'p_1', 'p_2']);
  });

  it('moves page items forward/backward and detects no-op moves', () => {
    const pages = [makePage('p1'), makePage('p2'), makePage('p3'), makePage('p4')];

    const noOp = movePageItems(pages, ['p2'], 1);
    expect(noOp.changed).toBe(false);

    const moved = movePageItems(pages, ['p1', 'p3'], 4);
    expect(moved.changed).toBe(true);
    expect(moved.movedIds).toEqual(['p1', 'p3']);
    expect(moved.nextPages.map((p) => p.id)).toEqual(['p2', 'p4', 'p1', 'p3']);
  });

  it('reorders pages by source order and preserves unlisted trailing sources', () => {
    const pages = [
      makePage('a1', 'src_a', 1, 90),
      makePage('b1', 'src_b', 1, 0),
      makePage('c1', 'src_c', 1, 180),
      makePage('a2', 'src_a', 2, 0),
    ];

    const reordered = reorderPageItemsBySource(pages, ['src_b', 'src_a']);
    expect(reordered.changed).toBe(true);
    expect(reordered.nextPages.map((p) => p.id)).toEqual(['b1', 'a1', 'a2', 'c1']);
    expect(reordered.nextPages[1].rotation).toBe(90);

    const unchanged = reorderPageItemsBySource(reordered.nextPages, ['src_b', 'src_a', 'src_c']);
    expect(unchanged.changed).toBe(false);
  });

  it('rotates target pages and ignores unknown IDs', () => {
    const pages = [makePage('p1', 'src_1', 1, 0), makePage('p2', 'src_1', 2, 270)];

    const untouched = rotatePageItems(pages, ['missing'], 90);
    expect(untouched.changed).toBe(false);

    const rotated = rotatePageItems(pages, ['p2'], 90);
    expect(rotated.changed).toBe(true);
    expect(rotated.nextPages[1].rotation).toBe(0);
  });

  it('computes bidirectional range IDs between anchor and target', () => {
    const pages = [makePage('p1'), makePage('p2'), makePage('p3'), makePage('p4')];
    expect(computeRangeIds(pages, 'p2', 'p4')).toEqual(['p2', 'p3', 'p4']);
    expect(computeRangeIds(pages, 'p4', 'p2')).toEqual(['p2', 'p3', 'p4']);
    expect(computeRangeIds(pages, 'missing', 'p2')).toBeNull();
  });

  it('sanitizes stale page references and computes fallback preview ID', () => {
    const oldPages = [makePage('p1'), makePage('p2'), makePage('p3')];
    const nextPages = [makePage('p1'), makePage('p3')];

    const sanitized = sanitizePageReferences(
      {
        selectedIds: ['p1', 'p2'],
        lastSelectedId: 'p2',
        anchorPageId: 'p2',
        focusPageId: 'p3',
        cutPageIds: ['p2', 'p3'],
        previewPageId: 'p2',
      },
      nextPages,
    );

    expect(sanitized).toEqual({
      selectedIds: ['p1'],
      lastSelectedId: null,
      anchorPageId: null,
      focusPageId: 'p3',
      cutPageIds: ['p3'],
      previewPageId: null,
    });

    const deletedSet = new Set(['p2']);
    expect(computeFallbackPreviewId(oldPages, nextPages, 'p2', deletedSet)).toBe('p3');
    expect(computeFallbackPreviewId(oldPages, [], 'p2', new Set(['p1', 'p2', 'p3']))).toBeNull();
  });
});
