<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
  import {getSourceAccentColor, type SourcePDF} from '../types';

  export let isOpen = false;
  export let mode: 'import' | 'reorder' = 'import';
  export let initialSources: readonly SourcePDF[] = [];
  export let onConfirm: (ordered: SourcePDF[]) => void;
  export let onCancel: () => void;

  let currentSources: SourcePDF[] = [];
  let draggedIndex: number | null = null;
  let dragOverIndex: number | null = null;

  // Sync internal list whenever initialSources or isOpen updates
  $: if (isOpen) {
    currentSources = [...initialSources];
    draggedIndex = null;
    dragOverIndex = null;
  }

  $: totalPages = currentSources.reduce((sum, s) => sum + s.pageCount, 0);

  function moveItem(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= currentSources.length ||
      toIndex < 0 ||
      toIndex >= currentSources.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const updated = [...currentSources];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    currentSources = updated;
  }

  function moveUp(index: number): void {
    moveItem(index, index - 1);
  }

  function moveDown(index: number): void {
    moveItem(index, index + 1);
  }

  function removeItem(index: number): void {
    if (index >= 0 && index < currentSources.length) {
      currentSources = currentSources.filter((_, i) => i !== index);
    }
  }

  function sortNaturalAsc(): void {
    currentSources = [...currentSources].sort((a, b) =>
      a.fileName.localeCompare(b.fileName, undefined, {numeric: true, sensitivity: 'base'}),
    );
  }

  function sortNaturalDesc(): void {
    currentSources = [...currentSources].sort((a, b) =>
      b.fileName.localeCompare(a.fileName, undefined, {numeric: true, sensitivity: 'base'}),
    );
  }

  function resetOrder(): void {
    currentSources = [...initialSources];
  }

  function handleConfirm(): void {
    if (currentSources.length === 0) {
      return;
    }
    onConfirm(currentSources);
  }

  function handleCancel(): void {
    onCancel();
  }

  // Drag and drop handlers
  function handleDragStart(index: number, event: DragEvent): void {
    draggedIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  function handleDragOver(index: number, event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    dragOverIndex = index;
  }

  function handleDragLeave(index: number): void {
    if (dragOverIndex === index) {
      dragOverIndex = null;
    }
  }

  function handleDrop(index: number, event: DragEvent): void {
    event.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      moveItem(draggedIndex, index);
    }
    draggedIndex = null;
    dragOverIndex = null;
  }

  function handleDragEnd(): void {
    draggedIndex = null;
    dragOverIndex = null;
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isOpen) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
      const target = event.target as HTMLElement | null;
      // Do not trigger if user is actively focusing a button with space/enter
      if (target && target.tagName === 'BUTTON') {
        return;
      }
      event.preventDefault();
      handleConfirm();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" on:click={handleCancel}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-labelledby="file-order-title"
      on:click|stopPropagation
    >
      <header class="modal-header">
        <div>
          <h2 id="file-order-title" class="modal-title">
            {#if mode === 'import'}
              📁 ファイル読み込み順の確認
            {:else}
              📁 ファイル順の変更・ソート
            {/if}
          </h2>
          <p class="modal-subtitle">
            {#if mode === 'import'}
              複数ファイルが選択されました。ページを展開する前にファイル順を確認・並び替えることができます。
            {:else}
              ファイル順を変更すると、各ファイル内のページ順や回転を維持したまま一括で再配置されます。
            {/if}
          </p>
        </div>
        <button
          type="button"
          class="btn-close"
          on:click={handleCancel}
          aria-label="閉じる"
        >
          ✕
        </button>
      </header>

      <div class="sort-toolbar">
        <span class="sort-label">一括ソート:</span>
        <button
          type="button"
          class="btn btn-outline btn-sort"
          on:click={sortNaturalAsc}
          title="ファイル名を昇順（1, 2, 10順）でソートします"
        >
          🔤 名前順 (A → Z)
        </button>
        <button
          type="button"
          class="btn btn-outline btn-sort"
          on:click={sortNaturalDesc}
          title="ファイル名を降順でソートします"
        >
          🔤 名前順 (Z → A)
        </button>
        <button
          type="button"
          class="btn btn-outline btn-sort"
          on:click={resetOrder}
          title="開いた直後の初期順に戻します"
        >
          ↺ リセット
        </button>
      </div>

      <div class="file-list-container" role="list">
        {#if currentSources.length === 0}
          <div class="empty-list">ファイルがありません</div>
        {:else}
          {#each currentSources as src, index (src.id)}
            <div
              class="file-row"
              class:dragging={draggedIndex === index}
              class:drag-over={dragOverIndex === index}
              role="listitem"
              draggable="true"
              on:dragstart={(e) => handleDragStart(index, e)}
              on:dragover={(e) => handleDragOver(index, e)}
              on:dragleave={() => handleDragLeave(index)}
              on:drop={(e) => handleDrop(index, e)}
              on:dragend={handleDragEnd}
            >
              <div class="drag-handle" title="ドラッグして並び替え">⋮⋮</div>

              <div class="index-badge">{index + 1}</div>

              <div
                class="source-indicator"
                style={`background-color: ${getSourceAccentColor(src.id)}`}
                title="ファイル識別カラー"
              ></div>

              <div class="file-info">
                <div class="file-name" title={src.fileName}>{src.fileName}</div>
                <div class="file-path" title={src.filePath}>{src.filePath}</div>
              </div>

              <div class="page-badge">{src.pageCount} ページ</div>

              <div class="row-actions">
                <button
                  type="button"
                  class="btn-arrow"
                  on:click={() => moveUp(index)}
                  disabled={index === 0}
                  title="上へ移動"
                  aria-label="上へ移動"
                >
                  ▲
                </button>
                <button
                  type="button"
                  class="btn-arrow"
                  on:click={() => moveDown(index)}
                  disabled={index === currentSources.length - 1}
                  title="下へ移動"
                  aria-label="下へ移動"
                >
                  ▼
                </button>
                {#if mode === 'import'}
                  <button
                    type="button"
                    class="btn-remove"
                    on:click={() => removeItem(index)}
                    title="このファイルを読み込みから除外"
                    aria-label="除外"
                  >
                    ✕
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <footer class="modal-footer">
        <div class="summary-text">
          合計 {currentSources.length} ファイル / {totalPages} ページ
        </div>
        <div class="footer-buttons">
          <button type="button" class="btn btn-outline" on:click={handleCancel}>
            キャンセル
          </button>
          <button
            type="button"
            class="btn btn-primary"
            on:click={handleConfirm}
            disabled={currentSources.length === 0}
          >
            {#if mode === 'import'}
              展開して追加 ({totalPages} ページ)
            {:else}
              この順序を適用
            {/if}
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    background: var(--surface-bg);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    width: 90vw;
    max-width: 660px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.25),
      0 10px 10px -5px rgba(0, 0, 0, 0.15);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.1rem 1.25rem 0.8rem;
    border-bottom: 1px solid var(--border-color);
  }

  .modal-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .modal-subtitle {
    margin: 0.25rem 0 0;
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .btn-close {
    background: transparent;
    border: none;
    font-size: 1.1rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    transition: background-color 0.12s;
  }

  .btn-close:hover {
    background: var(--subtle-bg);
    color: var(--text-primary);
  }

  .sort-toolbar {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.55rem 1.25rem;
    background: var(--subtle-bg);
    border-bottom: 1px solid var(--border-color);
    font-size: 0.8rem;
  }

  .sort-label {
    font-weight: 500;
    color: var(--text-secondary);
    margin-right: 0.2rem;
  }

  .btn-sort {
    padding: 0.24rem 0.55rem;
    font-size: 0.78rem;
  }

  .file-list-container {
    flex: 1;
    overflow-y: auto;
    padding: 0.6rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-height: 180px;
  }

  .empty-list {
    text-align: center;
    padding: 3rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.6rem;
    background: var(--surface-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    transition:
      background-color 0.12s,
      border-color 0.12s;
    user-select: none;
  }

  .file-row:hover {
    background: var(--subtle-bg);
    border-color: var(--border-strong);
  }

  .file-row.dragging {
    opacity: 0.4;
    border-style: dashed;
  }

  .file-row.drag-over {
    border-color: var(--accent-color);
    background: var(--selected-bg);
  }

  .drag-handle {
    cursor: grab;
    color: var(--text-secondary);
    font-size: 1rem;
    letter-spacing: -2px;
    padding: 0 0.2rem;
    opacity: 0.6;
  }

  .drag-handle:hover {
    opacity: 1;
  }

  .index-badge {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--subtle-bg);
    color: var(--text-secondary);
    font-size: 0.76rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .source-indicator {
    width: 4px;
    height: 28px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .file-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .file-name {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-path {
    font-size: 0.72rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .page-badge {
    font-size: 0.78rem;
    color: var(--text-secondary);
    background: var(--subtle-bg);
    padding: 0.2rem 0.5rem;
    border-radius: 12px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .btn-arrow {
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.2rem 0.35rem;
    font-size: 0.68rem;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .btn-arrow:hover:not(:disabled) {
    background: var(--subtle-bg);
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .btn-arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .btn-remove {
    background: transparent;
    border: none;
    color: var(--danger-color);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0.2rem 0.35rem;
    border-radius: 4px;
    margin-left: 0.2rem;
  }

  .btn-remove:hover {
    background: #fef2f2;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.8rem 1.25rem;
    border-top: 1px solid var(--border-color);
    background: var(--surface-bg);
  }

  .summary-text {
    font-size: 0.8rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .footer-buttons {
    display: flex;
    gap: 0.5rem;
  }
</style>
