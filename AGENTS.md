# AGENTS.md — PdfPageComposer 開発ガイドライン

このドキュメントは、**PdfPageComposer** リポジトリで作業するAIエージェントおよび開発者向けの最上位ガイドラインです。

---

## 1. プロジェクト概要

**PdfPageComposer** は、Wails v2・Go (`pdfcpu`)・Svelte (TypeScript + `pdfjs-dist`) を用いたデスクトップ向けPDFページ編集アプリケーションです。
複数のPDFファイルの結合、ページの削除、ドラッグ＆ドロップによるページ順変更、特定位置へのPDF挿入、90度単位のページ回転、およびページプレビュー確認をシンプルかつ軽快なUIで提供します。

### ターゲット環境
- **本番環境OS**: Linux, Windows
- **CGo非依存**: クロスプラットフォームビルドの容易性と安定性を確保するため、Goバックエンドは純Goライブラリ（`pdfcpu`）を使用し、CGo依存ライブラリは導入しない。

---

## 2. ディレクトリ構成とドキュメント体系

```text
PdfPageComposer/
├── AGENTS.md                        # 本ガイドライン
├── SpecSummary20261106.txt          # 最上位仕様概要書 (Source of Truth)
├── docs/                            # モジュール別設計仕様書
│   ├── architecture.md              # 全体アーキテクチャ・IPC/Asset配信設計
│   ├── backend_pdf_service.md       # Go PDF合成サービス設計仕様
│   └── frontend_ui_state.md         # フロントエンド状態管理・UI設計仕様
├── main.go                          # Wails エントリポイント & AssetHandler 設定
├── app.go                           # Wails バインディング層 (App 構造体)
├── internal/
│   └── pdfcomposer/                 # PDF解析・合成・一時ファイル管理パッケージ
│       ├── types.go                 # 入出力データ構造定義
│       ├── service.go               # pdfcpu を用いた合成・回転・検証ロジック
│       └── service_test.go          # バックエンド単体テスト
└── frontend/                        # Svelte + TypeScript フロントエンド (Bun管理)
    ├── package.json
    ├── bun.lock                     # 必須コミット対象ロックファイル
    └── src/
        ├── App.svelte               # ルートコンポーネント
        └── lib/
            ├── types.ts             # フロントエンド型定義
            ├── state/
            │   ├── editorStore.ts   # ページ状態・選択・Undo/Redoストア
            │   └── editorStore.test.ts
            ├── pdf/
            │   └── pdfRenderer.ts   # PDF.js ドキュメント管理・Canvas描画
            └── components/          # UIコンポーネント群
```

---

## 3. コーディング規約 (Google Style Guide 準拠)

### 3.1 Go コーディング規約 ([Google Go Style Guide](https://google.github.io/styleguide/go/))
- **フォーマット**: すべてのコードは `gofmt` / `go vet` を通過させること。
- **命名規則**:
  - `MixedCaps` または `mixedCaps` を使用し、アンダースコア（`_`）はテスト関数名を除き使用しない。
  - 頭字語（`PDF`, `ID`, `URL`, `HTTP`）は大文字・小文字を統一する（例: `SourcePDF`, `sourceID`, `ParsePDF`）。
- **エラーハンドリング**:
  - エラーを握りつぶさず、`fmt.Errorf("failed to ...: %w", err)` で文脈を付与してラップする。
- **コメント・ドキュメント**:
  - エクスポートされる型・関数・メソッドには必ずGoDoc形式のコメントを付与し、設計背景や注意事項は日本語コメントで明快に記述する。
- **疎結合**:
  - Wails固有のランタイム呼び出しは `app.go` に閉じ込め、PDF処理のコアロジックは `internal/pdfcomposer` に分離して単体テスト可能に保つ。

### 3.2 TypeScript / Svelte コーディング規約 ([Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html))
- **型安全性**:
  - `any` 型の使用を禁止する。必要な場合は `unknown` と型ガードを使用する。
  - インターフェースや関数の引数・戻り値には明示的な型注釈を付与する。
- **命名規則**:
  - クラス・インターフェース・型エイリアス・コンポーネントファイル名: `PascalCase`
  - 変数・関数・メソッド・プロパティ名: `camelCase`
  - 定数: `UPPER_SNAKE_CASE`
- **モジュール**:
  - TypeScriptモジュールでは `default export` を避け、名前付きエクスポート（`named export`）を使用する（Svelteコンポーネントの仕様上の default export を除く）。
- **イミュータビリティ**:
  - 状態更新時は配列・オブジェクトを直接ミューテートせず、新しい参照を生成して Undo/Redo の整合性とSvelteのリアクティビティを保証する。

---

## 4. 依存関係・パッケージ管理ルール

`.agents/skills/dep-version-management/SKILL.md` に従い、以下を厳守する。

1. **ロックファイルの管理**:
   - `go.sum` および `frontend/bun.lock` は必ず Git 管理対象に含める。
   - プロジェクトルート直下に誤って `package-lock.json` や `bun.lock` を生成しないこと（フロントエンド操作は必ず `frontend/` ディレクトリ内で行う）。
2. **主要コマンド**:
   - バックエンドテスト: `go test -v -race ./internal/pdfcomposer/...`
   - フロントエンド依存インストール: `bun install --cwd frontend`
   - フロントエンドテスト: `bun run --cwd frontend test`
   - フロントエンド型チェック: `bun run --cwd frontend check`
   - フロントエンドビルド: `bun run --cwd frontend build`
   - Linux本番バイナリビルド (WebKit2GTK 4.1環境): `go build -tags desktop,production,webkit2_41 -o build/bin/PdfPageComposer .` (または `/home/ftoy/go/bin/wails build -tags webkit2_41`)
   - Windows本番バイナリビルド: `GOOS=windows GOARCH=amd64 go build -tags desktop,production -ldflags "-w -s -H windowsgui" -o build/bin/PdfPageComposer.exe .`
