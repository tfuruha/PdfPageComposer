// Package pdfcomposer provides pure-Go PDF inspection, page extraction,
// rotation, and merging utilities backed by pdfcpu.
package pdfcomposer

// SourcePDF represents a registered source PDF file and its basic metadata.
type SourcePDF struct {
	ID        string `json:"id"`
	FilePath  string `json:"filePath"`
	FileName  string `json:"fileName"`
	PageCount int    `json:"pageCount"`
}

// PageSpec describes a single page in the composed output document.
type PageSpec struct {
	SourceID   string `json:"sourceId"`
	PageNumber int    `json:"pageNumber"` // 1-based page number in the source PDF.
	Rotation   int    `json:"rotation"`   // Relative rotation in degrees (0, 90, 180, 270).
}

// ExportRequest holds the ordered page specifications and target output path.
type ExportRequest struct {
	OutputPath string     `json:"outputPath"`
	Pages      []PageSpec `json:"pages"`
}
