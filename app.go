package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"

	"pdfpagecomposer/internal/pdfcomposer"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App represents the Wails application backend binding struct.
type App struct {
	ctx     context.Context
	service *pdfcomposer.Service
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{
		service: pdfcomposer.NewService(),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Listen for native file drops anywhere in the window and emit an event to the frontend.
	runtime.OnFileDrop(ctx, func(x, y int, paths []string) {
		var pdfPaths []string
		for _, p := range paths {
			if strings.EqualFold(filepath.Ext(p), ".pdf") {
				pdfPaths = append(pdfPaths, p)
			}
		}
		if len(pdfPaths) == 0 {
			return
		}
		sources, err := a.service.RegisterFiles(pdfPaths)
		if err != nil {
			runtime.EventsEmit(ctx, "pdf:drop-error", err.Error())
			return
		}
		runtime.EventsEmit(ctx, "pdf:files-dropped", sources)
	})
}

// SelectPDFs opens a native multi-file dialog for selecting PDF files and registers them.
func (a *App) SelectPDFs() ([]pdfcomposer.SourcePDF, error) {
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "PDFファイルを選択",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PDF Files (*.pdf)",
				Pattern:     "*.pdf;*.PDF",
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("ファイル選択ダイアログを開けませんでした: %w", err)
	}
	if len(paths) == 0 {
		// User cancelled dialog.
		return []pdfcomposer.SourcePDF{}, nil
	}
	return a.service.RegisterFiles(paths)
}

// ClearSources removes all registered source PDFs in the backend service.
func (a *App) ClearSources() {
	a.service.ClearSources()
}

// GetPDFBase64 returns the Base64-encoded binary content of a registered source PDF
// so the frontend PDF.js renderer can load it reliably across all WebView schemes.
func (a *App) GetPDFBase64(sourceID string) (string, error) {
	rawBytes, err := a.service.ReadSourceBytes(strings.TrimSpace(sourceID))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(rawBytes), nil
}

// ExportPDF opens a save dialog (if req.OutputPath is empty) and writes the composed PDF.
// Returns the saved output path, or an empty string if the user cancelled the save dialog.
func (a *App) ExportPDF(req pdfcomposer.ExportRequest) (string, error) {
	if len(req.Pages) == 0 {
		return "", fmt.Errorf("出力するページがありません")
	}

	outPath := strings.TrimSpace(req.OutputPath)
	if outPath == "" {
		selectedPath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
			Title:           "結合・編集したPDFを保存",
			DefaultFilename: "composed.pdf",
			Filters: []runtime.FileFilter{
				{
					DisplayName: "PDF Files (*.pdf)",
					Pattern:     "*.pdf",
				},
			},
		})
		if err != nil {
			return "", fmt.Errorf("保存ダイアログを開けませんでした: %w", err)
		}
		if strings.TrimSpace(selectedPath) == "" {
			// User cancelled save dialog.
			return "", nil
		}
		outPath = selectedPath
	}

	if !strings.EqualFold(filepath.Ext(outPath), ".pdf") {
		outPath += ".pdf"
	}
	req.OutputPath = outPath

	if err := a.service.Compose(req); err != nil {
		return "", fmt.Errorf("PDFの出力に失敗しました: %w", err)
	}
	return outPath, nil
}

// localPDFMiddleware serves registered local PDF files at GET /local-pdf/{sourceId}
// so that PDF.js in the frontend can stream page data without Base64 IPC overhead.
func (a *App) localPDFMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const prefix = "/local-pdf/"
		if strings.HasPrefix(r.URL.Path, prefix) {
			sourceID := strings.TrimPrefix(r.URL.Path, prefix)
			sourceID = strings.TrimSpace(sourceID)
			src, ok := a.service.GetSource(sourceID)
			if !ok {
				http.Error(w, "source PDF not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/pdf")
			w.Header().Set("Cache-Control", "no-store")
			http.ServeFile(w, r, src.FilePath)
			return
		}
		next.ServeHTTP(w, r)
	})
}
