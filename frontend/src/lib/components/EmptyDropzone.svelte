<script lang="ts">
  export let onSelectFiles: () => void;
</script>

<div class="empty-dropzone">
  <div class="dropzone-card">
    <div class="dropzone-icon" aria-hidden="true">📄</div>
    <h2>PDFファイルをここへドラッグ＆ドロップ</h2>
    <p>
      複数のPDFファイルを読み込んで、ページの並び替え・不要ページの削除・別PDFの差し込み・回転を行えます。
    </p>
    <button type="button" class="btn btn-primary btn-lg" on:click={onSelectFiles}>
      PDFファイルを選択する
    </button>
    <ul class="shortcut-hints">
      <li><kbd>Click</kbd> 単一選択 / <kbd>Ctrl</kbd>+<kbd>Click</kbd> 複数選択 / <kbd>Shift</kbd>+<kbd>Click</kbd> 範囲選択</li>
      <li><kbd>ドラッグ＆ドロップ</kbd> ページ順の変更 / カード間の <strong>＋</strong> で任意の位置にPDF挿入</li>
      <li><kbd>Delete</kbd> 選択ページ削除 / <kbd>Ctrl</kbd>+<kbd>Z</kbd> 元に戻す</li>
    </ul>
  </div>
</div>

<style>
  .empty-dropzone {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .dropzone-card {
    max-width: 540px;
    width: 100%;
    text-align: center;
    padding: 2.8rem 2rem;
    background: var(--surface-bg);
    border: 2px dashed var(--border-strong);
    border-radius: 14px;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
  }

  .dropzone-icon {
    font-size: 3rem;
    margin-bottom: 0.75rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.2rem;
    color: var(--text-primary);
  }

  p {
    margin: 0 0 1.4rem;
    font-size: 0.9rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .btn-lg {
    padding: 0.65rem 1.4rem;
    font-size: 0.95rem;
  }

  .shortcut-hints {
    margin: 1.6rem 0 0;
    padding: 1rem 1.2rem 0;
    border-top: 1px solid var(--border-color);
    list-style: none;
    text-align: left;
    font-size: 0.8rem;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  kbd {
    background: var(--subtle-bg);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.75rem;
    font-family: inherit;
  }
</style>
