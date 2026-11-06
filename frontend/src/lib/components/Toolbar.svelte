<script lang="ts">
  import {canRedo, canUndo, editorStore, hasSelection} from '../state/editorStore';
  import type {ThumbnailSize} from '../types';

  export let onAddPDFEnd: () => void;
  export let onInsertPDFBefore: () => void;
  export let onInsertPDFAfter: () => void;
  export let onExportPDF: () => void;

  function handleSizeChange(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    editorStore.setThumbnailSize(select.value as ThumbnailSize);
  }
</script>

<header class="toolbar">
  <div class="toolbar-group brand-group">
    <span class="app-title">PDF Page Composer</span>
    <span class="page-counter" title="現在の総ページ数 / 選択中のページ数">
      全 {$editorStore.pages.length} ページ
      {#if $editorStore.selectedIds.length > 0}
        <span class="selected-badge">（{$editorStore.selectedIds.length} 選択中）</span>
      {/if}
    </span>
  </div>

  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-secondary"
      on:click={onAddPDFEnd}
      disabled={$editorStore.isBusy}
      title="PDFファイルを選択して末尾に追加します"
    >
      ＋ PDFを追加
    </button>

    <button
      type="button"
      class="btn btn-outline"
      on:click={onInsertPDFBefore}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択中のページの直前に別のPDFファイルを挿入します"
    >
      ⇤ 選択前に挿入
    </button>

    <button
      type="button"
      class="btn btn-outline"
      on:click={onInsertPDFAfter}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択中のページの直後に別のPDFファイルを挿入します"
    >
      ⇥ 選択後に挿入
    </button>
  </div>

  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-icon"
      on:click={() => editorStore.undo()}
      disabled={$editorStore.isBusy || !$canUndo}
      title="元に戻す (Ctrl+Z)"
      aria-label="元に戻す"
    >
      ↶ 戻す
    </button>
    <button
      type="button"
      class="btn btn-icon"
      on:click={() => editorStore.redo()}
      disabled={$editorStore.isBusy || !$canRedo}
      title="やり直す (Ctrl+Y)"
      aria-label="やり直す"
    >
      ↷ やり直し
    </button>
  </div>

  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-icon"
      on:click={() => editorStore.rotatePages([], -90)}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択ページを左に90度回転"
    >
      ⟲ 左90°
    </button>
    <button
      type="button"
      class="btn btn-icon"
      on:click={() => editorStore.rotatePages([], 90)}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択ページを右に90度回転"
    >
      ⟳ 右90°
    </button>
    <button
      type="button"
      class="btn btn-danger-outline"
      on:click={() => editorStore.deletePages()}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択ページを削除 (Delete)"
    >
      🗑 削除
    </button>
  </div>

  <div class="toolbar-group toolbar-right">
    <label class="size-selector">
      <span>表示:</span>
      <select value={$editorStore.thumbnailSize} on:change={handleSizeChange}>
        <option value="small">小</option>
        <option value="medium">中</option>
        <option value="large">大</option>
      </select>
    </label>

    <button
      type="button"
      class="btn btn-primary"
      on:click={onExportPDF}
      disabled={$editorStore.isBusy || $editorStore.pages.length === 0}
      title="現在のページ順・回転状態でPDFファイルを保存します"
    >
      PDFを出力
    </button>
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.65rem;
    padding: 0.65rem 1rem;
    background: var(--surface-bg);
    border-bottom: 1px solid var(--border-color);
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    z-index: 10;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding-right: 0.65rem;
    border-right: 1px solid var(--border-color);
  }

  .toolbar-group:last-child {
    border-right: none;
    padding-right: 0;
  }

  .toolbar-right {
    margin-left: auto;
  }

  .brand-group {
    gap: 0.6rem;
  }

  .app-title {
    font-weight: 700;
    font-size: 0.98rem;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  .page-counter {
    font-size: 0.82rem;
    color: var(--text-secondary);
    background: var(--subtle-bg);
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
  }

  .selected-badge {
    color: var(--accent-color);
    font-weight: 600;
  }

  .size-selector {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .size-selector select {
    padding: 0.28rem 0.45rem;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background: var(--surface-bg);
    color: var(--text-primary);
    font-size: 0.82rem;
  }
</style>
