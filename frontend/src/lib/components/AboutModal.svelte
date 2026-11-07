<script lang="ts">
  import {onDestroy, onMount} from 'svelte';

  export let isOpen = false;
  export let onClose: () => void;

  function handleKeyDown(event: KeyboardEvent): void {
    if (!isOpen) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
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
  <div class="modal-backdrop" on:click={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-labelledby="about-modal-title"
      on:click|stopPropagation
    >
      <header class="modal-header">
        <h2 id="about-modal-title" class="modal-title">ℹ アプリ情報 & ライセンス</h2>
        <button type="button" class="btn-close" on:click={onClose} aria-label="閉じる">✕</button>
      </header>

      <div class="modal-body">
        <section class="app-info-section">
          <div class="app-name">PdfPageComposer</div>
          <div class="app-version">Version 1.0.0</div>
          <div class="app-copy">Copyright © 2026 T.Furuhashi</div>
          <p class="app-desc">
            複数のPDFファイルの結合、ページの削除、並び替え、指定位置への挿入、回転、およびプレビュー確認を行うデスクトップアプリケーションです。
          </p>
          <div class="license-badge">Apache License 2.0</div>
        </section>

        <section class="third-party-section">
          <h3>オープンソースソフトウェア・ライセンス情報 (NOTICE)</h3>
          <p class="notice-desc">
            本ソフトウェアには、以下の第三者によって開発されたオープンソースコンポーネントが含まれています：
          </p>

          <div class="oss-list">
            <div class="oss-item">
              <div class="oss-header">
                <span class="oss-name">pdfcpu</span>
                <span class="oss-lic">Apache-2.0</span>
              </div>
              <div class="oss-url">https://github.com/pdfcpu/pdfcpu</div>
              <div class="oss-copy">Copyright 2019 The pdfcpu Authors.</div>
            </div>

            <div class="oss-item">
              <div class="oss-header">
                <span class="oss-name">PDF.js / pdfjs-dist</span>
                <span class="oss-lic">Apache-2.0</span>
              </div>
              <div class="oss-url">https://github.com/mozilla/pdf.js</div>
              <div class="oss-copy">Copyright 2024 Mozilla Foundation.</div>
            </div>

            <div class="oss-item">
              <div class="oss-header">
                <span class="oss-name">Wails</span>
                <span class="oss-lic">MIT License</span>
              </div>
              <div class="oss-url">https://github.com/wailsapp/wails</div>
              <div class="oss-copy">Copyright 2019-present Lea Anthony.</div>
            </div>

            <div class="oss-item">
              <div class="oss-header">
                <span class="oss-name">Svelte</span>
                <span class="oss-lic">MIT License</span>
              </div>
              <div class="oss-url">https://github.com/sveltejs/svelte</div>
              <div class="oss-copy">Copyright 2016-present Rich Harris and contributors.</div>
            </div>
          </div>
        </section>
      </div>

      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" on:click={onClose}>閉じる</button>
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
    border-radius: 12px;
    width: 90vw;
    max-width: 580px;
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
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-color);
  }

  .modal-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary);
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

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
  }

  .app-info-section {
    background: var(--subtle-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }

  .app-name {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .app-version {
    font-size: 0.82rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
  }

  .app-copy {
    font-size: 0.78rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
  }

  .app-desc {
    font-size: 0.84rem;
    color: var(--text-secondary);
    margin: 0.65rem 0 0.8rem;
    line-height: 1.45;
  }

  .license-badge {
    display: inline-block;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--accent-color);
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 999px;
    padding: 0.15rem 0.65rem;
  }

  .third-party-section h3 {
    margin: 0 0 0.4rem;
    font-size: 0.92rem;
    color: var(--text-primary);
  }

  .notice-desc {
    margin: 0 0 0.75rem;
    font-size: 0.8rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .oss-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .oss-item {
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 0.55rem 0.75rem;
    background: var(--surface-bg);
  }

  .oss-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .oss-name {
    font-weight: 600;
    font-size: 0.86rem;
    color: var(--text-primary);
  }

  .oss-lic {
    font-size: 0.72rem;
    font-weight: 500;
    background: var(--subtle-bg);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    color: var(--text-secondary);
  }

  .oss-url {
    font-size: 0.74rem;
    color: var(--accent-color);
    margin-top: 0.15rem;
    word-break: break-all;
  }

  .oss-copy {
    font-size: 0.74rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border-color);
    background: var(--surface-bg);
  }
</style>
