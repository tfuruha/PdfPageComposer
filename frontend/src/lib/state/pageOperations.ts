/**
 * @fileoverview ページ配列操作および参照整合性検証のための純粋関数群。
 * editorStore からデータ変換ロジックを分離し、イミュータビリティと単体テスト容易性を確保する。
 */

import type {PageItem, RotationAngle, SourcePDF} from '../types';

/** ページIDへの各種UI参照状態をまとめた型。 */
export interface PageReferenceState {
  readonly selectedIds: readonly string[];
  readonly lastSelectedId: string | null;
  readonly anchorPageId: string | null;
  readonly focusPageId: string | null;
  readonly cutPageIds: readonly string[];
  readonly previewPageId: string | null;
}

/** ページ移動操作の結果。 */
export interface MovePagesResult {
  readonly nextPages: PageItem[];
  readonly movedIds: string[];
  readonly changed: boolean;
}

/** ページ配列更新操作の結果。 */
export interface UpdatePagesResult {
  readonly nextPages: PageItem[];
  readonly changed: boolean;
}

/** 任意の90度単位の角度を 0 | 90 | 180 | 270 に正規化する。 */
export function normalizeRotationAngle(deg: number): RotationAngle {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

/** SourcePDF メタデータの配列から、ページ単位の PageItem 配列を生成する。 */
export function expandSourcesToPages(
  sources: readonly SourcePDF[],
  createId: () => string,
): PageItem[] {
  const createdPages: PageItem[] = [];
  for (const src of sources) {
    for (let p = 1; p <= src.pageCount; p += 1) {
      createdPages.push({
        id: createId(),
        sourceId: src.id,
        sourceName: src.fileName,
        originalPage: p,
        rotation: 0,
      });
    }
  }
  return createdPages;
}

/** 指定された挿入位置（省略時は末尾）に新しいページ群を挿入した新しい配列を返す。 */
export function insertPagesAt(
  pages: readonly PageItem[],
  createdPages: readonly PageItem[],
  insertIndex?: number,
): PageItem[] {
  const clampedIndex =
    insertIndex === undefined
      ? pages.length
      : Math.max(0, Math.min(insertIndex, pages.length));

  return [
    ...pages.slice(0, clampedIndex),
    ...createdPages,
    ...pages.slice(clampedIndex),
  ];
}

/**
 * 指定されたページID群を相対順序を保ったまま targetIndex (0..pages.length) へ移動する。
 * 実際に順序が変化した場合のみ changed: true を返す。
 */
export function movePageItems(
  pages: readonly PageItem[],
  pageIdsToMove: readonly string[],
  targetIndex: number,
): MovePagesResult {
  if (pageIdsToMove.length === 0 || pages.length <= 1) {
    return {nextPages: [...pages], movedIds: [], changed: false};
  }

  const movingSet = new Set(pageIdsToMove);
  const movingPages = pages.filter((p) => movingSet.has(p.id));
  if (movingPages.length === 0) {
    return {nextPages: [...pages], movedIds: [], changed: false};
  }

  // targetIndex より前方にあった移動対象ページ数を差し引いて挿入位置を補正する
  const boundedTarget = Math.max(0, Math.min(targetIndex, pages.length));
  let removedBeforeTarget = 0;
  for (let i = 0; i < boundedTarget; i += 1) {
    if (movingSet.has(pages[i].id)) {
      removedBeforeTarget += 1;
    }
  }

  const remainingPages = pages.filter((p) => !movingSet.has(p.id));
  const adjustedInsertIndex = Math.max(
    0,
    Math.min(boundedTarget - removedBeforeTarget, remainingPages.length),
  );

  const nextPages = [
    ...remainingPages.slice(0, adjustedInsertIndex),
    ...movingPages,
    ...remainingPages.slice(adjustedInsertIndex),
  ];

  const isUnchanged = nextPages.every((p, idx) => p.id === pages[idx]?.id);
  if (isUnchanged) {
    return {nextPages: [...pages], movedIds: [], changed: false};
  }

  return {
    nextPages,
    movedIds: movingPages.map((p) => p.id),
    changed: true,
  };
}

/**
 * ファイルIDの並び順配列に従ってページ群をファイル単位で再配置する。
 * 各ファイル内部のページ順・回転角は維持される。
 */
export function reorderPageItemsBySource(
  pages: readonly PageItem[],
  orderedSourceIds: readonly string[],
): UpdatePagesResult {
  if (pages.length <= 1 || orderedSourceIds.length <= 1) {
    return {nextPages: [...pages], changed: false};
  }

  const groups = new Map<string, PageItem[]>();
  for (const page of pages) {
    const list = groups.get(page.sourceId);
    if (list) {
      list.push(page);
    } else {
      groups.set(page.sourceId, [page]);
    }
  }

  const nextPages: PageItem[] = [];
  const handledSources = new Set<string>();

  for (const srcId of orderedSourceIds) {
    const items = groups.get(srcId);
    if (items) {
      nextPages.push(...items);
      handledSources.add(srcId);
    }
  }

  // 明示的に指定されなかったソースのページも末尾に保持する
  for (const [srcId, items] of groups.entries()) {
    if (!handledSources.has(srcId)) {
      nextPages.push(...items);
    }
  }

  const isUnchanged =
    nextPages.length === pages.length &&
    nextPages.every((p, idx) => p.id === pages[idx]?.id);

  if (isUnchanged) {
    return {nextPages: [...pages], changed: false};
  }

  return {nextPages, changed: true};
}

/** 指定されたページID群を delta (±90度) 回転させた新しいページ配列を返す。 */
export function rotatePageItems(
  pages: readonly PageItem[],
  targetIds: readonly string[],
  delta: 90 | -90,
): UpdatePagesResult {
  if (targetIds.length === 0) {
    return {nextPages: [...pages], changed: false};
  }

  const targetSet = new Set(targetIds);
  let mutated = false;

  const nextPages = pages.map((page) => {
    if (!targetSet.has(page.id)) {
      return page;
    }
    mutated = true;
    return {
      ...page,
      rotation: normalizeRotationAngle(page.rotation + delta),
    };
  });

  if (!mutated) {
    return {nextPages: [...pages], changed: false};
  }

  return {nextPages, changed: true};
}

/** anchorId から targetId までの連続範囲に含まれるページID配列を返す。 */
export function computeRangeIds(
  pages: readonly PageItem[],
  anchorId: string,
  targetId: string,
): string[] | null {
  const anchorIdx = pages.findIndex((p) => p.id === anchorId);
  const targetIdx = pages.findIndex((p) => p.id === targetId);
  if (anchorIdx === -1 || targetIdx === -1) {
    return null;
  }

  const start = Math.min(anchorIdx, targetIdx);
  const end = Math.max(anchorIdx, targetIdx);
  return pages.slice(start, end + 1).map((p) => p.id);
}

function sanitizePageRef(id: string | null, validIds: ReadonlySet<string>): string | null {
  return id !== null && validIds.has(id) ? id : null;
}

/** 現在のページ配列に存在しない無効なページID参照をすべて除去する。 */
export function sanitizePageReferences(
  refs: PageReferenceState,
  nextPages: readonly PageItem[],
): PageReferenceState {
  const validIds = new Set(nextPages.map((p) => p.id));
  return {
    selectedIds: refs.selectedIds.filter((id) => validIds.has(id)),
    lastSelectedId: sanitizePageRef(refs.lastSelectedId, validIds),
    anchorPageId: sanitizePageRef(refs.anchorPageId, validIds),
    focusPageId: sanitizePageRef(refs.focusPageId, validIds),
    cutPageIds: refs.cutPageIds.filter((id) => validIds.has(id)),
    previewPageId: sanitizePageRef(refs.previewPageId, validIds),
  };
}

/** 削除後に拡大プレビュー中のページが存在しなくなった場合、近傍の代替ページIDを算出する。 */
export function computeFallbackPreviewId(
  oldPages: readonly PageItem[],
  nextPages: readonly PageItem[],
  currentPreviewId: string | null,
  deletedSet: ReadonlySet<string>,
): string | null {
  if (currentPreviewId === null) {
    return null;
  }
  if (!deletedSet.has(currentPreviewId)) {
    return nextPages.some((p) => p.id === currentPreviewId) ? currentPreviewId : null;
  }
  if (nextPages.length === 0) {
    return null;
  }
  const oldIdx = oldPages.findIndex((p) => p.id === currentPreviewId);
  if (oldIdx === -1) {
    return null;
  }
  const fallbackPage = nextPages[Math.min(oldIdx, nextPages.length - 1)];
  return fallbackPage ? fallbackPage.id : null;
}
