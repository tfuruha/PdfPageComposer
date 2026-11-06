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
	OutputPath string     `json:"outputPath"`
	Pages      []PageSpec `json:"pages"`
}
```

---

## 3. 主要メソッドとアルゴリズム (`internal/pdfcomposer/service.go`)

### 3.1 `RegisterFile(filePath string) (SourcePDF, error)`
1. ファイルの存在確認および拡張子チェックを行う。
2. `pdfcpu/pkg/api.PageCountFile(filePath)` を呼び出し、有効なPDFであることの確認と総ページ数の取得を同時に行う。
3. 既に同一絶対パスのファイルが登録されている場合は既存の `SourcePDF`（最新のページ数で更新）を返し、新規の場合は一意の `ID` を採番してスレッドセーフなマップ（`sync.RWMutex` 保護）に登録する。

### 3.2 `Compose(req ExportRequest) error`
1. **入力バリデーション**:
   - `len(req.Pages) == 0` の場合はエラーを返す。
   - `req.OutputPath == ""` の場合はエラーを返す。
   - 各 `PageSpec` の `SourceID` が登録済みか、`PageNumber` が `1 <= PageNumber <= PageCount` の範囲内か、`Rotation` が `0, 90, 180, 270`（または負角の正規化可能値）かを検証する。
2. **一時ディレクトリでのページ抽出・回転**:
   - `tempDir, err := os.MkdirTemp("", "pdfcomposer-*")` を作成し、`defer os.RemoveAll(tempDir)` を設定する。
   - `req.Pages` を順番に走査し、各要素 `i` について一時ファイル `chunk_00001.pdf` を `api.TrimFile(srcPath, chunkPath, []string{strconv.Itoa(spec.PageNumber)}, conf)` で抽出する。
   - `normRotation := ((spec.Rotation % 360) + 360) % 360` が `0` でない場合、`api.RotateFile(chunkPath, "", normRotation, nil, conf)` を実行して該当チャンクを回転させる。
3. **結合とアトミックな出力**:
   - 全チャンクが1ページのみの場合はそのチャンクを、2ページ以上の場合は `api.MergeCreateFile(chunkPaths, mergedTempPath, false, conf)` で一時結合PDFを生成する。
   - 入力元PDFと同じパスへ上書き保存された場合でも破損しないよう、一時ファイルから最終出力先 `req.OutputPath` へコピー（またはリネーム）して完了する。

---

## 4. 判断基準と制限事項
- **暗号化PDFの扱い**: パスワード保護されたPDFが読み込まれた場合、`pdfcpu` の検証時にエラーとなるため、分かりやすいエラーメッセージ（「暗号化されたPDFまたは破損したPDFのため読み込めません」）を返す。
- **スレッド安全性**: Wails の HTTP AssetHandler と IPC メソッドから同時に `Service` が参照されるため、`sources` マップへのアクセスは必ず `sync.RWMutex` で保護する。
