<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
  import {renderPageToCanvas} from '../pdf/pdfRenderer';
  import type {PageItem, SelectionMode, ThumbnailSize} from '../types';

  export let page: PageItem;
  export let outputPageNumber: number;
  export let isSelected: boolean;
  export let thumbnailSize: ThumbnailSize;
  export let onSelect: (id: string, mode: SelectionMode) => void;
  export let onPreview: (id: string) => void;
  export let onRotate: (id: string, delta: 90 | -90) => void;
  export let onDelete: (id: string) => void;
  export let onDragStartCard: (event: DragEvent, id: string) => void;

  let cardElement: HTMLElement | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let isVisible = false;
  let isRendering = false;
  let renderError: string | null = null;
  let observer: IntersectionObserver | null = null;

  const SIZE_TO_WIDTH: Record<ThumbnailSize, number> = {
    small: 130,
    medium: 180,
    large: 240,
  };

  $: targetWidth = SIZE_TO_WIDTH[thumbnailSize];

  // Re-render whenever visibility, source page, rotation, or thumbnail size changes
  $: if (isVisible && canvasElement && page && targetWidth) {
    void drawThumbnail(page.sourceId, page.originalPage, page.rotation, targetWidth);
  }

  async function drawThumbnail(
    sourceId: string,
    pageNumber: number,
    rotation: PageItem['rotation'],
    width: number,
  ): Promise<void> {
    if (!canvasElement) {
      return;
    }
    isRendering = true;
    renderError = null;
    try {
      await renderPageToCanvas({
        canvas: canvasElement,
        sourceId,
        pageNumber,
        rotation,
        targetWidth: width,
      });
    } catch (err: unknown) {
      renderError = err instanceof Error ? err.message : '描画エラー';
    } finally {
      isRendering = false;
    }
  }

  function handleCardClick(event: MouseEvent): void {
    if (event.shiftKey) {
      onSelect(page.id, 'range');
    } else if (event.ctrlKey || event.metaKey) {
      onSelect(page.id, 'toggle');
    } else {
      onSelect(page.id, 'single');
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPreview(page.id);
    }
  }

  onMount(() => {
    if (!cardElement) {
      isVisible = true;
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            isVisible = true;
          }
        }
      },
      {rootMargin: '200px'},
    );
    observer.observe(cardElement);
  });

  onDestroy(() => {
    observer?.disconnect();
  });
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
  bind:this={cardElement}
  class="page-card"
  class:selected={isSelected}
  draggable="true"
  role="button"
  tabindex="0"
  aria-label={`ページ ${outputPageNumber} (${page.sourceName} の ${page.originalPage} ページ)`}
  on:click={handleCardClick}
  on:dblclick={() => onPreview(page.id)}
  on:keydown={handleKeyDown}
  on:dragstart={(e) => onDragStartCard(e, page.id)}
>
  <div class="card-header">
    <span class="output-page-number">#{outputPageNumber}</span>
    <span class="source-badge" title={`${page.sourceName} (元ページ: p.${page.originalPage})`}>
      {page.sourceName} <small>p.{page.originalPage}</small>
    </span>
  </div>

  <div class="canvas-container" style={`min-height: ${Math.round(targetWidth * 1.32)}px`}>
    <canvas bind:this={canvasElement} class="thumbnail-canvas"></canvas>
    {#if renderError}
      <div class="render-error" title={renderError}>
        プレビュー読込失敗
        <small>{renderError}</small>
      </div>
    {:else if isRendering}
      <div class="rendering-overlay">読込中...</div>
    {/if}
    {#if page.rotation !== 0}
      <span class="rotation-badge">{page.rotation}°</span>
    {/if}
  </div>

  <div class="card-actions" role="toolbar" tabindex="-1">
    <button
      type="button"
      class="card-action-btn"
      title="拡大プレビュー (ダブルクリック)"
      on:click|stopPropagation={() => onPreview(page.id)}
    >
      🔍 確認
    </button>
    <button
      type="button"
      class="card-action-btn"
      title="左へ90度回転"
      on:click|stopPropagation={() => onRotate(page.id, -90)}
    >
      ⟲
    </button>
    <button
      type="button"
      class="card-action-btn"
      title="右へ90度回転"
      on:click|stopPropagation={() => onRotate(page.id, 90)}
    >
      ⟳
    </button>
    <button
      type="button"
      class="card-action-btn danger"
      title="このページを削除"
      on:click|stopPropagation={() => onDelete(page.id)}
    >
      ✕
    </button>
  </div>
</div>

<style>
  .page-card {
    display: flex;
    flex-direction: column;
    background: var(--surface-bg);
    border: 2px solid var(--border-color);
    border-radius: 10px;
    padding: 0.55rem;
    cursor: grab;
    user-select: none;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.1s ease;
  }

  .page-card:hover {
    border-color: var(--border-strong);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  }

  .page-card.selected {
    border-color: var(--accent-color);
    background: var(--selected-bg);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    margin-bottom: 0.45rem;
    font-size: 0.78rem;
  }

  .output-page-number {
    font-weight: 700;
    color: var(--text-primary);
    background: var(--subtle-bg);
    padding: 0.12rem 0.42rem;
    border-radius: 5px;
    flex-shrink: 0;
  }

  .page-card.selected .output-page-number {
    background: var(--accent-color);
    color: #ffffff;
  }

  .source-badge {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
  }

  .source-badge small {
    font-weight: 600;
    color: var(--text-primary);
  }

  .canvas-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f1f5f9;
    border-radius: 6px;
    overflow: hidden;
    padding: 0.35rem;
  }

  .thumbnail-canvas {
    display: block;
    max-width: 100%;
    height: auto;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.14);
    background: #ffffff;
  }

  .rendering-overlay,
  .render-error {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    color: var(--text-secondary);
    background: rgba(248, 250, 252, 0.78);
  }

  .render-error {
    color: var(--danger-color);
    padding: 0.5rem;
    text-align: center;
  }

  .rotation-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background: rgba(15, 23, 42, 0.75);
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }

  .card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding-top: 0.4rem;
    border-top: 1px solid var(--border-color);
  }

  .card-action-btn {
    flex: 1;
    padding: 0.22rem 0.35rem;
    font-size: 0.75rem;
    border: 1px solid transparent;
    border-radius: 5px;
    background: var(--subtle-bg);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .card-action-btn:hover {
    background: var(--border-color);
  }

  .card-action-btn.danger {
    color: var(--danger-color);
  }

  .card-action-btn.danger:hover {
    background: #fee2e2;
  }
</style>
