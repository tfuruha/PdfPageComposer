# PdfPageComposer

PdfPageComposer は、Wails v2、Go (`pdfcpu`)、Svelte (TypeScript + `pdfjs-dist`) で構築されたデスクトップ向け PDF ページ編集アプリケーションです。
複数の PDF ファイルの結合、ページの並び替え、特定位置への挿入、回転、削除、およびプレビュー確認をローカル環境で軽快に行えます。

---

## 主な機能

- **複数 PDF の読み込みと結合**
  - ファイル選択ダイアログまたはウィンドウへのドラッグ＆ドロップによる読み込みに対応
- **ファイル単位の並び替え・一括ソート**
  - **追加時の順序確認**: 複数ファイルを一括追加した際、ページ展開前にファイル順序を確認・並び替え可能
  - **自然順ソート**: ファイル名に含まれる数値を認識した昇順（A → Z）・降順（Z → A）ソートに対応（例: `1.pdf`, `2.pdf`, `10.pdf`）
  - **手動並び替えと除外**: リストのドラッグ＆ドロップや上下ボタンによる手動整列、不要ファイルの除外に対応
  - **既存ページのファイル単位再配置**: 編集途中でもツールバーの「ファイル順」から、ページ単位の編集状態（順序・回転）を保持したままファイル単位で再配置可能
- **指定位置への PDF 挿入**
  - 末尾への追加に加え、選択ページの前／後やカード間の挿入ボタンから任意の位置へ別 PDF を挿入可能
- **サムネイル一覧表示とホバー操作**
  - サムネイル表示サイズを3段階（小 140px / 中 210px / 大 360px）で切り替え可能
  - カードホバー時に回転ボタン（時計回り／反時計回り）およびプレビューボタンを表示
- **右上ルーペ機能**
  - カード右上のページ番号バッジにカーソルを合わせることで、右上領域（上位28%×右40%）を2.5倍拡大表示（ヘッダー情報やページ番号の確認を補助）
- **視覚的補助（色分け・警告）**
  - **元ファイル別のカラーコード**: 読み込み元のファイルごとに固有のアクセントカラーをヘッダーに付与し、境界を識別可能
  - **ページ欠番・逆順警告**: 同一元ファイル由来の連続箇所でページ番号が不連続または逆順になっている場合、警告バッジを表示
- **ページ編集操作**
  - **ドラッグ＆ドロップによる並び替え**: 複数選択ページの移動および画面端ドラッグ時の自動スクロールに対応
  - **カット＆ペーストによる移動 (`Ctrl+X` / `Ctrl+V`)**: 選択ページを切り取り、目的の位置の直後へ一括移動
  - **選択操作**: クリック選択、`Ctrl`+クリック個別選択、`Shift`+クリック／`Shift`+矢印キーによる範囲選択、`Ctrl+A` 全選択
  - **キーボードショートカット**: 矢印キーでの選択移動、`Space` でのプレビュー表示、`R` / `Shift+R` での回転、`Delete` での削除
  - **Undo / Redo**: 最大50ステップの操作取り消し・やり直しに対応
- **拡大プレビュー**
  - モーダル表示による詳細確認（前後ページ移動、50%〜200%ズーム、回転、削除）
- **ロスレス PDF 出力**
  - バックエンドの純 Go ライブラリ `pdfcpu` により、ベクター品質・解像度を維持したまま単一 PDF として合成・保存

---

## ショートカットキー一覧

| キー | 動作 |
| :--- | :--- |
| `Ctrl + N` | 新しい作業を開始（新規作成・確認ダイアログ付き） |
| `←` / `→` | 選択ページを前後に移動 |
| `Shift + ←` / `→` | 選択範囲を前後に拡張 / 縮小 |
| `Ctrl + X` | 選択したページを切り取り |
| `Ctrl + V` | 切り取ったページを選択位置の後に貼り付け（移動） |
| `Space` | 選択ページの拡大プレビューを開く / 閉じる |
| `R` | 選択ページを時計回りに90°回転 |
| `Shift + R` / `L` | 選択ページを反時計回りに90°回転 |
| `Delete` / `Backspace` | 選択したページを削除 |
| `Ctrl + A` | すべてのページを選択 |
| `Ctrl + Z` | 直前の操作を元に戻す (Undo) |
| `Ctrl + Y` / `Ctrl + Shift + Z` | 元に戻した操作をやり直す (Redo) |
| `Esc` | 切り取り状態の解除 / プレビューモーダルを閉じる |

---

## 動作・ビルド環境

- **対応OS**: Linux, Windows（CGo非依存）
- **必要環境**:
  - Go 1.24 以上
  - Bun 1.x 以上
  - Wails CLI v2 (`github.com/wailsapp/wails/v2`)
  - Linux: GTK3 および WebKit2GTK (`webkit2gtk-4.1` または `webkit2gtk-4.0`)
  - Windows: Microsoft Edge WebView2 ランタイム

---

## セットアップ・ビルド手順

### 開発・テスト

```bash
# 1. フロントエンド依存パッケージのインストール
bun install --cwd frontend

# 2. バックエンド単体テスト
go test -v -race ./internal/pdfcomposer/...

# 3. フロントエンド単体テスト & 型チェック
bun run --cwd frontend test
bun run --cwd frontend check
```

### ビルド

```bash
# フロントエンドのビルド
bun run --cwd frontend build

# Linux 向けバイナリビルド (webkit2gtk-4.1 環境)
go build -tags desktop,production,webkit2_41 -o build/bin/PdfPageComposer .

# Windows 向けバイナリビルド (クロスコンパイルまたは Windows 環境)
GOOS=windows GOARCH=amd64 go build -tags desktop,production -ldflags "-w -s -H windowsgui" -o build/bin/PdfPageComposer.exe .
```

---

## ドキュメント

- [docs/user_manual.md](docs/user_manual.md): 利用説明書・操作ガイド
- [SpecSummary20261106.txt](SpecSummary20261106.txt): 仕様概要書
- [docs/architecture.md](docs/architecture.md): アーキテクチャ設計仕様書
- [docs/backend_pdf_service.md](docs/backend_pdf_service.md): バックエンド PDF 合成サービス設計仕様書
- [docs/frontend_ui_state.md](docs/frontend_ui_state.md): フロントエンド状態管理・UI 設計仕様書

---

## ライセンス

本プロジェクトは [Apache License 2.0](LICENSE) の下で公開されています。
詳細は [LICENSE](LICENSE) および [NOTICE](NOTICE) をご参照ください。

### サードパーティライセンス

- [pdfcpu](https://github.com/pdfcpu/pdfcpu) - Apache License 2.0
- [PDF.js (pdfjs-dist)](https://github.com/mozilla/pdf.js) - Apache License 2.0
- [Wails](https://github.com/wailsapp/wails) - MIT License
- [Svelte](https://github.com/sveltejs/svelte) - MIT License
