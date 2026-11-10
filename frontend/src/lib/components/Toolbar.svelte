<script lang="ts">
  import {
    canRedo,
    canUndo,
    editorStore,
    hasCutPages,
    hasSelection,
    uniqueSourceCount,
  } from '../state/editorStore';
  import type {ThumbnailSize} from '../types';

  export let onNewProject: () => void;
  export let onInsertPDFBefore: () => void;
  export let onInsertPDFAfter: () => void;
  export let onOpenFileOrder: () => void;
  export let onExportPDF: () => void;
  export let onOpenAbout: () => void;

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
      {#if $hasCutPages}
        <span class="cut-badge" title="Ctrl+V で選択位置の後に貼り付けます">
          ✂ {$editorStore.cutPageIds.length} カット中
        </span>
      {/if}
    </span>
  </div>

  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-outline"
      on:click={onNewProject}
      disabled={$editorStore.isBusy || $editorStore.pages.length === 0}
      title="現在の編集内容をクリアして新しい作業を開始します (Ctrl+N)"
    >
      📄 新規作成
    </button>
  </div>

  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-outline"
      on:click={onInsertPDFBefore}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択中のページの直前に別のPDFファイルを挿入します"
    >
      ⇤ 前に挿入
    </button>

    <button
      type="button"
      class="btn btn-outline"
      on:click={onInsertPDFAfter}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択中のページの直後に別のPDFファイルを挿入します"
    >
      ⇥ 後に挿入
    </button>

    <button
      type="button"
      class="btn btn-outline"
      on:click={onOpenFileOrder}
      disabled={$editorStore.isBusy || $uniqueSourceCount < 2}
      title="読み込まれているファイル全体の並び替え・ソートを行います"
    >
      📁 ファイル順
    </button>
  </div>

  <div class="toolbar-group">
    <button
      type="button"
      class="btn btn-icon"
      on:click={() => editorStore.cutSelection()}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択ページを切り取り (Ctrl+X)"
      aria-label="切り取り"
    >
      ✂ 切り取り
    </button>
    <button
      type="button"
      class="btn btn-icon"
      on:click={() => editorStore.pasteCutPages()}
      disabled={$editorStore.isBusy || !$hasCutPages}
      title="カットしたページを現在の選択位置の後へ貼り付け (Ctrl+V)"
      aria-label="貼り付け"
    >
      📋 貼り付け
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
      title="選択ページを左に90度回転 (Shift+R / L)"
    >
      ⟲ 左90°
    </button>
    <button
      type="button"
      class="btn btn-icon"
      on:click={() => editorStore.rotatePages([], 90)}
      disabled={$editorStore.isBusy || !$hasSelection}
      title="選択ページを右に90度回転 (R)"
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
      🗑 削除{#if $editorStore.selectedIds.length > 0} ({$editorStore.selectedIds.length}){/if}
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

    <button
      type="button"
      class="btn btn-icon btn-about"
      on:click={onOpenAbout}
      title="アプリ情報とライセンス (About)"
      aria-label="アプリ情報とライセンス"
    >
      <svg class="about-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
          clip-rule="evenodd"
        />
      </svg>
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

  .cut-badge {
    margin-left: 0.35rem;
    color: #b45309;
    background: #fef3c7;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
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

  .btn-about {
    padding: 0.35rem 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .btn-about:hover {
    color: var(--text-primary);
  }

  .about-icon {
    width: 1.15rem;
    height: 1.15rem;
    display: block;
  }
</style>
