# バックエンド PDF合成サービス設計仕様書 (`docs/backend_pdf_service.md`)

## 1. 背景と根拠
`internal/pdfcomposer` パッケージは、Wails の UI/ランタイム層から独立した純粋なGoパッケージとして設計する。これにより、GUIを起動せずとも `go test` で高速かつ網羅的に結合・削除・並び替え・回転の自動テストを実行できる。

---

## 2. データ型定義 (`internal/pdfcomposer/types.go`)

```go
package pdfcomposer

// SourcePDF は読み込まれた元PDFファイルのメタデータを保持する。
type SourcePDF struct {
	ID        string `json:"id"`
	FilePath  string `json:"filePath"`
	FileName  string `json:"fileName"`
	PageCount int    `json:"pageCount"`
}

// PageSpec は出力PDFを構成する1ページ分の仕様を表す。
type PageSpec struct {
	SourceID   string `json:"sourceId"`
	PageNumber int    `json:"pageNumber"` // 元PDF内のページ番号 (1始まり)
	Rotation   int    `json:"rotation"`   // 追加回転角度 (0, 90, 180, 270)
}

// ExportRequest はPDF合成出力リクエストを表す。
type ExportRequest struct {
	OutputPath      string     `json:"outputPath"`
	DefaultFilename string     `json:"defaultFilename,omitempty"`
	Pages           []PageSpec `json:"pages"`
}
```

---

## 3. 主要メソッドとアルゴリズム (`internal/pdfcomposer/service.go`)

### 3.1 `RegisterFile(filePath string) (SourcePDF, error)` / `RegisterFiles(paths []string) ([]SourcePDF, error)`
1. ファイルの存在確認および `pdfcpu/pkg/api.PageCountFile(filePath)` の呼び出しを行い、有効なPDFであることの確認と総ページ数の取得を同時に行う。
2. 既に同一絶対パス（Windows では大文字小文字を区別しない正規化キー）のファイルが登録されている場合は既存の `SourcePDF`（最新のページ数で更新）を返し、新規の場合は一意の `ID` を採番してスレッドセーフなマップ（`sync.RWMutex` 保護）に登録する。
3. `RegisterFiles` は同一パスが複数含まれていた場合でも重複した `SourcePDF` を返さないよう `ID` 単位でデデュープする。

### 3.2 `Compose(req ExportRequest) error`
1. **一括ロック検証・上書き禁止保護**:
   - `s.mu.RLock()` を1回だけ一括取得し、スナップショットの一貫性を保ったまま全検証を行う。
   - `len(req.Pages) == 0` または `req.OutputPath == ""` の場合はエラーを返す。
   - 出力先 `absOut` が現在 `s.sources` に登録されているいずれかの元PDFと同一ファイル（パス正規化・Windows 大文字小文字非区別・`os.SameFile` で判定）である場合は、後続編集やプレビュー整合性のサイレント破損を防ぐためエラーを返し、別名保存を促す。
   - 各 `PageSpec` の `SourceID` が登録済みか、`PageNumber` が `1 <= PageNumber <= PageCount` の範囲内か、`Rotation` が `0, 90, 180, 270`（または負角の正規化可能値）かを検証する。
2. **一時ディレクトリでのページ抽出・回転**:
   - `tempDir, err := os.MkdirTemp("", "pdfpagecomposer-*")` を作成し、`defer os.RemoveAll(tempDir)` を設定する。
   - `req.Pages` を順番に走査し、各要素 `i` について一時ファイル `page_00001.pdf` を `api.TrimFile(srcPath, chunkPath, []string{strconv.Itoa(spec.PageNumber)}, conf)` で抽出する。
   - `NormalizeRotation(spec.Rotation)` が `0` でない場合、`api.RotateFile(chunkPath, "", normRotation, nil, conf)` を実行して該当チャンクを回転させる。
3. **結合とアトミックな出力 (`writeFileAtomic`)**:
   - 全チャンクが1ページのみの場合はそのチャンクを、2ページ以上の場合は `api.MergeCreateFile(chunkPaths, mergedTempPath, false, conf)` で一時結合PDFを生成する。
   - 最終出力先 `absOut` と同一ディレクトリに一時ファイル（`os.CreateTemp`）を作成し、`io.Copy` → `Sync()` → `Close()`（エラー検証）後に `os.Rename` でアトミックに配置する。途中で書き込み失敗した場合は一時ファイルを削除し、既存の出力先ファイルを破損・切り詰めしない。

### 3.3 `ClearSources()`
1. スレッドセーフ（`sync.RWMutex` 排他ロック）に `s.sources` および `s.pathMap` を空のマップに再初期化し、`s.nextID = 1` にリセットする。
2. 新規プロジェクト開始時にフロントエンドから呼び出され、バックエンドに蓄積された元PDFファイルの登録情報やパス逆引きマップを完全に消去する。

---

## 4. 判断基準と制限事項
- **暗号化PDFの扱い**: パスワード保護されたPDFが読み込まれた場合、`pdfcpu` の検証時にエラーとなるため、分かりやすいエラーメッセージ（「暗号化されたPDFまたは破損したPDFのため読み込めません」）を返す。
- **スレッド安全性**: Wails の HTTP AssetHandler と IPC メソッドから同時に `Service` が参照されるため、`sources` マップへのアクセスは必ず `sync.RWMutex` で保護する。
