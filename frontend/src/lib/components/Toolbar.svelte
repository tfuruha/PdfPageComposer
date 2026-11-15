<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
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
  export let onExportSelectedPDF: () => void;
  export let onOpenAbout: () => void;

  let isExportMenuOpen = false;
  let exportMenuWrapper: HTMLElement | null = null;

  $: if ($editorStore.isBusy || $editorStore.pages.length === 0) {
    isExportMenuOpen = false;
  }

  function handleSizeChange(event: Event): void {
    const select = event.currentTarget as HTMLSelectElement;
    editorStore.setThumbnailSize(select.value as ThumbnailSize);
  }

  function handleMainExportClick(): void {
    isExportMenuOpen = false;
    onExportPDF();
  }

  function toggleExportMenu(): void {
    isExportMenuOpen = !isExportMenuOpen;
  }

  function handleExportSelectedClick(): void {
    if (!$hasSelection || $editorStore.isBusy) {
      return;
    }
    isExportMenuOpen = false;
    onExportSelectedPDF();
  }

  function handleWindowPointerDown(event: PointerEvent): void {
    if (!isExportMenuOpen || !exportMenuWrapper) {
      return;
    }
    if (!exportMenuWrapper.contains(event.target as Node)) {
      isExportMenuOpen = false;
    }
  }

  function handleWindowKeyDown(event: KeyboardEvent): void {
    if (isExportMenuOpen && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      isExportMenuOpen = false;
    }
  }

  onMount(() => {
    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('keydown', handleWindowKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('pointerdown', handleWindowPointerDown);
    window.removeEventListener('keydown', handleWindowKeyDown);
  });
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

    <div class="split-btn-wrapper" bind:this={exportMenuWrapper}>
      <div class="split-btn" role="group" aria-label="PDF出力操作">
        <button
          type="button"
          class="btn btn-primary split-btn-main"
          on:click={handleMainExportClick}
          disabled={$editorStore.isBusy || $editorStore.pages.length === 0}
          title="全ページを現在の並び順・回転状態でPDF保存します (Ctrl+S)"
        >
          PDFを出力
        </button>
        <button
          type="button"
          class="btn btn-primary split-btn-toggle"
          on:click={toggleExportMenu}
          disabled={$editorStore.isBusy || $editorStore.pages.length === 0}
          aria-haspopup="menu"
          aria-expanded={isExportMenuOpen}
          aria-label="出力オプションを開く"
          title="出力オプション（選択中のページを出力）"
        >
          <svg class="caret-icon" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M2.5 4.25L6 7.75L9.5 4.25H2.5Z" />
          </svg>
        </button>
      </div>

      {#if isExportMenuOpen}
        <div class="export-menu" role="menu" aria-label="PDF出力メニュー">
          <button
            type="button"
            class="export-menu-item"
            role="menuitem"
            disabled={$editorStore.isBusy || !$hasSelection}
            on:click={handleExportSelectedClick}
            title={$hasSelection
              ? '選択中のページのみを1つのPDFファイルとして出力します (Ctrl+Shift+S)'
              : '出力するページを選択してください'}
          >
            <span class="export-menu-label">
              選択中のページを出力{#if $editorStore.selectedIds.length > 0} ({$editorStore.selectedIds.length}ページ){:else}（未選択）{/if}
            </span>
            <span class="export-menu-shortcut">Ctrl+Shift+S</span>
          </button>
        </div>
      {/if}
    </div>

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

  .split-btn-wrapper {
    position: relative;
    display: inline-flex;
  }

  .split-btn {
    display: inline-flex;
    align-items: stretch;
  }

  .split-btn-main {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .split-btn-toggle {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid rgba(255, 255, 255, 0.35);
    padding: 0.38rem 0.45rem;
  }

  .caret-icon {
    width: 0.72rem;
    height: 0.72rem;
    display: block;
  }

  .export-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 260px;
    background: var(--surface-bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.14);
    padding: 0.3rem;
    z-index: 50;
  }

  .export-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.48rem 0.65rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.82rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.12s ease;
  }

  .export-menu-item:hover:not(:disabled) {
    background: var(--selected-bg);
    color: var(--accent-color);
  }

  .export-menu-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .export-menu-shortcut {
    font-size: 0.72rem;
    color: var(--text-secondary);
    font-weight: 400;
  }
</style>
