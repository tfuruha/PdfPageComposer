<script lang="ts">
  import {editorStore} from '../state/editorStore';
  import PageCard from './PageCard.svelte';

  export let onInsertPDFAt: (index: number) => void;

  let draggedIds: string[] = [];
  let dropTargetIndex: number | null = null;

  const GRID_MIN_WIDTH = {
    small: '165px',
    medium: '215px',
    large: '275px',
  } as const;

  function handleDragStartCard(event: DragEvent, pageId: string): void {
    const currentSelected = $editorStore.selectedIds;
    if (currentSelected.includes(pageId)) {
      draggedIds = [...currentSelected];
    } else {
      editorStore.selectPage(pageId, 'single');
      draggedIds = [pageId];
    }

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedIds.join(','));
    }
  }

  function handleDragOverSlot(event: DragEvent, index: number): void {
    if (draggedIds.length === 0) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    dropTargetIndex = index;
  }

  function handleDragOverCard(event: DragEvent, index: number): void {
    if (draggedIds.length === 0) {
      return;
    }
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    dropTargetIndex = event.clientX < midpoint ? index : index + 1;
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    if (draggedIds.length > 0 && dropTargetIndex !== null) {
      editorStore.movePages(draggedIds, dropTargetIndex);
    }
    draggedIds = [];
    dropTargetIndex = null;
  }

  function handleDragEnd(): void {
    draggedIds = [];
    dropTargetIndex = null;
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="grid-workspace"
  on:dragover={(e) => e.preventDefault()}
  on:drop={handleDrop}
  on:dragend={handleDragEnd}
>
  <div
    class="page-grid"
    style={`--card-min-width: ${GRID_MIN_WIDTH[$editorStore.thumbnailSize]}`}
  >
    {#each $editorStore.pages as page, index (page.id)}
      <div
        class="card-slot-wrapper"
        class:drop-before={dropTargetIndex === index}
        class:drop-after={dropTargetIndex === index + 1 && index === $editorStore.pages.length - 1}
        on:dragover={(e) => handleDragOverCard(e, index)}
      >
        <button
          type="button"
          class="insert-slot-btn left"
          title={`ページ ${index + 1} の前に別のPDFを挿入`}
          on:click|stopPropagation={() => onInsertPDFAt(index)}
          on:dragover|stopPropagation={(e) => handleDragOverSlot(e, index)}
        >
          ＋
        </button>

        <PageCard
          {page}
          outputPageNumber={index + 1}
          isSelected={$editorStore.selectedIds.includes(page.id)}
          thumbnailSize={$editorStore.thumbnailSize}
          onSelect={(id, mode) => editorStore.selectPage(id, mode)}
          onPreview={(id) => editorStore.openPreview(id)}
          onRotate={(id, delta) => editorStore.rotatePages([id], delta)}
          onDelete={(id) => editorStore.deletePages([id])}
          onDragStartCard={handleDragStartCard}
        />

        {#if index === $editorStore.pages.length - 1}
          <button
            type="button"
            class="insert-slot-btn right"
            title="末尾に別のPDFを挿入"
            on:click|stopPropagation={() => onInsertPDFAt(index + 1)}
            on:dragover|stopPropagation={(e) => handleDragOverSlot(e, index + 1)}
          >
            ＋
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .grid-workspace {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.5rem 2.5rem;
  }

  .page-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--card-min-width, 215px), 1fr));
    gap: 1.15rem;
    align-items: start;
  }

  .card-slot-wrapper {
    position: relative;
    padding: 0 0.2rem;
  }

  .card-slot-wrapper.drop-before::before,
  .card-slot-wrapper.drop-after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--accent-color);
    border-radius: 4px;
    z-index: 5;
  }

  .card-slot-wrapper.drop-before::before {
    left: -6px;
  }

  .card-slot-wrapper.drop-after::after {
    right: -6px;
  }

  .insert-slot-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: 1px solid var(--accent-color);
    background: var(--surface-bg);
    color: var(--accent-color);
    font-weight: 700;
    font-size: 0.85rem;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      background 0.15s ease,
      color 0.15s ease;
    z-index: 4;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.15);
  }

  .insert-slot-btn.left {
    left: -12px;
  }

  .insert-slot-btn.right {
    right: -12px;
  }

  .card-slot-wrapper:hover .insert-slot-btn,
  .insert-slot-btn:focus-visible {
    opacity: 1;
  }

  .insert-slot-btn:hover {
    background: var(--accent-color);
    color: #ffffff;
  }
</style>
