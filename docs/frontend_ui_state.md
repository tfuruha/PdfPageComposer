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
- `sources: Readonly<Record<string, SourcePDF>>`: 読み込み済みソースPDFのマップ
- `pages: readonly PageItem[]`: 現在の出力予定ページ配列（順序＝出力ページ順）
- `selectedIds: readonly string[]`: 現在選択されている `PageItem.id` のリスト
- `lastSelectedId: string | null`: 直近に選択されたページID
- `anchorPageId: string | null`: `Shift` + クリック / 矢印キーによる範囲選択の起点（アンカー）ID
- `focusPageId: string | null`: キーボードナビゲーション時の現在フォーカス位置のページID
- `cutPageIds: readonly string[]`: `Ctrl+X` でカット状態にある `PageItem.id` のリスト
- `previewPageId: string | null`: 拡大プレビューモーダルで表示中の `PageItem.id`
- `thumbnailSize: ThumbnailSize`: サムネイル表示サイズ（`'small' | 'medium' | 'large'`）
- `isBusy: boolean`: バックエンド処理中フラグ
- `notice: StatusNotice | null`: 画面上部の通知バナー情報
- `past: readonly (readonly PageItem[])[]`: Undo 用履歴スタック（最大50件）
- `future: readonly (readonly PageItem[])[]`: Redo 用履歴スタック

### 3.2 主要アクション
1. **`addSourcePDFs(newSources: readonly SourcePDF[], insertIndex?: number)`**:
   - 各 `SourcePDF` の `1..pageCount` から `PageItem` を生成し、`insertIndex` が指定されていればその位置に、未指定なら末尾に挿入する。
   - 操作前の `pages` を `past` に積み、`future` をクリアする。
2. **`selectPage(pageId: string, mode: 'single' | 'toggle' | 'range')`**:
   - `single`: そのページのみを選択（`lastSelectedId = anchorPageId = focusPageId = pageId`）
   - `toggle` (`Ctrl`/`Cmd`+Click): 選択状態を反転（`lastSelectedId = anchorPageId = focusPageId = pageId`）
   - `range` (`Shift`+Click): `anchorPageId` から `pageId` までの連続範囲を選択
3. **`selectAdjacentPage(direction: -1 | 1, extend?: boolean)`**:
   - `ArrowLeft` (-1) / `ArrowRight` (1) によるキーボードでのページ選択移動。`extend: true` の場合はアンカーを起点に範囲選択を伸縮する。
4. **`movePages(pageIdsToMove: readonly string[], targetIndex: number)`**:
   - ドラッグされたページ（複数選択中のページをドラッグした場合は選択中の全ページを元の相対順序を保ったまま）を `targetIndex` の位置へ移動する。
5. **`cutSelection()` / `pasteCutPages(customTargetIndex?: number)` / `cancelCut()`**:
   - 選択中ページをカットバッファ（`cutPageIds`）に記録し、貼り付け時に選択位置の直後（または指定インデックス）へ一括移動する。
6. **`rotatePages(pageIds: readonly string[], delta: 90 | -90)`**:
   - 対象ページの `rotation` を `((rotation + delta) % 360 + 360) % 360` に更新する。
7. **`deletePages(pageIds?: readonly string[])`**:
   - 対象ページを `pages` から除外し、`selectedIds` / `lastSelectedId` / `anchorPageId` / `focusPageId` / `cutPageIds` からも無効なIDを除去する。
8. **`reorderPagesBySourceOrder(orderedSourceIds: readonly string[])`**:
   - ワークスペース内の全ページを、指定された `orderedSourceIds` の順序に従ってファイルごとにグループ化して一括再配置する。各ファイル内の相対ページ順および回転角度はそのまま保持され、Undo 履歴に記録される。
9. **`undo()` / `redo()` / `clearAll()`**:
   - `past` / `future` スタック間で `pages` スナップショットを復元（または全クリア）し、選択・アンカー・カット状態も有効なページIDのみに整合させる。

### 3.3 派生ストア (Derived Stores)
- `activeSourceList`: ワークスペース内のページ出現順に従ったユニークな `SourcePDF` の配列
- `uniqueSourceCount`: 現在ワークスペースに含まれるユニークなファイル数（2件以上でツールバーのファイル順ボタンを有効化）
- `canUndo` / `canRedo`: Undo / Redo の実行可否フラグ
- `hasSelection` / `hasCutPages`: 選択中・カット中ページの有無フラグ

---

## 4. UI コンポーネント構成と操作性

### 4.1 ツールバー (`Toolbar.svelte`)
- 挿入・ファイル順グループ:
  - 「⇤ 前に挿入」「⇥ 後に挿入」
  - 「📁 ファイル順」（読み込み済みファイルが2件以上ある場合に有効化）
- クリップボードグループ: 「✂ 切り取り (Ctrl+X)」「📋 貼り付け (Ctrl+V)」
- 履歴グループ: 「↶ 戻す (Ctrl+Z)」「↷ やり直し (Ctrl+Y)」
- 選択ページ操作グループ:
  - 「⟲ 左90° (Shift+R / L)」
  - 「⟳ 右90° (R)」
  - 「🗑 削除 (Delete)」: 複数選択時は件数を表示（例: `🗑 削除 (4)`）
- サムネイルサイズ切替: 小 (140px) / 中 (210px) / 大 (360px)
- 出力ボタン: 「PDFを出力」

### 4.2 ページグリッド (`PageGrid.svelte`) & ページカード (`PageCard.svelte`)
1. **タイル下部常設ボタンの撤去と表示領域最大化**:
   - 誤操作防止と視認性最大化のため、常設の操作バーを撤去し、サムネイル画像の表示領域を大幅に拡張。
   - スキャン図面を1枚だけサッと修正できるよう、マウスホバー時のみ下部に半透明の回転オーバーレイボタン（`⟲` / `⟳`）および「拡大確認」ボタンを表示。
2. **高速・瞬時なキーボードナビゲーション（0ms遅延）**:
   - クリック選択後の矢印キー移動時に以前のカードに破線枠（`:focus-visible`）が残る問題を解消（`outline: none`）。
   - CSSトランジション遅延を撤去し、同一パラメータの不要な再描画をスキップするキャッシュキーを導入したことで、矢印キー移動時の選択切り替えが遅延なく瞬時に追従。
3. **エクスプローラー準拠の範囲選択（Shift + 矢印キー）**:
   - 起点（アンカー）を固定したまま矢印キーで範囲を拡張・縮小可能。
4. **カット＆ペーストによる直感的な並び替え（Ctrl+X / Ctrl+V）**:
   - 選択ページを `Ctrl+X` で半透明（カット状態）にし、目的の位置を選択して `Ctrl+V` で直後に一括移動。ドラッグ＆ドロップが難しい大量ページでも素早く整理可能。
5. **右上ページ番号のホバールーペ機能**:
   - Excel作業書の確認業務を高速化するため、カード右上のページ番号バッジ（または虫眼鏡アイコン）にマウスホバーすると、描画済みCanvasの右上領域（上位28%×右40%）を2.5倍に拡大したルーペポップアップを即座に表示。
6. **由来ファイル別の視覚的識別（カラーコード）**:
   - `sourceId` ごとに決定論的なアクセントカラー（全8色パレット）を割り当て、カードヘッダー左端にカラーインジケータを表示。複数ファイル結合時の境界を一目で判別可能。
7. **同一ファイル内のページ番号飛び（非連番・逆順）警告**:
   - 同一元PDFの連続箇所で `originalPage` が連番になっていない場合、元ページ番号バッジ（`p.X`）をアンバー色（⚠アイコン付き）で強調表示し、抜け漏れを目視確認しやすくする。
8. **ドラッグ＆ドロップ時の端部自動スクロール**:
   - グリッドの上下端（70px以内）にドラッグカーソルが近づいた際、リストが自動的にスムーズスクロール。

### 4.3 プレビューモーダル (`PreviewModal.svelte`)
- 高解像度Canvasレンダリング（ズーム 50%〜200%）。
- 通しページ番号（`結合後 #4 / 26`）と元ファイル名・元ページ番号（`元PDF: xxx.pdf p.4`）を明確に区分して表示。
- キーボード操作対応:
  - `←` / `→`: 前後ページ送り
  - `Space` / `Esc`: プレビューを閉じる
  - `R` / `Shift+R`: 時計回り・反時計回り回転
  - `Delete`: 表示中ページの削除

### 4.4 ファイル順管理モーダル (`FileOrderModal.svelte`)
- 2つの利用シーンをシームレスに処理:
  - **インポート確認モード (`mode === 'import'`)**: 2ファイル以上が同時にドロップまたはダイアログ選択された際、ページ展開前に自動表示。誤って含めたファイルの除外（✕）に対応。
  - **ワークスペース再配置モード (`mode === 'reorder'`)**: ツールバーの「📁 ファイル順」から呼び出し、ワークスペース内のページをファイル単位で一括並び替え（Undo対応）。
- **並び替え & 一括ソート**:
  - 自然順ソート (`localeCompare(..., { numeric: true })`): 「🔤 名前順 (A → Z)」「🔤 名前順 (Z → A)」により、`1.pdf, 2.pdf, 10.pdf` を自然な順序で一発ソート。
  - 手動並び替え: 各行左端のドラッグハンドル（`⋮⋮`）によるドラッグ＆ドロップ、および「▲」「▼」ボタンによる1ステップ上下移動。
  - 「↺ リセット」で初期順序への復元。
  - キーボード操作: `Escape` でキャンセル、`Enter` で確定。

### 4.5 キーボードショートカット一覧
| キー | 動作 |
| :--- | :--- |
| `R` | 選択ページを時計回りに90°回転 |
| `Shift + R` / `L` | 選択ページを反時計回りに90°回転 |
| `Space` | 選択ページの拡大プレビューを開閉 |
| `←` / `→` | グリッド上の選択ページを前後へ移動 |
| `Shift + ←` / `→` | エクスプローラー風の範囲選択（伸縮対応） |
| `Ctrl + X` | 選択ページの切り取り（半透明表示） |
| `Ctrl + V` | 切り取ったページを選択位置の後に貼り付け（移動） |
| `Esc` | 切り取りの解除 / プレビューモーダルを閉じる |
| `Delete` / `Backspace` | 選択ページを削除 |
| `Ctrl + Z` | 元に戻す (Undo) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | やり直す (Redo) |
| `Ctrl + A` | すべてのページを選択 |
