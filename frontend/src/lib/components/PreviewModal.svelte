<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
  import {renderPageToCanvas} from '../pdf/pdfRenderer';
  import {editorStore} from '../state/editorStore';
  import type {PageItem} from '../types';

  import {getSourceAccentColor} from '../types';

  let canvasElement: HTMLCanvasElement | null = null;
  let zoomPercent = 100;
  let isRendering = false;
  let renderError: string | null = null;

  $: currentIndex = $editorStore.pages.findIndex((p) => p.id === $editorStore.previewPageId);
  $: currentPage = (currentIndex >= 0 ? $editorStore.pages[currentIndex] : null) as PageItem | null;
  $: hasPrev = currentIndex > 0;
  $: hasNext = currentIndex >= 0 && currentIndex < $editorStore.pages.length - 1;
  $: accentColor = currentPage ? getSourceAccentColor(currentPage.sourceId) : '#2563eb';

  $: if (canvasElement && currentPage && zoomPercent) {
    void drawModalPreview(currentPage, zoomPercent);
  }

  async function drawModalPreview(page: PageItem, zoom: number): Promise<void> {
    if (!canvasElement) {
      return;
    }
    isRendering = true;
    renderError = null;
    try {
      const baseWidth = Math.round((720 * zoom) / 100);
      await renderPageToCanvas({
        canvas: canvasElement,
        sourceId: page.sourceId,
        pageNumber: page.originalPage,
        rotation: page.rotation,
        targetWidth: baseWidth,
      });
    } catch (err: unknown) {
      renderError = err instanceof Error ? err.message : 'プレビューの描画に失敗しました';
    } finally {
      isRendering = false;
    }
  }

  function goPrev(): void {
    if (hasPrev) {
      editorStore.openPreview($editorStore.pages[currentIndex - 1].id);
    }
  }

  function goNext(): void {
    if (hasNext) {
      editorStore.openPreview($editorStore.pages[currentIndex + 1].id);
    }
  }

  function handleWindowKeyDown(event: KeyboardEvent): void {
    if (!currentPage) {
      return;
    }

    const isCtrlOrMeta = event.ctrlKey || event.metaKey;

    if (event.key === 'Escape' || event.key === ' ') {
      event.preventDefault();
      editorStore.closePreview();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrev();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
      return;
    }

    if (event.key.toLowerCase() === 'r' && !isCtrlOrMeta) {
      event.preventDefault();
      editorStore.rotatePages([currentPage.id], event.shiftKey ? -90 : 90);
      return;
    }

    if (event.key.toLowerCase() === 'l' && !isCtrlOrMeta) {
      event.preventDefault();
      editorStore.rotatePages([currentPage.id], -90);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      editorStore.deletePages([currentPage.id]);
      return;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleWindowKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleWindowKeyDown);
  });
</script>

{#if currentPage}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={() => editorStore.closePreview()}>
    <div class="modal-dialog" on:click|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
      <header class="modal-header">
        <div class="modal-title">
          <div class="title-top">
            <span class="seq-badge">結合後 #{currentIndex + 1} / {$editorStore.pages.length}</span>
            <span class="source-tag">
              <span class="source-color-dot" style={`background-color: ${accentColor}`}></span>
              {currentPage.sourceName} <strong class="orig-p">p.{currentPage.originalPage}</strong>
            </span>
            {#if currentPage.rotation !== 0}
              <span class="rotation-pill">回転 {currentPage.rotation}°</span>
            {/if}
          </div>
        </div>

        <div class="modal-controls">
          <button
            type="button"
            class="btn btn-icon"
            on:click={goPrev}
            disabled={!hasPrev}
            title="前のページ (←)"
          >
            ◀ 前へ
          </button>
          <button
            type="button"
            class="btn btn-icon"
            on:click={goNext}
            disabled={!hasNext}
            title="次のページ (→)"
          >
            次へ ▶
          </button>

          <span class="divider"></span>

          <button
            type="button"
            class="btn btn-icon"
            on:click={() => (zoomPercent = Math.max(50, zoomPercent - 25))}
            title="縮小"
          >
            －
          </button>
          <span class="zoom-label">{zoomPercent}%</span>
          <button
            type="button"
            class="btn btn-icon"
            on:click={() => (zoomPercent = Math.min(200, zoomPercent + 25))}
            title="拡大"
          >
            ＋
          </button>

          <span class="divider"></span>

          <button
            type="button"
            class="btn btn-icon"
            on:click={() => editorStore.rotatePages([currentPage.id], -90)}
            title="左に90度回転 (Shift+R / L)"
          >
            ⟲ 左90°
          </button>
          <button
            type="button"
            class="btn btn-icon"
            on:click={() => editorStore.rotatePages([currentPage.id], 90)}
            title="右に90度回転 (R)"
          >
            ⟳ 右90°
          </button>
          <button
            type="button"
            class="btn btn-danger-outline"
            on:click={() => editorStore.deletePages([currentPage.id])}
            title="このページを削除 (Delete)"
          >
            🗑 削除
          </button>

          <button
            type="button"
            class="btn btn-secondary"
            on:click={() => editorStore.closePreview()}
            title="閉じる (Esc または Space)"
          >
            閉じる ✕
          </button>
        </div>
      </header>

      <div class="modal-body">
        <canvas bind:this={canvasElement} class="preview-canvas"></canvas>
        {#if renderError}
          <div class="modal-error">{renderError}</div>
        {:else if isRendering}
          <div class="modal-loading">高解像度プレビューを描画中...</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    z-index: 100;
  }

  .modal-dialog {
    background: var(--surface-bg);
    border-radius: 12px;
    width: min(1060px, 95vw);
    height: min(88vh, 920px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.35);
  }

  .modal-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-color);
    background: var(--surface-bg);
  }

  .modal-title {
    display: flex;
    align-items: center;
  }

  .title-top {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .seq-badge {
    font-weight: 700;
    font-size: 0.92rem;
    color: var(--text-primary);
    background: var(--subtle-bg);
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
  }

  .source-tag {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
    background: #f1f5f9;
    padding: 0.15rem 0.5rem;
    border-radius: 6px;
    border: 1px solid var(--border-color);
  }

  .source-color-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    flex-shrink: 0;
  }

  .orig-p {
    color: var(--text-primary);
  }

  .rotation-pill {
    font-size: 0.75rem;
    font-weight: 600;
    background: rgba(15, 23, 42, 0.8);
    color: #ffffff;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
  }

  .modal-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  .divider {
    width: 1px;
    height: 20px;
    background: var(--border-color);
    margin: 0 0.2rem;
  }

  .zoom-label {
    font-size: 0.8rem;
    min-width: 3rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .modal-body {
    position: relative;
    flex: 1;
    overflow: auto;
    background: #334155;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 1.5rem;
  }

  .preview-canvas {
    display: block;
    background: #ffffff;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
    margin: auto;
  }

  .modal-loading,
  .modal-error {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: rgba(15, 23, 42, 0.82);
    color: #ffffff;
    padding: 0.4rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8rem;
  }

  .modal-error {
    background: var(--danger-color);
  }
</style>
