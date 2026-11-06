<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
  import {
    exportComposedPDF,
    selectPDFsViaDialog,
    subscribeToFileDrop,
  } from './lib/backend/wailsBridge';
  import EmptyDropzone from './lib/components/EmptyDropzone.svelte';
  import PageGrid from './lib/components/PageGrid.svelte';
  import PreviewModal from './lib/components/PreviewModal.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import {editorStore} from './lib/state/editorStore';
  import type {SourcePDF} from './lib/types';

  let unsubscribeFileDrop: (() => void) | null = null;

  async function handleSelectPDFs(insertIndex?: number): Promise<void> {
    editorStore.setBusy(true);
    editorStore.setNotice(null);
    try {
      const sources = await selectPDFsViaDialog();
      if (sources.length > 0) {
        const addedCount = editorStore.addSourcePDFs(sources, insertIndex);
        editorStore.setNotice({
          type: 'info',
          message: `${sources.length} ファイル（計 ${addedCount} ページ）を追加しました。`,
        });
      }
    } catch (err: unknown) {
      editorStore.setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'PDFファイルの読み込みに失敗しました。',
      });
    } finally {
      editorStore.setBusy(false);
    }
  }

  function handleInsertBeforeSelection(): void {
    const idx = editorStore.getSelectionInsertionIndex('before');
    void handleSelectPDFs(idx);
  }

  function handleInsertAfterSelection(): void {
    const idx = editorStore.getSelectionInsertionIndex('after');
    void handleSelectPDFs(idx);
  }

  async function handleExportPDF(): Promise<void> {
    const pages = editorStore.buildExportSpecs();
    if (pages.length === 0) {
      return;
    }

    editorStore.setBusy(true);
    editorStore.setNotice(null);
    try {
      const savedPath = await exportComposedPDF({
        outputPath: '',
        pages,
      });
      if (savedPath) {
        editorStore.setNotice({
          type: 'success',
          message: `PDFを保存しました: ${savedPath}`,
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

  function handleGlobalKeyDown(event: KeyboardEvent): void {
    // Ignore shortcuts if modal is open and handling its own navigation
    const isModalOpen = $editorStore.previewPageId !== null;
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (isCtrlOrMeta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        editorStore.redo();
      } else {
        editorStore.undo();
      }
      return;
    }

    if (isCtrlOrMeta && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      editorStore.redo();
      return;
    }

    if (isCtrlOrMeta && event.key.toLowerCase() === 'a' && !isModalOpen) {
      event.preventDefault();
      editorStore.selectAll();
      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && !isModalOpen) {
      if ($editorStore.selectedIds.length > 0) {
        event.preventDefault();
        editorStore.deletePages();
      }
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);

    unsubscribeFileDrop = subscribeToFileDrop(
      (sources: SourcePDF[]) => {
        const insertIdx =
          $editorStore.selectedIds.length > 0
            ? editorStore.getSelectionInsertionIndex('after')
            : undefined;
        const addedCount = editorStore.addSourcePDFs(sources, insertIdx);
        editorStore.setNotice({
          type: 'info',
          message: `ドロップされた ${sources.length} ファイル（計 ${addedCount} ページ）を追加しました。`,
        });
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
    unsubscribeFileDrop?.();
  });
</script>

<main class="app-shell">
  <Toolbar
    onAddPDFEnd={() => handleSelectPDFs(undefined)}
    onInsertPDFBefore={handleInsertBeforeSelection}
    onInsertPDFAfter={handleInsertAfterSelection}
    onExportPDF={handleExportPDF}
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
    <EmptyDropzone onSelectFiles={() => handleSelectPDFs(undefined)} />
  {:else}
    <div class="subbar">
      <div class="subbar-left">
        <button type="button" class="btn-link" on:click={() => editorStore.selectAll()}>
          すべて選択
        </button>
        <span class="dot">·</span>
        <button
          type="button"
          class="btn-link"
          on:click={() => editorStore.clearSelection()}
          disabled={$editorStore.selectedIds.length === 0}
        >
          選択解除
        </button>
        <span class="dot">·</span>
        <button type="button" class="btn-link danger" on:click={() => editorStore.clearAll()}>
          すべてクリア
        </button>
      </div>
      <div class="subbar-hint">
        ドラッグで並び替え / カード間の「＋」でその位置へ別PDFを挿入 / ダブルクリックで拡大プレビュー
      </div>
    </div>

    <PageGrid onInsertPDFAt={(index) => handleSelectPDFs(index)} />
  {/if}

  <PreviewModal />
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
