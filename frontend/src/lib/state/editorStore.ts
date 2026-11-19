/**
 * @fileoverview Immutable state management store with Undo/Redo support for PdfPageComposer.
 * Manages loaded PDF sources, ordered page items, multi-page selection, rotation, and modal preview.
 */

import {writable, derived, readable, get, type Readable} from 'svelte/store';
import type {
  PageItem,
  PageSpec,
  SelectionMode,
  SourcePDF,
  StatusNotice,
  ThumbnailSize,
} from '../types';
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
  type PageReferenceState,
} from './pageOperations';

export {normalizeRotationAngle};

const MAX_HISTORY_STEPS = 50;

export interface EditorState {
  readonly sources: Readonly<Record<string, SourcePDF>>;
  readonly pages: readonly PageItem[];
  readonly selectedIds: readonly string[];
  readonly lastSelectedId: string | null;
  readonly anchorPageId: string | null;
  readonly focusPageId: string | null;
  readonly cutPageIds: readonly string[];
  readonly previewPageId: string | null;
  readonly thumbnailSize: ThumbnailSize;
  readonly isBusy: boolean;
  readonly notice: StatusNotice | null;
  readonly past: readonly (readonly PageItem[])[];
  readonly future: readonly (readonly PageItem[])[];
}

/** ワークスペース上に存在するソースPDFとその実残存ページ数。 */
export interface ActiveSourceEntry {
  readonly source: SourcePDF;
  readonly activePageCount: number;
}

interface CommitOptions {
  readonly pushHistory?: boolean;
  readonly past?: readonly (readonly PageItem[])[];
  readonly future?: readonly (readonly PageItem[])[];
}

const INITIAL_STATE: EditorState = {
  sources: {},
  pages: [],
  selectedIds: [],
  lastSelectedId: null,
  anchorPageId: null,
  focusPageId: null,
  cutPageIds: [],
  previewPageId: null,
  thumbnailSize: 'medium',
  isBusy: false,
  notice: null,
  past: [],
  future: [],
};

let pageSeqCounter = 1;

/** Generates a deterministic unique ID for each page instance. */
export function createPageItemId(): string {
  const id = `page_${Date.now()}_${pageSeqCounter}`;
  pageSeqCounter += 1;
  return id;
}

/** Records current pages in history stack before applying a page list mutation. */
function pushHistory(
  past: readonly (readonly PageItem[])[],
  currentPages: readonly PageItem[],
): readonly (readonly PageItem[])[] {
  const nextPast = [...past, currentPages];
  if (nextPast.length > MAX_HISTORY_STEPS) {
    return nextPast.slice(nextPast.length - MAX_HISTORY_STEPS);
  }
  return nextPast;
}

/**
 * ページ配列の変更を反映する共通ヘルパー。
 * すべてのページID参照の不変条件サニタイズと Undo/Redo 履歴管理を一元化する。
 */
function commitPageChange(
  state: EditorState,
  nextPages: readonly PageItem[],
  overrides: Partial<PageReferenceState> & {
    readonly sources?: Readonly<Record<string, SourcePDF>>;
    readonly notice?: StatusNotice | null;
  } = {},
  options: CommitOptions = {},
): EditorState {
  const mergedRefs: PageReferenceState = {
    selectedIds: overrides.selectedIds ?? state.selectedIds,
    lastSelectedId:
      overrides.lastSelectedId !== undefined ? overrides.lastSelectedId : state.lastSelectedId,
    anchorPageId:
      overrides.anchorPageId !== undefined ? overrides.anchorPageId : state.anchorPageId,
    focusPageId:
      overrides.focusPageId !== undefined ? overrides.focusPageId : state.focusPageId,
    cutPageIds: overrides.cutPageIds ?? state.cutPageIds,
    previewPageId:
      overrides.previewPageId !== undefined ? overrides.previewPageId : state.previewPageId,
  };

  const sanitized = sanitizePageReferences(mergedRefs, nextPages);
  const shouldPush = options.pushHistory ?? true;

  return {
    ...state,
    sources: overrides.sources ?? state.sources,
    pages: nextPages,
    ...sanitized,
    notice: overrides.notice !== undefined ? overrides.notice : state.notice,
    past: options.past ?? (shouldPush ? pushHistory(state.past, state.pages) : state.past),
    future: options.future ?? (shouldPush ? [] : state.future),
  };
}

export function createEditorStore() {
  const store = writable<EditorState>(INITIAL_STATE);

  /**
   * Expands SourcePDF metadata entries into individual PageItems and inserts them
   * at `insertIndex` (or appends to the end when omitted).
   */
  function addSourcePDFs(newSources: readonly SourcePDF[], insertIndex?: number): number {
    if (newSources.length === 0) {
      return 0;
    }

    let addedCount = 0;
    store.update((state) => {
      const updatedSources: Record<string, SourcePDF> = {...state.sources};
      for (const src of newSources) {
        updatedSources[src.id] = src;
      }

      const createdPages = expandSourcesToPages(newSources, createPageItemId);
      if (createdPages.length === 0) {
        return state;
      }

      addedCount = createdPages.length;
      const nextPages = insertPagesAt(state.pages, createdPages, insertIndex);
      const firstCreatedId = createdPages[0].id;
      const lastCreatedId = createdPages[createdPages.length - 1].id;

      return commitPageChange(state, nextPages, {
        sources: updatedSources,
        selectedIds: createdPages.map((item) => item.id),
        anchorPageId: firstCreatedId,
        lastSelectedId: lastCreatedId,
        focusPageId: lastCreatedId,
      });
    });

    return addedCount;
  }

  /** Selects or deselects pages using single, toggle (Ctrl/Cmd), or range (Shift) mode. */
  function selectPage(pageId: string, mode: SelectionMode = 'single'): void {
    store.update((state) => {
      const targetExists = state.pages.some((p) => p.id === pageId);
      if (!targetExists) {
        return state;
      }

      if (mode === 'single') {
        return {
          ...state,
          selectedIds: [pageId],
          lastSelectedId: pageId,
          anchorPageId: pageId,
          focusPageId: pageId,
        };
      }

      if (mode === 'toggle') {
        const exists = state.selectedIds.includes(pageId);
        const nextSelected = exists
          ? state.selectedIds.filter((id) => id !== pageId)
          : [...state.selectedIds, pageId];
        return {
          ...state,
          selectedIds: nextSelected,
          lastSelectedId: pageId,
          anchorPageId: pageId,
          focusPageId: pageId,
        };
      }

      // Range selection ('range'): Shift+矢印と同じくアンカー起点の置換選択（伸縮可能）
      const anchorId = state.anchorPageId ?? state.lastSelectedId ?? pageId;
      const rangeIds = computeRangeIds(state.pages, anchorId, pageId);
      if (!rangeIds) {
        return {
          ...state,
          selectedIds: [pageId],
          lastSelectedId: pageId,
          anchorPageId: pageId,
          focusPageId: pageId,
        };
      }

      return {
        ...state,
        selectedIds: rangeIds,
        lastSelectedId: pageId,
        anchorPageId: anchorId,
        focusPageId: pageId,
      };
    });
  }

  function selectAll(): void {
    store.update((state) => {
      if (state.pages.length === 0) {
        return state;
      }
      const validIds = new Set(state.pages.map((p) => p.id));
      const firstId = state.pages[0].id;
      const lastId = state.pages[state.pages.length - 1].id;

      const anchorPageId =
        state.anchorPageId && validIds.has(state.anchorPageId) ? state.anchorPageId : firstId;
      const focusPageId =
        state.focusPageId && validIds.has(state.focusPageId) ? state.focusPageId : lastId;
      const lastSelectedId =
        state.lastSelectedId && validIds.has(state.lastSelectedId) ? state.lastSelectedId : lastId;

      return {
        ...state,
        selectedIds: state.pages.map((p) => p.id),
        anchorPageId,
        focusPageId,
        lastSelectedId,
      };
    });
  }

  function clearSelection(): void {
    store.update((state) => ({
      ...state,
      selectedIds: [],
      lastSelectedId: null,
      anchorPageId: null,
      focusPageId: null,
    }));
  }

  /**
   * Moves or extends the selection to the adjacent page (-1 for previous, 1 for next)
   * following Windows File Explorer range selection semantics.
   */
  function selectAdjacentPage(direction: -1 | 1, extend = false): void {
    store.update((state) => {
      if (state.pages.length === 0) {
        return state;
      }

      if (state.selectedIds.length === 0) {
        const fallbackIdx = direction > 0 ? 0 : state.pages.length - 1;
        const target = state.pages[fallbackIdx];
        return {
          ...state,
          selectedIds: [target.id],
          lastSelectedId: target.id,
          anchorPageId: target.id,
          focusPageId: target.id,
        };
      }

      const refId =
        state.focusPageId ??
        state.lastSelectedId ??
        state.selectedIds[state.selectedIds.length - 1];
      const currentIdx = state.pages.findIndex((p) => p.id === refId);
      if (currentIdx === -1) {
        return state;
      }

      const nextIdx = Math.max(0, Math.min(state.pages.length - 1, currentIdx + direction));
      if (nextIdx === currentIdx && !extend) {
        return state;
      }

      const nextTarget = state.pages[nextIdx];

      if (!extend) {
        return {
          ...state,
          selectedIds: [nextTarget.id],
          lastSelectedId: nextTarget.id,
          anchorPageId: nextTarget.id,
          focusPageId: nextTarget.id,
        };
      }

      // Range extension (Shift + Arrow) - exact File Explorer behavior
      const anchorId = state.anchorPageId ?? refId;
      const rangeIds = computeRangeIds(state.pages, anchorId, nextTarget.id);
      if (!rangeIds) {
        return {
          ...state,
          selectedIds: [nextTarget.id],
          lastSelectedId: nextTarget.id,
          anchorPageId: nextTarget.id,
          focusPageId: nextTarget.id,
        };
      }

      return {
        ...state,
        selectedIds: rangeIds,
        lastSelectedId: nextTarget.id,
        anchorPageId: anchorId,
        focusPageId: nextTarget.id,
      };
    });
  }

  /** Marks the currently selected pages for cutting (Ctrl+X). */
  function cutSelection(): void {
    store.update((state) => {
      if (state.selectedIds.length === 0) {
        return state;
      }
      return {
        ...state,
        cutPageIds: [...state.selectedIds],
        notice: {
          type: 'info',
          message: `${state.selectedIds.length} ページをカットしました。移動先を選択して Ctrl+V で貼り付けます。`,
        },
      };
    });
  }

  /** Pastes the cut pages after the current selection or at targetIndex (Ctrl+V). */
  function pasteCutPages(customTargetIndex?: number): void {
    store.update((state) => {
      if (state.cutPageIds.length === 0) {
        return state;
      }

      let insertIndex: number;
      if (customTargetIndex !== undefined) {
        insertIndex = customTargetIndex;
      } else if (state.selectedIds.length > 0) {
        const selectedSet = new Set(state.selectedIds);
        const indices = state.pages
          .map((p, idx) => (selectedSet.has(p.id) ? idx : -1))
          .filter((idx) => idx !== -1);
        insertIndex = indices.length > 0 ? Math.max(...indices) + 1 : state.pages.length;
      } else {
        insertIndex = state.pages.length;
      }

      const {nextPages, movedIds, changed} = movePageItems(
        state.pages,
        state.cutPageIds,
        insertIndex,
      );

      if (!changed) {
        return {
          ...state,
          cutPageIds: [],
          notice: {
            type: 'info',
            message: '移動先が元の位置と同じため、カットを解除しました。',
          },
        };
      }

      const firstMovedId = movedIds[0] ?? null;
      const lastMovedId = movedIds[movedIds.length - 1] ?? null;

      return commitPageChange(state, nextPages, {
        selectedIds: movedIds,
        anchorPageId: firstMovedId,
        lastSelectedId: lastMovedId,
        focusPageId: lastMovedId,
        cutPageIds: [],
        notice: {
          type: 'success',
          message: `${movedIds.length} ページを移動しました。`,
        },
      });
    });
  }

  /** Cancels the cut state without moving pages (Escape). */
  function cancelCut(): void {
    store.update((state) => {
      if (state.cutPageIds.length === 0) {
        return state;
      }
      return {
        ...state,
        cutPageIds: [],
        notice: null,
      };
    });
  }

  /**
   * Moves the specified page IDs to `targetIndex` (0..pages.length) while preserving
   * their relative order in the document.
   */
  function movePages(pageIdsToMove: readonly string[], targetIndex: number): void {
    store.update((state) => {
      const {nextPages, movedIds, changed} = movePageItems(
        state.pages,
        pageIdsToMove,
        targetIndex,
      );
      if (!changed) {
        return state;
      }

      const firstMovedId = movedIds[0] ?? null;
      const lastMovedId = movedIds[movedIds.length - 1] ?? null;

      return commitPageChange(state, nextPages, {
        selectedIds: movedIds,
        anchorPageId: firstMovedId,
        lastSelectedId: lastMovedId,
        focusPageId: lastMovedId,
      });
    });
  }

  /**
   * Reorders all pages in the workspace so that pages belonging to each sourceId
   * are grouped together in the specified `orderedSourceIds` order, while preserving
   * each page's internal relative order, originalPage, and rotation angle.
   */
  function reorderPagesBySourceOrder(orderedSourceIds: readonly string[]): void {
    store.update((state) => {
      const {nextPages, changed} = reorderPageItemsBySource(state.pages, orderedSourceIds);
      if (!changed) {
        return state;
      }
      return commitPageChange(state, nextPages);
    });
  }

  /** Rotates the specified pages (or currently selected pages if empty) by delta degrees (±90). */
  function rotatePages(pageIds: readonly string[], delta: 90 | -90): void {
    store.update((state) => {
      const targetIds = pageIds.length > 0 ? pageIds : state.selectedIds;
      const {nextPages, changed} = rotatePageItems(state.pages, targetIds, delta);
      if (!changed) {
        return state;
      }
      return commitPageChange(state, nextPages);
    });
  }

  /** Deletes the specified pages (or currently selected pages if empty). */
  function deletePages(pageIds?: readonly string[]): void {
    store.update((state) => {
      const targetIds = pageIds && pageIds.length > 0 ? pageIds : state.selectedIds;
      if (targetIds.length === 0) {
        return state;
      }
      const targetSet = new Set(targetIds);
      const nextPages = state.pages.filter((p) => !targetSet.has(p.id));
      if (nextPages.length === state.pages.length) {
        return state;
      }

      const nextPreviewId = computeFallbackPreviewId(
        state.pages,
        nextPages,
        state.previewPageId,
        targetSet,
      );

      return commitPageChange(state, nextPages, {
        previewPageId: nextPreviewId,
      });
    });
  }

  /** Restores the previous page state from the Undo stack. */
  function undo(): void {
    store.update((state) => {
      if (state.past.length === 0) {
        return state;
      }
      const previousPages = state.past[state.past.length - 1];
      const nextPast = state.past.slice(0, state.past.length - 1);
      const nextFuture = [state.pages, ...state.future];

      return commitPageChange(state, previousPages, {}, {
        pushHistory: false,
        past: nextPast,
        future: nextFuture,
      });
    });
  }

  /** Re-applies a previously undone page state from the Redo stack. */
  function redo(): void {
    store.update((state) => {
      if (state.future.length === 0) {
        return state;
      }
      const nextPages = state.future[0];
      const nextFuture = state.future.slice(1);
      const nextPast = pushHistory(state.past, state.pages);

      return commitPageChange(state, nextPages, {}, {
        pushHistory: false,
        past: nextPast,
        future: nextFuture,
      });
    });
  }

  /**
   * Resets the entire editor state back to initial state (for starting a new project),
   * clearing sources, pages, selection, cut buffer, and Undo/Redo history,
   * while preserving the user's current thumbnailSize preference.
   */
  function resetAll(): void {
    store.update((state) => ({
      ...INITIAL_STATE,
      thumbnailSize: state.thumbnailSize,
    }));
  }

  function openPreview(pageId: string): void {
    store.update((state) => ({
      ...state,
      previewPageId: pageId,
    }));
  }

  function closePreview(): void {
    store.update((state) => ({
      ...state,
      previewPageId: null,
    }));
  }

  /** 拡大プレビュー中の表示ページを前後（-1 / 1）へ移動する。 */
  function stepPreview(direction: -1 | 1): void {
    store.update((state) => {
      if (state.previewPageId === null || state.pages.length === 0) {
        return state;
      }
      const currentIdx = state.pages.findIndex((p) => p.id === state.previewPageId);
      if (currentIdx === -1) {
        return state;
      }
      const nextIdx = currentIdx + direction;
      if (nextIdx < 0 || nextIdx >= state.pages.length) {
        return state;
      }
      return {
        ...state,
        previewPageId: state.pages[nextIdx].id,
      };
    });
  }

  function setThumbnailSize(size: ThumbnailSize): void {
    store.update((state) => ({
      ...state,
      thumbnailSize: size,
    }));
  }

  function setBusy(isBusy: boolean): void {
    store.update((state) => ({
      ...state,
      isBusy,
    }));
  }

  function setNotice(notice: StatusNotice | null): void {
    store.update((state) => ({
      ...state,
      notice,
    }));
  }

  /** Computes the insertion index right before or after the current selection. */
  function getSelectionInsertionIndex(position: 'before' | 'after'): number {
    const state = get(store);
    if (state.selectedIds.length === 0) {
      return state.pages.length;
    }
    const selectedSet = new Set(state.selectedIds);
    const indices = state.pages
      .map((p, idx) => (selectedSet.has(p.id) ? idx : -1))
      .filter((idx) => idx !== -1);

    if (indices.length === 0) {
      return state.pages.length;
    }
    if (position === 'before') {
      return Math.min(...indices);
    }
    return Math.max(...indices) + 1;
  }

  /** Converts a workspace PageItem into a backend PageSpec payload. */
  function toPageSpec(page: PageItem): PageSpec {
    return {
      sourceId: page.sourceId,
      pageNumber: page.originalPage,
      rotation: page.rotation,
    };
  }

  /** Builds the ordered PageSpec array for exporting all workspace pages via the Go backend. */
  function buildExportSpecs(): PageSpec[] {
    const state = get(store);
    return state.pages.map(toPageSpec);
  }

  /**
   * Builds the ordered PageSpec array for exporting only the currently selected pages,
   * preserving their workspace display order regardless of selection click order.
   */
  function buildSelectedExportSpecs(): PageSpec[] {
    const state = get(store);
    if (state.selectedIds.length === 0) {
      return [];
    }
    const selectedSet = new Set(state.selectedIds);
    return state.pages.filter((p) => selectedSet.has(p.id)).map(toPageSpec);
  }

  function resetForTests(): void {
    store.set(INITIAL_STATE);
  }

  return {
    subscribe: store.subscribe,
    addSourcePDFs,
    selectPage,
    selectAdjacentPage,
    selectAll,
    clearSelection,
    movePages,
    reorderPagesBySourceOrder,
    cutSelection,
    pasteCutPages,
    cancelCut,
    rotatePages,
    deletePages,
    undo,
    redo,
    resetAll,
    openPreview,
    closePreview,
    stepPreview,
    setThumbnailSize,
    setBusy,
    setNotice,
    getSelectionInsertionIndex,
    buildExportSpecs,
    buildSelectedExportSpecs,
    resetForTests,
  };
}

export const editorStore = createEditorStore();

export const canUndo = derived(editorStore, ($state) => $state.past.length > 0);
export const canRedo = derived(editorStore, ($state) => $state.future.length > 0);
export const hasSelection = derived(editorStore, ($state) => $state.selectedIds.length > 0);
export const hasCutPages = derived(editorStore, ($state) => $state.cutPageIds.length > 0);

function createActiveSourceEntriesStore(): Readable<readonly ActiveSourceEntry[]> {
  return readable<readonly ActiveSourceEntry[]>([], (set) => {
    let initialized = false;
    let prevPages: readonly PageItem[] | null = null;
    let prevSources: Readonly<Record<string, SourcePDF>> | null = null;

    const unsubscribe = editorStore.subscribe(($state) => {
      if (initialized && prevPages === $state.pages && prevSources === $state.sources) {
        return;
      }
      initialized = true;
      prevPages = $state.pages;
      prevSources = $state.sources;

      const counts = new Map<string, number>();
      const order: string[] = [];
      for (const page of $state.pages) {
        const currentCount = counts.get(page.sourceId);
        if (currentCount === undefined) {
          order.push(page.sourceId);
          counts.set(page.sourceId, 1);
        } else {
          counts.set(page.sourceId, currentCount + 1);
        }
      }

      const entries: ActiveSourceEntry[] = [];
      for (const sourceId of order) {
        const src = $state.sources[sourceId];
        if (src) {
          entries.push({
            source: src,
            activePageCount: counts.get(sourceId) ?? 0,
          });
        }
      }
      set(entries);
    });

    return () => {
      unsubscribe();
    };
  });
}

/**
 * ワークスペース内のページ出現順に従ったソースPDFと残存ページ数の一覧。
 * pages / sources の参照が変わらない状態更新（通知・選択変更等）では再発行されない。
 */
export const activeSourceEntries = createActiveSourceEntriesStore();

export const activeSourceList = derived(activeSourceEntries, ($entries) =>
  $entries.map((entry) => entry.source),
);

export const uniqueSourceCount = derived(activeSourceEntries, ($entries) => $entries.length);
