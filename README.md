# PdfPageComposer

**PdfPageComposer** は、Wails v2・Go (`pdfcpu`)・Svelte (TypeScript + `pdfjs-dist`) を用いて構築された、シンプルで軽快なデスクトップ向け PDF ページ編集アプリケーションです。

---

## 主な機能

- **複数PDFの読み込み・結合**: ファイル選択ダイアログおよびウィンドウへのドラッグ＆ドロップで複数のPDFファイルを読み込み可能
- **指定位置へのPDF挿入**: 末尾への追加だけでなく、選択ページの前／後やカード間の「＋」ボタンから任意の位置に別PDFを差し込み可能
- **ページサムネイル一覧 & 拡大プレビュー**: `pdfjs-dist` によるサムネイルグリッド表示と、ダブルクリック（または「🔍 確認」ボタン）による高解像度モーダルプレビュー（前後ページ移動・50%〜200%ズーム対応）
- **直感的なページ編集**:
  - ドラッグ＆ドロップによるページ順の入れ替え（単一・複数選択対応）
  - 単一選択（Click）、個別追加選択（`Ctrl`/`Cmd`+Click）、範囲選択（`Shift`+Click）、全選択（`Ctrl`+`A`）
  - 90度単位のページ回転（左90° / 右90°、プレビューおよび出力PDFの双方に反映）
  - 不要ページの削除（`Delete` / `Backspace` キーまたは削除ボタン）
  - 操作履歴の Undo / Redo（`Ctrl`+`Z` / `Ctrl`+`Y`、最大50ステップ）
- **ロスレスPDF出力**: バックエンドの純Goライブラリ `pdfcpu` により、元のベクター品質を維持したまま結合・抽出・回転を行って単一PDFとして保存

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

- [AGENTS.md](file:///home/ftoy/Work/PdfPageComposer/AGENTS.md): 開発ガイドライン・Google Style Guide コーディング規約
- [SpecSummary20261106.txt](file:///home/ftoy/Work/PdfPageComposer/SpecSummary20261106.txt): 最上位仕様概要書
- [Plans_Works/implementation_plan.md](file:///home/ftoy/Work/PdfPageComposer/Plans_Works/implementation_plan.md): 実装計画書
- [docs/architecture.md](file:///home/ftoy/Work/PdfPageComposer/docs/architecture.md): 全体アーキテクチャ設計仕様書
- [docs/backend_pdf_service.md](file:///home/ftoy/Work/PdfPageComposer/docs/backend_pdf_service.md): バックエンド PDF合成サービス設計仕様書
- [docs/frontend_ui_state.md](file:///home/ftoy/Work/PdfPageComposer/docs/frontend_ui_state.md): フロントエンド状態管理・UI設計仕様書

---

## エージェント設定 (`.agents/`)

- **Rules**: `basic_philosophy.md`, `git-commit-rules.md`, `indexing-codebase.md`, `language-strategies.md`, `senior-engineer-conduct.md`
- **Skills**: `dep-version-management`, `indexing-awareness`, `knowledge-cutoff-awareness`
- **Workflows**: `/ask`, `/commit`, `/commit-ja`, `/discard`, `/explain`, `/grasp`, `/review`
