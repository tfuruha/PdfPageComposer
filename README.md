# PdfPageComposer

**PdfPageComposer** は、Wails v2・Go (`pdfcpu`)・Svelte (TypeScript + `pdfjs-dist`) を用いて構築された、シンプルで軽快なデスクトップ向け PDF ページ編集アプリケーションです。

---

## 主な機能

- **複数PDFの読み込み・結合**: ファイル選択ダイアログおよびウィンドウへのドラッグ＆ドロップで複数のPDFファイルを読み込み可能
- **ファイル単位の並び替え・一括ソート（読み込み順確認）**:
  - **複数ファイル追加時の事前確認**: 2ファイル以上のPDFを同時にドロップまたは選択した際、自動的にファイル一覧画面が開き、ページ展開前にファイル順を確認・並び替え可能
  - **自然順ソート (Natural Sort)**: ファイル名に含まれる数値を正しく認識（`1.pdf, 2.pdf, 10.pdf` 順）する「名前順 (A → Z)」「名前順 (Z → A)」の一発ソートに対応
  - **手動並び替え & 不要ファイル除外**: リスト行のドラッグ＆ドロップや「▲」「▼」ボタンでの手動並び替え、誤って含めたファイルの除外（✕）に対応
  - **作業中のファイル単位再配置**: ツールバーの「📁 ファイル順」ボタンからいつでも呼び出し可能。各ファイル内の編集状態（ページ順序・回転角）を維持したまま一括再配置でき、`Ctrl+Z` での取り消しにも対応
- **指定位置へのPDF挿入**: 末尾への追加だけでなく、選択ページの前／後への挿入ボタンやカード間の「＋」ボタンから任意の位置に別PDFを差し込み可能
- **最大化されたサムネイル一覧 & ホバー操作**:
  - タイル下部の常設ボタンを排除してサムネイル表示領域を最大化
  - マウスホバー時のみ直感的な回転オーバーレイ（`⟲` / `⟳`）および拡大確認ボタンを表示
  - サムネイル表示サイズは3段階（小 140px / 中 210px / 大 360px）で切り替え可能
- **右上ホバールーペ機能**:
  - 各カード右上のページ番号バッジにマウスホバーすると、右上領域（上位28%×右40%）を即座に2.5倍拡大するルーペポップアップを表示（図面やExcel作業書のヘッダー・ページ番号確認を高速化）
- **視覚的サポート（色分け・警告）**:
  - **由来ファイル別のカラーコード**: 読み込んだ元PDFごとに固有のアクセントカラーをヘッダーに付与し、ファイルの境界を一目で識別可能
  - **ページ飛び・逆順警告**: 同一元PDFの連続箇所でページが抜けている（非連番）または逆順になっている場合、アンバー色の警告バッジ（⚠）を表示
- **軽快・直感的なページ編集**:
  - **ドラッグ＆ドロップ並び替え**: 画面上下端へのドラッグ時に自動スクロール対応
  - **カット＆ペースト並び替え (`Ctrl+X` / `Ctrl+V`)**: 選択したページ群を切り取り、目的の位置の直後へワンタッチで一括移動（大量ページの移動も手軽）
  - **柔軟な選択操作**: クリック選択、`Ctrl`+クリック個別追加、`Shift`+クリックおよび `Shift`+矢印キーによるエクスプローラー風の連続範囲選択、`Ctrl+A` 全選択
  - **キーボードファースト**: 矢印キー（`←` / `→`）による遅延のないページ送り、`Space` でのプレビュー開閉、`R` / `Shift+R` による90度回転、`Delete` による削除
  - **操作履歴の Undo / Redo**: 最大50ステップの取り消し・やり直し（`Ctrl+Z` / `Ctrl+Y`）
- **高解像度プレビューモーダル**:
  - 前後ページ移動、50%〜200%ズーム、モーダル内での回転・削除に対応
- **ロスレスPDF出力**: バックエンドの純Goライブラリ `pdfcpu` により、元のベクター品質・解像度を維持したまま結合・抽出・回転を行って単一PDFとして保存

---

## ショートカットキー一覧

| キー | 動作 |
| :--- | :--- |
| `←` / `→` | 選択ページを前後に移動（フォーカス移動） |
| `Shift + ←` / `→` | 選択範囲を前後に拡張 / 縮小 |
| `Ctrl + X` | 選択したページを切り取り（半透明表示） |
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

- **対応OS**: Linux, Windows（CGo非依存の純Goバックエンド構成）
- **必要ツール**:
  - Go 1.24 以上
  - Bun 1.x 以上
  - Wails CLI v2 (`github.com/wailsapp/wails/v2`)
  - Linux環境: GTK3 および WebKit2GTK (`webkit2gtk-4.1` または `webkit2gtk-4.0`)

---

## セットアップ・ビルド・テスト手順

```bash
# 1. フロントエンド依存パッケージのインストール
bun install --cwd frontend

# 2. バックエンド単体テスト
go test -v -race ./internal/pdfcomposer/...

# 3. フロントエンド単体テスト & 型チェック
bun run --cwd frontend test
bun run --cwd frontend check

# 4. フロントエンド本番ビルド
bun run --cwd frontend build

# 5. Linux デスクトップバイナリビルド (webkit2gtk-4.1 環境)
go build -tags desktop,production,webkit2_41 -o build/bin/PdfPageComposer .

# 6. アプリケーションの起動
./build/bin/PdfPageComposer
```

### Windows 向けビルド（Windows 環境またはクロスコンパイル）

```bash
GOOS=windows GOARCH=amd64 go build -tags desktop,production -ldflags "-w -s -H windowsgui" -o build/bin/PdfPageComposer.exe .
```

---

## ドキュメント体系

- [docs/user_manual.md](docs/user_manual.md): ユーザー利用説明書・操作ガイド
- [AGENTS.md](AGENTS.md): 開発ガイドライン・Google Style Guide コーディング規約
- [SpecSummary20261106.txt](SpecSummary20261106.txt): 最上位仕様概要書
- [Plans_Works/implementation_plan.md](Plans_Works/implementation_plan.md): 実装計画書
- [docs/architecture.md](docs/architecture.md): 全体アーキテクチャ設計仕様書
- [docs/backend_pdf_service.md](docs/backend_pdf_service.md): バックエンド PDF合成サービス設計仕様書
- [docs/frontend_ui_state.md](docs/frontend_ui_state.md): フロントエンド状態管理・UI設計仕様書

---

## エージェント設定 (`.agents/`)

- **Rules**: `basic_philosophy.md`, `git-commit-rules.md`, `indexing-codebase.md`, `language-strategies.md`, `senior-engineer-conduct.md`
- **Skills**: `dep-version-management`, `indexing-awareness`, `knowledge-cutoff-awareness`
- **Workflows**: `/ask`, `/commit`, `/commit-ja`, `/discard`, `/explain`, `/grasp`, `/review`

---

## ライセンス

本プロジェクトは [Apache License 2.0](LICENSE) の下で公開されています。
詳細は [LICENSE](LICENSE) および [NOTICE](NOTICE) をご参照ください。

### サードパーティライセンス

本プロジェクトは以下のオープンソースソフトウェアを利用しています。

- [pdfcpu](https://github.com/pdfcpu/pdfcpu) - Apache License 2.0
- [PDF.js (pdfjs-dist)](https://github.com/mozilla/pdf.js) - Apache License 2.0
- [Wails](https://github.com/wailsapp/wails) - MIT License
- [Svelte](https://github.com/sveltejs/svelte) - MIT License

