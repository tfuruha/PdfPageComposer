<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
  import {
    clearBackendSources,
    exportComposedPDF,
    selectPDFsViaDialog,
    subscribeToFileDrop,
  } from './lib/backend/wailsBridge';
  import EmptyDropzone from './lib/components/EmptyDropzone.svelte';
  import FileOrderModal from './lib/components/FileOrderModal.svelte';
  import PageGrid from './lib/components/PageGrid.svelte';
  import PreviewModal from './lib/components/PreviewModal.svelte';
  import AboutModal from './lib/components/AboutModal.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import {
    dispatchKeyboardShortcut,
    resolveActiveLayer,
  } from './lib/keyboard/shortcutController';
  import {clearPDFDocumentCache, invalidatePDFSourceCache} from './lib/pdf/pdfRenderer';
  import {
    activeSourceEntries,
    activeSourceList,
    canUndo,
    editorStore,
    hasCutPages,
  } from './lib/state/editorStore';
  import type {PageSpec, SourcePDF} from './lib/types';

  let unsubscribeFileDrop: (() => void) | null = null;
  let fileOrderModalRef: FileOrderModal | null = null;
  let isExportMenuOpen = false;
  let isFileOrderModalOpen = false;
  let isAboutModalOpen = false;
  let fileOrderModalMode: 'import' | 'reorder' = 'import';
  let pendingImportSources: SourcePDF[] = [];
  let pendingImportInsertIndex: number | undefined = undefined;

  $: pageCountBySourceId = Object.fromEntries(
    $activeSourceEntries.map((entry) => [entry.source.id, entry.activePageCount]),
  );

  function hasOpenModal(): boolean {
    return isAboutModalOpen || isFileOrderModalOpen || $editorStore.previewPageId !== null;
  }

  function deduplicateSources(sources: readonly SourcePDF[]): SourcePDF[] {
    const seen = new Set<string>();
    const unique: SourcePDF[] = [];
    for (const src of sources) {
      if (!seen.has(src.id)) {
        seen.add(src.id);
        unique.push(src);
      }
    }
    return unique;
  }

  function applyIncomingSources(
    sources: SourcePDF[],
    insertIndex: number | undefined,
    singleSuccessMessage: (addedCount: number) => string,
  ): void {
    const uniqueSources = deduplicateSources(sources);
    if (uniqueSources.length === 0) {
      return;
    }

    // 同一ソースが再登録された場合は古い PDF.js キャッシュを破棄する
    for (const src of uniqueSources) {
      if ($editorStore.sources[src.id]) {
        invalidatePDFSourceCache(src.id);
      }
    }

    if (uniqueSources.length === 1) {
      const addedCount = editorStore.addSourcePDFs(uniqueSources, insertIndex);
      editorStore.setNotice({
        type: 'info',
        message: singleSuccessMessage(addedCount),
      });
    } else {
      isExportMenuOpen = false;
      pendingImportSources = uniqueSources;
      pendingImportInsertIndex = insertIndex;
      fileOrderModalMode = 'import';
      isFileOrderModalOpen = true;
    }
  }

  async function handleSelectPDFs(insertIndex?: number): Promise<void> {
    if ($editorStore.isBusy || isFileOrderModalOpen || isAboutModalOpen) {
      return;
    }
    isExportMenuOpen = false;
    editorStore.setBusy(true);
    editorStore.setNotice(null);
    try {
      const sources = await selectPDFsViaDialog();
      applyIncomingSources(
        sources,
        insertIndex,
        (addedCount) => `1 ファイル（計 ${addedCount} ページ）を追加しました。`,
      );
    } catch (err: unknown) {
      editorStore.setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'PDFファイルの読み込みに失敗しました。',
      });
    } finally {
      editorStore.setBusy(false);
    }
  }

  function handleOpenFileOrder(): void {
    if ($editorStore.isBusy) {
      return;
    }
    isExportMenuOpen = false;
    fileOrderModalMode = 'reorder';
    isFileOrderModalOpen = true;
  }

  function handleOpenAbout(): void {
    isExportMenuOpen = false;
    isAboutModalOpen = true;
  }

  function handleFileOrderConfirm(ordered: SourcePDF[]): void {
    isFileOrderModalOpen = false;
    if (fileOrderModalMode === 'import') {
      const addedCount = editorStore.addSourcePDFs(ordered, pendingImportInsertIndex);
      editorStore.setNotice({
        type: 'info',
        message: `${ordered.length} ファイル（計 ${addedCount} ページ）を追加しました。`,
      });
      pendingImportSources = [];
      pendingImportInsertIndex = undefined;
    } else {
      editorStore.reorderPagesBySourceOrder(ordered.map((s) => s.id));
      editorStore.setNotice({
        type: 'info',
        message: 'ファイル順に従ってページを再配置しました。',
      });
    }
  }

  function handleFileOrderCancel(): void {
    isFileOrderModalOpen = false;
    pendingImportSources = [];
    pendingImportInsertIndex = undefined;
  }

  function handleInsertBeforeSelection(): void {
    const idx = editorStore.getSelectionInsertionIndex('before');
    void handleSelectPDFs(idx);
  }

  function handleInsertAfterSelection(): void {
    const idx = editorStore.getSelectionInsertionIndex('after');
    void handleSelectPDFs(idx);
  }

  async function handleNewProject(): Promise<void> {
    if ($editorStore.isBusy) {
      return;
    }
    if ($editorStore.pages.length > 0 || $canUndo) {
      const ok = window.confirm(
        '現在の編集内容をクリアして、新しい作業を開始しますか？\n（未保存の変更内容は破棄されます）',
      );
      if (!ok) {
        return;
      }
    }

    isFileOrderModalOpen = false;
    isAboutModalOpen = false;
    isExportMenuOpen = false;
    pendingImportSources = [];
    pendingImportInsertIndex = undefined;

    // resetAll() は isBusy を初期値 false へ戻すため、必ず先に実行してから setBusy(true) を設定する
    editorStore.resetAll();
    editorStore.setBusy(true);
    clearPDFDocumentCache();

    try {
      await clearBackendSources();
      editorStore.setNotice({
        type: 'info',
        message: '新しい作業を開始しました。PDFファイルをドロップまたは選択してください。',
      });
    } catch (err: unknown) {
      editorStore.setNotice({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'バックエンドのソース情報クリアに失敗しました。',
      });
    } finally {
      editorStore.setBusy(false);
    }
  }

  function handleClearAll(): void {
    void handleNewProject();
  }

  async function executeExport(
    pages: PageSpec[],
    defaultFilename: string,
    successMessage: (savedPath: string, count: number) => string,
  ): Promise<void> {
    if (pages.length === 0 || $editorStore.isBusy) {
      return;
    }

    editorStore.setBusy(true);
    editorStore.setNotice(null);
    try {
      const savedPath = await exportComposedPDF({
        outputPath: '',
        defaultFilename,
        pages,
      });
      if (savedPath) {
        editorStore.setNotice({
          type: 'success',
          message: successMessage(savedPath, pages.length),
        });
      }
    } catch (err: unknown) {
      editorStore.setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'PDFの出力に失敗しました。',
      });
    } finally {
      editorStore.setBusy(false);
    }
  }

  async function handleExportPDF(): Promise<void> {
    const pages = editorStore.buildExportSpecs();
    await executeExport(pages, 'composed.pdf', (savedPath) => `PDFを保存しました: ${savedPath}`);
  }

  async function handleExportSelectedPDF(): Promise<void> {
    const pages = editorStore.buildSelectedExportSpecs();
    await executeExport(
      pages,
      'composed_selected.pdf',
      (savedPath, count) => `選択した ${count} ページを保存しました: ${savedPath}`,
    );
  }

  function handleGlobalKeyDown(event: KeyboardEvent): void {
    const activeLayer = resolveActiveLayer({
      isExportMenuOpen,
      isAboutModalOpen,
      isFileOrderModalOpen,
      isPreviewModalOpen: $editorStore.previewPageId !== null,
    });

    dispatchKeyboardShortcut(
      event,
      {
        activeLayer,
        isBusy: $editorStore.isBusy,
        pageCount: $editorStore.pages.length,
        selectedCount: $editorStore.selectedIds.length,
        hasCutPages: $hasCutPages,
      },
      {
        closeExportMenu: () => {
          isExportMenuOpen = false;
        },
        closeAboutModal: () => {
          isAboutModalOpen = false;
        },
        cancelFileOrderModal: handleFileOrderCancel,
        confirmFileOrderModal: () => {
          fileOrderModalRef?.confirmCurrentOrder();
        },
        closePreview: () => editorStore.closePreview(),
        previewPrev: () => editorStore.stepPreview(-1),
        previewNext: () => editorStore.stepPreview(1),
        undo: () => editorStore.undo(),
        redo: () => editorStore.redo(),
        selectAll: () => editorStore.selectAll(),
        cutSelection: () => editorStore.cutSelection(),
        pasteCutPages: () => editorStore.pasteCutPages(),
        cancelCut: () => editorStore.cancelCut(),
        deletePages: () => editorStore.deletePages(),
        openPreview: () => {
          const targetId =
            $editorStore.focusPageId ??
            $editorStore.lastSelectedId ??
            $editorStore.selectedIds[0] ??
            $editorStore.pages[0]?.id;
          if (targetId) {
            editorStore.openPreview(targetId);
          }
        },
        rotateSelection: (delta) => editorStore.rotatePages([], delta),
        rotatePreviewPage: (delta) => {
          const previewId = $editorStore.previewPageId;
          if (previewId) {
            editorStore.rotatePages([previewId], delta);
          }
        },
        deletePreviewPage: () => {
          const previewId = $editorStore.previewPageId;
          if (previewId) {
            editorStore.deletePages([previewId]);
          }
        },
        selectAdjacent: (direction, extend) => editorStore.selectAdjacentPage(direction, extend),
        exportAll: () => {
          void handleExportPDF();
        },
        exportSelected: () => {
          void handleExportSelectedPDF();
        },
        newProject: () => {
          void handleNewProject();
        },
      },
    );
  }

  function isExternalFileDrag(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (!types) {
      return false;
    }
    return Array.from(types).some((t) => t === 'Files' || t === 'text/uri-list');
  }

  function handleGlobalDragOver(event: DragEvent): void {
    event.preventDefault();
    if (isExternalFileDrag(event) && event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleGlobalDrop(event: DragEvent): void {
    event.preventDefault();
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);

    unsubscribeFileDrop = subscribeToFileDrop(
      (sources: SourcePDF[]) => {
        if ($editorStore.isBusy || hasOpenModal()) {
          editorStore.setNotice({
            type: 'info',
            message: '現在の処理やダイアログを閉じてからPDFファイルをドロップしてください。',
          });
          return;
        }
        const insertIdx =
          $editorStore.selectedIds.length > 0
            ? editorStore.getSelectionInsertionIndex('after')
            : undefined;

        applyIncomingSources(
          sources,
          insertIdx,
          (addedCount) => `ドロップされた 1 ファイル（計 ${addedCount} ページ）を追加しました。`,
        );
      },
      (errMessage: string) => {
        editorStore.setNotice({
          type: 'error',
          message: `ドロップされたファイルの読み込みに失敗しました: ${errMessage}`,
        });
      },
    );
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
    window.removeEventListener('dragover', handleGlobalDragOver);
    window.removeEventListener('drop', handleGlobalDrop);
    unsubscribeFileDrop?.();
  });
</script>

<main class="app-shell">
  <Toolbar
    bind:isExportMenuOpen
    onNewProject={handleNewProject}
    onInsertPDFBefore={handleInsertBeforeSelection}
    onInsertPDFAfter={handleInsertAfterSelection}
    onOpenFileOrder={handleOpenFileOrder}
    onExportPDF={handleExportPDF}
    onExportSelectedPDF={handleExportSelectedPDF}
    onOpenAbout={handleOpenAbout}
  />

  {#if $editorStore.notice}
    <div class={`notice-banner notice-${$editorStore.notice.type}`} role="status">
      <span>{$editorStore.notice.message}</span>
      <button
        type="button"
        class="notice-close"
        on:click={() => editorStore.setNotice(null)}
        aria-label="通知を閉じる"
      >
        ✕
      </button>
    </div>
  {/if}

  {#if $editorStore.pages.length === 0}
    <EmptyDropzone onSelectFiles={() => handleSelectPDFs(undefined)} disabled={$editorStore.isBusy} />
  {:else}
    <div class="subbar">
      <div class="subbar-left">
        <button
          type="button"
          class="btn-link"
          on:click={() => editorStore.selectAll()}
          disabled={$editorStore.isBusy}
        >
          すべて選択
        </button>
        <span class="dot">·</span>
        <button
          type="button"
          class="btn-link"
          on:click={() => editorStore.clearSelection()}
          disabled={$editorStore.isBusy || $editorStore.selectedIds.length === 0}
        >
          選択解除
        </button>
        <span class="dot">·</span>
        <button
          type="button"
          class="btn-link danger"
          on:click={handleClearAll}
          disabled={$editorStore.isBusy}
        >
          すべてクリア
        </button>
      </div>
      <div class="subbar-hint">
        ドラッグで並び替え / [Ctrl+N]新規作成 / [Ctrl+S]出力 / [Ctrl+X]切取・[Ctrl+V]貼付 / [Space]拡大 / [R][Shift+R]回転 / [Shift+矢印]範囲選択 / [Del]削除
      </div>
    </div>

    <PageGrid onInsertPDFAt={(index) => handleSelectPDFs(index)} />
  {/if}

  <PreviewModal />

  <FileOrderModal
    bind:this={fileOrderModalRef}
    isOpen={isFileOrderModalOpen}
    mode={fileOrderModalMode}
    initialSources={fileOrderModalMode === 'import' ? pendingImportSources : $activeSourceList}
    {pageCountBySourceId}
    onConfirm={handleFileOrderConfirm}
    onCancel={handleFileOrderCancel}
  />

  <AboutModal
    isOpen={isAboutModalOpen}
    onClose={() => (isAboutModalOpen = false)}
  />
</main>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--app-bg);
    color: var(--text-primary);
  }

  .notice-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    font-size: 0.84rem;
    border-bottom: 1px solid var(--border-color);
  }

  .notice-info {
    background: #eff6ff;
    color: #1e40af;
  }

  .notice-success {
    background: #f0fdf4;
    color: #166534;
  }

  .notice-error {
    background: #fef2f2;
    color: #991b1b;
  }

  .notice-close {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.1rem 0.4rem;
  }

  .subbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 1.25rem;
    background: var(--subtle-bg);
    border-bottom: 1px solid var(--border-color);
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .subbar-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .btn-link {
    border: none;
    background: none;
    padding: 0;
    font-size: 0.78rem;
    color: var(--accent-color);
    cursor: pointer;
  }

  .btn-link:disabled {
    color: var(--text-secondary);
    opacity: 0.5;
    cursor: default;
  }

  .btn-link.danger {
    color: var(--danger-color);
  }

  .btn-link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .dot {
    color: var(--border-strong);
  }
</style>
