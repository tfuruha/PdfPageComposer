<script lang="ts">
  import {onDestroy, onMount} from 'svelte';
  import {renderHighResPageRegion, renderPageToCanvas} from '../pdf/pdfRenderer';
  import type {PageItem, SelectionMode, ThumbnailSize} from '../types';

  export let page: PageItem;
  export let outputPageNumber: number;
  export let isSelected: boolean;
  export let isCut: boolean = false;
  export let isFocused: boolean = false;
  export let thumbnailSize: ThumbnailSize;
  export let sourceAccentColor: string = '#2563eb';
  export let isDiscontinuous: boolean = false;
  export let prevPageNumber: number | null = null;
  export let onSelect: (id: string, mode: SelectionMode) => void;
  export let onPreview: (id: string) => void;
  export let onRotate: (id: string, delta: 90 | -90) => void;
  export let onDragStartCard: (event: DragEvent, id: string) => void;

  let cardElement: HTMLElement | null = null;
  let canvasElement: HTMLCanvasElement | null = null;
  let loupeCanvas: HTMLCanvasElement | null = null;
  let isVisible = false;
  let isRendering = false;
  let renderError: string | null = null;
  let observer: IntersectionObserver | null = null;
  let showLoupe = false;
  let lastRenderKey = '';
  let loupeRenderSeq = 0;
  let isLoupeHighResLoading = false;

  const SIZE_TO_WIDTH: Record<ThumbnailSize, number> = {
    small: 140,
    medium: 210,
    large: 360,
  };

  /** ルーペで拡大表示するページ右上領域 (横40% × 縦28%) */
  const LOUPE_REGION = {
    xPercent: 0.60,
    yPercent: 0.00,
    widthPercent: 0.40,
    heightPercent: 0.28,
  };

  $: targetWidth = SIZE_TO_WIDTH[thumbnailSize];
  $: targetHeight = Math.round(targetWidth * 1.35);

  // Auto-scroll when keyboard navigation lands on this card
  $: if (isFocused && cardElement) {
    cardElement.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }

  // Re-render whenever visibility, source page, rotation, or thumbnail size changes
  $: if (isVisible && canvasElement && page && targetWidth) {
    void drawThumbnail(page.sourceId, page.originalPage, page.rotation, targetWidth, targetHeight);
  }

  async function drawThumbnail(
    sourceId: string,
    pageNumber: number,
    rotation: PageItem['rotation'],
    width: number,
    height: number,
  ): Promise<void> {
    if (!canvasElement) {
      return;
    }
    const renderKey = `${sourceId}:${pageNumber}:${rotation}:${width}:${height}`;
    if (renderKey === lastRenderKey) {
      return;
    }
    lastRenderKey = renderKey;
    isRendering = true;
    renderError = null;
    try {
      await renderPageToCanvas({
        canvas: canvasElement,
        sourceId,
        pageNumber,
        rotation,
        targetWidth: width,
        targetHeight: height,
      });
      if (showLoupe) {
        void updateLoupe();
      }
    } catch (err: unknown) {
      renderError = err instanceof Error ? err.message : '描画エラー';
    } finally {
      isRendering = false;
    }
  }

  async function updateLoupe(): Promise<void> {
    if (!loupeCanvas) {
      return;
    }
    const currentSeq = ++loupeRenderSeq;

    // 1. アスペクト比と Canvas サイズの初期化 (Retina / HiDPI対応)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const loupeDisplayWidth = 280;
    let regionAspect = 1.0;
    if (canvasElement && canvasElement.height > 0) {
      regionAspect =
        (canvasElement.width * LOUPE_REGION.widthPercent) /
        (canvasElement.height * LOUPE_REGION.heightPercent);
    }
    // 極端なアスペクト比に対する安全ガード
    const clampedAspect = Math.max(0.5, Math.min(2.5, regionAspect));
    const loupeDisplayHeight = Math.round(loupeDisplayWidth / clampedAspect);

    loupeCanvas.width = Math.round(loupeDisplayWidth * dpr);
    loupeCanvas.height = Math.round(loupeDisplayHeight * dpr);
    loupeCanvas.style.width = `${loupeDisplayWidth}px`;
    loupeCanvas.style.height = `${loupeDisplayHeight}px`;

    // 2. 即時プレースホルダー描画 (既存サムネイルから比率を維持して即座に描画)
    if (canvasElement && canvasElement.width > 0 && canvasElement.height > 0) {
      const sWidth = canvasElement.width * LOUPE_REGION.widthPercent;
      const sHeight = canvasElement.height * LOUPE_REGION.heightPercent;
      const sx = canvasElement.width * LOUPE_REGION.xPercent;
      const sy = canvasElement.height * LOUPE_REGION.yPercent;

      const ctx = loupeCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, loupeCanvas.width, loupeCanvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          canvasElement,
          Math.max(0, sx),
          Math.max(0, sy),
          sWidth,
          sHeight,
          0,
          0,
          loupeCanvas.width,
          loupeCanvas.height,
        );
      }
    }

    // 3. 高解像度描画 (元PDFの解像度に近いシャープな高精細画像への置き換え)
    isLoupeHighResLoading = true;
    try {
      await renderHighResPageRegion({
        canvas: loupeCanvas,
        sourceId: page.sourceId,
        pageNumber: page.originalPage,
        rotation: page.rotation,
        region: LOUPE_REGION,
      });
    } catch (err: unknown) {
      console.warn('高解像度ルーペの描画に失敗しました:', err);
    } finally {
      if (currentSeq === loupeRenderSeq) {
        isLoupeHighResLoading = false;
      }
    }
  }

  $: if (showLoupe && loupeCanvas) {
    void updateLoupe();
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
  class:is-cut={isCut}
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
    <div class="header-left">
      <span class="source-color-indicator" style={`background-color: ${sourceAccentColor}`}></span>
      <span class="output-page-number">#{outputPageNumber}</span>
      <span class="source-filename" title={page.sourceName}>
        {page.sourceName}
      </span>
    </div>

    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div
      class="header-right"
      on:mouseenter={() => (showLoupe = true)}
      on:mouseleave={() => (showLoupe = false)}
    >
      <span
        class="orig-page-badge"
        class:discontinuous={isDiscontinuous}
        title={isDiscontinuous
          ? `元PDFのページ連番が飛んでいます (前: p.${prevPageNumber ?? '?'} → 現在: p.${page.originalPage})`
          : `元PDFのページ番号: p.${page.originalPage} (ホバーで右上拡大)`}
      >
        {#if isDiscontinuous}
          <span class="warning-icon">⚠</span>
        {/if}
        p.{page.originalPage}
      </span>
      <button
        type="button"
        class="loupe-hint-btn"
        title="ページ右上の番号をルーペ拡大表示"
        aria-label="ルーペ拡大"
      >
        🔍
      </button>
    </div>
  </div>

  <div
    class="canvas-container"
    style={`height: ${targetHeight}px`}
  >
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

    <!-- Hover overlay controls: 1-click rotate and preview trigger -->
    <div class="hover-overlay-bar" role="toolbar" tabindex="-1">
      <button
        type="button"
        class="hover-btn"
        title="このページを左に90度回転"
        on:click|stopPropagation={() => onRotate(page.id, -90)}
      >
        ⟲
      </button>
      <button
        type="button"
        class="hover-btn preview-btn"
        title="拡大プレビュー (ダブルクリックまたはSpace)"
        on:click|stopPropagation={() => onPreview(page.id)}
      >
        拡大確認
      </button>
      <button
        type="button"
        class="hover-btn"
        title="このページを右に90度回転"
        on:click|stopPropagation={() => onRotate(page.id, 90)}
      >
        ⟳
      </button>
    </div>

    <!-- Quick Loupe preview for upper-right page number -->
    {#if showLoupe}
      <div class="loupe-popup" role="tooltip">
        <div class="loupe-title">
          <span>右上コーナー拡大 (p.{page.originalPage})</span>
          {#if isLoupeHighResLoading}
            <span class="loupe-loading-badge" title="高精細読込中">HD読込中</span>
          {/if}
        </div>
        <canvas bind:this={loupeCanvas} class="loupe-canvas"></canvas>
      </div>
    {/if}
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
    position: relative;
    outline: none;
    /* Instant visual feedback for keyboard navigation */
    transition: none;
  }

  .page-card:hover {
    border-color: var(--border-strong);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.09);
  }

  /* Remove persistent dashed focus outline on clicked cards */
  .page-card:focus,
  .page-card:focus-visible {
    outline: none;
  }

  .page-card.selected {
    border-color: var(--accent-color);
    background: var(--selected-bg);
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.22);
  }

  /* Dimmed appearance when page is marked for cut */
  .page-card.is-cut {
    opacity: 0.45;
    border-style: dashed;
    border-color: #d97706;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    margin-bottom: 0.45rem;
    font-size: 0.78rem;
    min-height: 24px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    overflow: hidden;
  }

  .source-color-indicator {
    width: 6px;
    height: 18px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .output-page-number {
    font-weight: 700;
    color: var(--text-primary);
    background: var(--subtle-bg);
    padding: 0.12rem 0.42rem;
    border-radius: 5px;
    flex-shrink: 0;
    font-size: 0.78rem;
  }

  .page-card.selected .output-page-number {
    background: var(--accent-color);
    color: #ffffff;
  }

  .source-filename {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.74rem;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    flex-shrink: 0;
    cursor: zoom-in;
  }

  .orig-page-badge {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-primary);
    background: var(--subtle-bg);
    padding: 0.12rem 0.38rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .orig-page-badge:hover {
    background: #e2e8f0;
    border-color: var(--border-strong);
  }

  .orig-page-badge.discontinuous {
    background: #fef3c7;
    color: #b45309;
    border-color: #f59e0b;
    font-weight: 700;
  }

  .warning-icon {
    font-size: 0.72rem;
    line-height: 1;
  }

  .loupe-hint-btn {
    border: none;
    background: none;
    padding: 0;
    font-size: 0.75rem;
    cursor: zoom-in;
    opacity: 0.6;
    transition: opacity 0.15s ease;
  }

  .header-right:hover .loupe-hint-btn {
    opacity: 1;
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
    max-height: 100%;
    object-fit: contain;
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
    z-index: 2;
  }

  .hover-overlay-bar {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(15, 23, 42, 0.85);
    padding: 0.25rem 0.45rem;
    border-radius: 999px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
    z-index: 4;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }

  .page-card:hover .hover-overlay-bar {
    opacity: 1;
    pointer-events: auto;
  }

  .hover-btn {
    border: none;
    background: transparent;
    color: #ffffff;
    font-size: 0.82rem;
    line-height: 1;
    padding: 0.2rem 0.45rem;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .hover-btn:hover {
    background: rgba(255, 255, 255, 0.22);
  }

  .hover-btn.preview-btn {
    font-size: 0.74rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    background: var(--accent-color);
  }

  .hover-btn.preview-btn:hover {
    background: #1d4ed8;
  }

  .loupe-popup {
    position: absolute;
    top: 8px;
    right: 8px;
    background: #ffffff;
    border: 2px solid var(--accent-color);
    border-radius: 8px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.3);
    z-index: 30;
    padding: 0.4rem;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-width: 95vw;
  }

  .loupe-title {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--accent-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .loupe-loading-badge {
    font-size: 0.62rem;
    font-weight: 700;
    color: #ffffff;
    background: var(--accent-color);
    padding: 0.08rem 0.32rem;
    border-radius: 999px;
    letter-spacing: 0.02em;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .loupe-canvas {
    display: block;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    box-shadow: inset 0 0 2px rgba(0, 0, 0, 0.06);
  }
</style>
