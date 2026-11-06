# フロントエンド状態管理・UI設計仕様書 (`docs/frontend_ui_state.md`)

## 1. 背景と根拠
シンプルで直感的な操作性を実現するため、フロントエンドの状態は単一のストア (`editorStore`) に集約し、ページ配列の変更を伴うすべてのアクション（追加、指定位置挿入、並び替え、回転、削除）をイミュータブルなスナップショットとして Undo / Redo スタックに記録する。

---

## 2. 状態モデル定義 (`frontend/src/lib/types.ts`)

```ts
export type RotationAngle = 0 | 90 | 180 | 270;

export interface SourcePDF {
  readonly id: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly pageCount: number;
}

export interface PageItem {
  readonly id: string;           // フロントエンドでの一意なページアイテムID
  readonly sourceId: string;     // SourcePDF.id
  readonly sourceName: string;   // 表示用ファイル名
  readonly originalPage: number; // 元PDFでのページ番号 (1始まり)
  readonly rotation: RotationAngle;
}
```

---

## 3. ストア設計 (`frontend/src/lib/state/editorStore.ts`)

### 3.1 管理する状態 (`EditorState`)
- `sources: Record<string, SourcePDF>`: 読み込み済みソースPDFのマップ
- `pages: PageItem[]`: 現在の出力予定ページ配列（順序＝出力ページ順）
- `selectedIds: string[]`: 現在選択されている `PageItem.id` のリスト
- `lastSelectedId: string | null`: `Shift` + クリックによる範囲選択の起点ID
- `insertTargetIndex: number | null`: 「指定位置にPDFを挿入」する際の対象インデックス（`null` の場合は選択ページの直後または末尾）
- `previewPageId: string | null`: 拡大プレビューモーダルで表示中の `PageItem.id`
- `past: PageItem[][]`: Undo 用履歴スタック（最大50件）
- `future: PageItem[][]`: Redo 用履歴スタック

### 3.2 主要アクション
1. **`addSourcePages(sources: SourcePDF[], insertIndex?: number)`**:
   - 各 `SourcePDF` の `1..pageCount` から `PageItem` を生成し、`insertIndex` が指定されていればその位置に、未指定なら末尾に挿入する。
   - 操作前の `pages` を `past` に積み、`future` をクリアする。
2. **`selectPage(id: string, mode: 'single' | 'toggle' | 'range')`**:
   - `single`: そのページのみを選択（`lastSelectedId = id`）
   - `toggle` (`Ctrl`/`Cmd`+Click): 選択状態を反転（`lastSelectedId = id`）
   - `range` (`Shift`+Click): `lastSelectedId` から `id` までの連続範囲を選択
3. **`movePages(draggedIds: string[], targetIndex: number)`**:
   - ドラッグされたページ（複数選択中のページをドラッグした場合は選択中の全ページを元の相対順序を保ったまま）を `targetIndex` の位置へ移動する。
4. **`rotatePages(ids: string[], delta: 90 | -90)`**:
   - 対象ページの `rotation` を `((rotation + delta) % 360 + 360) % 360` に更新する。
5. **`deletePages(ids: string[])`**:
   - 対象ページを `pages` から除外し、`selectedIds` からも除外する。
6. **`undo()` / `redo()`**:
   - `past` / `future` スタック間で `pages` スナップショットを復元する。

---

## 4. UI コンポーネント構成

1. **`Toolbar.svelte`**:
   - ファイル追加ボタン（「PDFを追加」「選択位置の前に挿入」「選択位置の後に挿入」）
   - 編集ボタン（「元に戻す (Undo)」「やり直す (Redo)」「左回転」「右回転」「削除」「全選択/解除」）
   - サムネイルサイズ切り替え（小・中・大）
   - 「PDFを出力」プライマリボタン
2. **`PageGrid.svelte` / `PageCard.svelte`**:
   - レスポンシブなCSSグリッドでページカードを配置。
   - 各カード間の隙間に「＋ここにPDFを挿入」ボタンを配置し、任意のページ間へ直接別PDFを挿入可能にする。
   - 各カードには出力ページ番号バッジ、元ファイル名＋元ページ番号、拡大プレビューボタン、90度回転ボタン、削除ボタンを表示。
3. **`PreviewModal.svelte`**:
   - クリックしたページを高解像度（ズーム 50%〜200%）で描画。
   - モーダル内で前後ページへの移動（`ArrowLeft` / `ArrowRight` キー対応）、回転、削除が可能。
