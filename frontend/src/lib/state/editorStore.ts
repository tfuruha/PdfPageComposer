/**
 * @fileoverview Immutable state management store with Undo/Redo support for PdfPageComposer.
 * Manages loaded PDF sources, ordered page items, multi-page selection, rotation, and modal preview.
 */

import {writable, derived, get} from 'svelte/store';
import type {
  PageItem,
  PageSpec,
  RotationAngle,
  SelectionMode,
  SourcePDF,
  StatusNotice,
  ThumbnailSize,
} from '../types';

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

/** Normalizes any multiple-of-90 rotation angle into 0 | 90 | 180 | 270. */
export function normalizeRotationAngle(deg: number): RotationAngle {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
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
      const createdPages: PageItem[] = [];

      for (const src of newSources) {
        updatedSources[src.id] = src;
        for (let p = 1; p <= src.pageCount; p += 1) {
          createdPages.push({
            id: createPageItemId(),
            sourceId: src.id,
            sourceName: src.fileName,
            originalPage: p,
            rotation: 0,
          });
        }
      }

      if (createdPages.length === 0) {
        return state;
      }

      addedCount = createdPages.length;
      const clampedIndex =
        insertIndex === undefined
          ? state.pages.length
          : Math.max(0, Math.min(insertIndex, state.pages.length));

      const nextPages = [
        ...state.pages.slice(0, clampedIndex),
        ...createdPages,
        ...state.pages.slice(clampedIndex),
      ];

      return {
        ...state,
        sources: updatedSources,
        pages: nextPages,
        selectedIds: createdPages.map((item) => item.id),
        lastSelectedId: createdPages[createdPages.length - 1]?.id ?? state.lastSelectedId,
        past: pushHistory(state.past, state.pages),
        future: [],
      };
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

      // Range selection ('range')
      const anchorId = state.anchorPageId ?? state.lastSelectedId ?? pageId;
      const anchorIdx = state.pages.findIndex((p) => p.id === anchorId);
      const targetIdx = state.pages.findIndex((p) => p.id === pageId);
      if (anchorIdx === -1 || targetIdx === -1) {
        return {
          ...state,
          selectedIds: [pageId],
          lastSelectedId: pageId,
          anchorPageId: pageId,
          focusPageId: pageId,
        };
      }

      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);
      const rangeIds = state.pages.slice(start, end + 1).map((p) => p.id);
      const merged = Array.from(new Set([...state.selectedIds, ...rangeIds]));

      return {
        ...state,
        selectedIds: merged,
        lastSelectedId: pageId,
        anchorPageId: anchorId,
        focusPageId: pageId,
      };
    });
  }

  function selectAll(): void {
    store.update((state) => ({
      ...state,
      selectedIds: state.pages.map((p) => p.id),
    }));
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

      const refId = state.focusPageId ?? state.lastSelectedId ?? state.selectedIds[state.selectedIds.length - 1];
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
      const anchorIdx = state.pages.findIndex((p) => p.id === anchorId);
      const safeAnchorIdx = anchorIdx === -1 ? currentIdx : anchorIdx;

      const start = Math.min(safeAnchorIdx, nextIdx);
      const end = Math.max(safeAnchorIdx, nextIdx);
      const rangeIds = state.pages.slice(start, end + 1).map((p) => p.id);

      return {
        ...state,
        selectedIds: rangeIds,
        lastSelectedId: nextTarget.id,
        anchorPageId: state.pages[safeAnchorIdx].id,
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
    const state = get(store);
    if (state.cutPageIds.length === 0) {
      return;
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

    const cutIds = [...state.cutPageIds];
    // Perform reorder
    movePages(cutIds, insertIndex);

    // Clear cut buffer and notify
    store.update((s) => ({
      ...s,
      cutPageIds: [],
      notice: {
        type: 'success',
        message: `${cutIds.length} ページを移動しました。`,
      },
    }));
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
      if (pageIdsToMove.length === 0 || state.pages.length <= 1) {
        return state;
      }
      const movingSet = new Set(pageIdsToMove);
      const movingPages = state.pages.filter((p) => movingSet.has(p.id));
      if (movingPages.length === 0) {
        return state;
      }

      // Count how many moving items were originally positioned before targetIndex
      const boundedTarget = Math.max(0, Math.min(targetIndex, state.pages.length));
      let removedBeforeTarget = 0;
      for (let i = 0; i < boundedTarget; i += 1) {
        if (movingSet.has(state.pages[i].id)) {
          removedBeforeTarget += 1;
        }
      }

      const remainingPages = state.pages.filter((p) => !movingSet.has(p.id));
      const adjustedInsertIndex = Math.max(
        0,
        Math.min(boundedTarget - removedBeforeTarget, remainingPages.length),
      );

      const nextPages = [
        ...remainingPages.slice(0, adjustedInsertIndex),
        ...movingPages,
        ...remainingPages.slice(adjustedInsertIndex),
      ];

      // Check whether the page order actually changed
      const isUnchanged = nextPages.every((p, idx) => p.id === state.pages[idx]?.id);
      if (isUnchanged) {
        return state;
      }

      return {
        ...state,
        pages: nextPages,
        selectedIds: movingPages.map((p) => p.id),
        past: pushHistory(state.past, state.pages),
        future: [],
      };
    });
  }

  /**
   * Reorders all pages in the workspace so that pages belonging to each sourceId
   * are grouped together in the specified `orderedSourceIds` order, while preserving
   * each page's internal relative order, originalPage, and rotation angle.
   */
  function reorderPagesBySourceOrder(orderedSourceIds: readonly string[]): void {
    store.update((state) => {
      if (state.pages.length <= 1 || orderedSourceIds.length <= 1) {
        return state;
      }

      // Group pages by sourceId while preserving internal order
      const groups = new Map<string, PageItem[]>();
      for (const page of state.pages) {
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

      // Append any pages from sources that were not explicitly listed
      for (const [srcId, items] of groups.entries()) {
        if (!handledSources.has(srcId)) {
          nextPages.push(...items);
        }
      }

      // Check whether the page order actually changed
      const isUnchanged =
        nextPages.length === state.pages.length &&
        nextPages.every((p, idx) => p.id === state.pages[idx]?.id);

      if (isUnchanged) {
        return state;
      }

      return {
        ...state,
        pages: nextPages,
        past: pushHistory(state.past, state.pages),
        future: [],
      };
    });
  }

  /** Rotates the specified pages (or currently selected pages if empty) by delta degrees (±90). */
  function rotatePages(pageIds: readonly string[], delta: 90 | -90): void {
    store.update((state) => {
      const targetIds = pageIds.length > 0 ? pageIds : state.selectedIds;
      if (targetIds.length === 0) {
        return state;
      }
      const targetSet = new Set(targetIds);
      let mutated = false;

      const nextPages = state.pages.map((page) => {
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
        return state;
      }

      return {
        ...state,
        pages: nextPages,
        past: pushHistory(state.past, state.pages),
        future: [],
      };
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

      const nextSelected = state.selectedIds.filter((id) => !targetSet.has(id));
      let nextPreviewId = state.previewPageId;
      if (nextPreviewId && targetSet.has(nextPreviewId)) {
        const oldIdx = state.pages.findIndex((p) => p.id === nextPreviewId);
        const fallbackPage = nextPages[Math.min(oldIdx, nextPages.length - 1)];
        nextPreviewId = fallbackPage ? fallbackPage.id : null;
      }

      return {
        ...state,
        pages: nextPages,
        selectedIds: nextSelected,
        lastSelectedId:
          state.lastSelectedId && !targetSet.has(state.lastSelectedId)
            ? state.lastSelectedId
            : null,
        previewPageId: nextPreviewId,
        past: pushHistory(state.past, state.pages),
        future: [],
      };
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
      const validIds = new Set(previousPages.map((p) => p.id));

      return {
        ...state,
        pages: previousPages,
        selectedIds: state.selectedIds.filter((id) => validIds.has(id)),
        previewPageId:
          state.previewPageId && validIds.has(state.previewPageId) ? state.previewPageId : null,
        past: nextPast,
        future: nextFuture,
      };
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
      const validIds = new Set(nextPages.map((p) => p.id));

      return {
        ...state,
        pages: nextPages,
        selectedIds: state.selectedIds.filter((id) => validIds.has(id)),
        previewPageId:
          state.previewPageId && validIds.has(state.previewPageId) ? state.previewPageId : null,
        past: nextPast,
        future: nextFuture,
      };
    });
  }

  function clearAll(): void {
    store.update((state) => {
      if (state.pages.length === 0) {
        return state;
      }
      return {
        ...state,
        pages: [],
        selectedIds: [],
        lastSelectedId: null,
        previewPageId: null,
        past: pushHistory(state.past, state.pages),
        future: [],
      };
    });
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

  /** Builds the ordered PageSpec array for exporting via the Go backend. */
  function buildExportSpecs(): PageSpec[] {
    const state = get(store);
    return state.pages.map((p) => ({
      sourceId: p.sourceId,
      pageNumber: p.originalPage,
      rotation: p.rotation,
    }));
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
    clearAll,
    openPreview,
    closePreview,
    setThumbnailSize,
    setBusy,
    setNotice,
    getSelectionInsertionIndex,
    buildExportSpecs,
    resetForTests,
  };
}

export const editorStore = createEditorStore();

export const canUndo = derived(editorStore, ($state) => $state.past.length > 0);
export const canRedo = derived(editorStore, ($state) => $state.future.length > 0);
export const hasSelection = derived(editorStore, ($state) => $state.selectedIds.length > 0);
export const hasCutPages = derived(editorStore, ($state) => $state.cutPageIds.length > 0);

export const activeSourceList = derived(editorStore, ($state) => {
  const seen = new Set<string>();
  const list: SourcePDF[] = [];
  for (const page of $state.pages) {
    if (!seen.has(page.sourceId)) {
      seen.add(page.sourceId);
      const src = $state.sources[page.sourceId];
      if (src) {
        list.push(src);
      }
    }
  }
  return list;
});

export const uniqueSourceCount = derived(activeSourceList, ($sources) => $sources.length);
