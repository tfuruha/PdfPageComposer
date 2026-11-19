package pdfcomposer

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

func normalizePathKey(absPath string) string {
	cleaned := filepath.Clean(absPath)
	if runtime.GOOS == "windows" {
		return strings.ToLower(cleaned)
	}
	return cleaned
}

func sameFilePath(pathA, pathB string) bool {
	cleanA := filepath.Clean(pathA)
	cleanB := filepath.Clean(pathB)
	if runtime.GOOS == "windows" {
		if strings.EqualFold(cleanA, cleanB) {
			return true
		}
	} else if cleanA == cleanB {
		return true
	}

	infoA, errA := os.Stat(cleanA)
	infoB, errB := os.Stat(cleanB)
	if errA == nil && errB == nil {
		return os.SameFile(infoA, infoB)
	}
	return false
}

// Service manages registered source PDFs and executes page composition operations.
type Service struct {
	mu      sync.RWMutex
	sources map[string]SourcePDF
	pathMap map[string]string // normalized absolute path -> source ID
	nextID  int
}

// NewService creates and initializes a new PDF composer Service.
func NewService() *Service {
	// Disable pdfcpu's default on-disk configuration directory creation
	// so the application remains self-contained on both Linux and Windows.
	api.DisableConfigDir()

	return &Service{
		sources: make(map[string]SourcePDF),
		pathMap: make(map[string]string),
		nextID:  1,
	}
}

// RegisterFile validates a PDF file on disk, determines its page count,
// and stores it in the service registry.
func (s *Service) RegisterFile(filePath string) (SourcePDF, error) {
	trimmed := strings.TrimSpace(filePath)
	if trimmed == "" {
		return SourcePDF{}, errors.New("file path must not be empty")
	}

	absPath, err := filepath.Abs(trimmed)
	if err != nil {
		return SourcePDF{}, fmt.Errorf("failed to resolve absolute path for %q: %w", filePath, err)
	}

	info, err := os.Stat(absPath)
	if err != nil {
		return SourcePDF{}, fmt.Errorf("failed to stat PDF file %q: %w", absPath, err)
	}
	if info.IsDir() {
		return SourcePDF{}, fmt.Errorf("path %q is a directory, not a PDF file", absPath)
	}

	pageCount, err := api.PageCountFile(absPath)
	if err != nil {
		return SourcePDF{}, fmt.Errorf("invalid or encrypted PDF file %q: %w", filepath.Base(absPath), err)
	}
	if pageCount <= 0 {
		return SourcePDF{}, fmt.Errorf("PDF file %q contains no pages", filepath.Base(absPath))
	}

	pathKey := normalizePathKey(absPath)

	s.mu.Lock()
	defer s.mu.Unlock()

	if existingID, ok := s.pathMap[pathKey]; ok {
		updated := SourcePDF{
			ID:        existingID,
			FilePath:  absPath,
			FileName:  filepath.Base(absPath),
			PageCount: pageCount,
		}
		s.sources[existingID] = updated
		return updated, nil
	}

	id := fmt.Sprintf("src_%d", s.nextID)
	s.nextID++

	src := SourcePDF{
		ID:        id,
		FilePath:  absPath,
		FileName:  filepath.Base(absPath),
		PageCount: pageCount,
	}
	s.sources[id] = src
	s.pathMap[pathKey] = id
	return src, nil
}

// RegisterFiles validates and registers multiple PDF file paths.
func (s *Service) RegisterFiles(paths []string) ([]SourcePDF, error) {
	if len(paths) == 0 {
		return nil, nil
	}
	result := make([]SourcePDF, 0, len(paths))
	seen := make(map[string]struct{}, len(paths))
	for _, p := range paths {
		if strings.TrimSpace(p) == "" {
			continue
		}
		src, err := s.RegisterFile(p)
		if err != nil {
			return nil, err
		}
		if _, exists := seen[src.ID]; exists {
			continue
		}
		seen[src.ID] = struct{}{}
		result = append(result, src)
	}
	return result, nil
}

// GetSource returns the registered SourcePDF for the given source ID.
func (s *Service) GetSource(sourceID string) (SourcePDF, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	src, ok := s.sources[sourceID]
	return src, ok
}

// ReadSourceBytes reads and returns the raw PDF bytes for a registered source ID.
func (s *Service) ReadSourceBytes(sourceID string) ([]byte, error) {
	src, ok := s.GetSource(sourceID)
	if !ok {
		return nil, fmt.Errorf("unknown source PDF ID %q", sourceID)
	}
	data, err := os.ReadFile(src.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read source PDF %q: %w", src.FileName, err)
	}
	return data, nil
}

// ClearSources removes all registered source PDFs and resets internal counters.
func (s *Service) ClearSources() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sources = make(map[string]SourcePDF)
	s.pathMap = make(map[string]string)
	s.nextID = 1
}

// NormalizeRotation normalizes an angle in degrees to 0, 90, 180, or 270.
func NormalizeRotation(deg int) (int, error) {
	norm := ((deg % 360) + 360) % 360
	if norm%90 != 0 {
		return 0, fmt.Errorf("rotation angle must be a multiple of 90 degrees, got %d", deg)
	}
	return norm, nil
}

// Compose builds a new PDF document according to req.Pages and writes it to req.OutputPath.
func (s *Service) Compose(req ExportRequest) error {
	outputPath := strings.TrimSpace(req.OutputPath)
	if outputPath == "" {
		return errors.New("output path must not be empty")
	}
	if len(req.Pages) == 0 {
		return errors.New("at least one page is required to export a PDF")
	}

	absOut, err := filepath.Abs(outputPath)
	if err != nil {
		return fmt.Errorf("failed to resolve output path %q: %w", outputPath, err)
	}

	type resolvedPage struct {
		srcPath    string
		pageNumber int
		rotation   int
	}
	resolved := make([]resolvedPage, 0, len(req.Pages))

	// 参照中のソース一覧を一貫して検証し、読み込み中元PDFへの上書き保存を防止する
	if err := func() error {
		s.mu.RLock()
		defer s.mu.RUnlock()

		for _, src := range s.sources {
			if sameFilePath(absOut, src.FilePath) {
				return fmt.Errorf(
					"現在読み込み中の元PDF %q には上書き保存できません。別のファイル名で保存してください",
					src.FileName,
				)
			}
		}

		for i, spec := range req.Pages {
			src, ok := s.sources[spec.SourceID]
			if !ok {
				return fmt.Errorf("page %d references unknown source ID %q", i+1, spec.SourceID)
			}
			if spec.PageNumber < 1 || spec.PageNumber > src.PageCount {
				return fmt.Errorf(
					"page %d requests out-of-range page %d from %q (total pages: %d)",
					i+1, spec.PageNumber, src.FileName, src.PageCount,
				)
			}
			rot, err := NormalizeRotation(spec.Rotation)
			if err != nil {
				return fmt.Errorf("page %d has invalid rotation: %w", i+1, err)
			}
			resolved = append(resolved, resolvedPage{
				srcPath:    src.FilePath,
				pageNumber: spec.PageNumber,
				rotation:   rot,
			})
		}
		return nil
	}(); err != nil {
		return err
	}

	tempDir, err := os.MkdirTemp("", "pdfpagecomposer-*")
	if err != nil {
		return fmt.Errorf("failed to create temporary working directory: %w", err)
	}
	defer os.RemoveAll(tempDir)

	chunkPaths := make([]string, 0, len(resolved))
	for i, page := range resolved {
		chunkPath := filepath.Join(tempDir, fmt.Sprintf("page_%05d.pdf", i+1))
		pageSelection := []string{strconv.Itoa(page.pageNumber)}

		if err := api.TrimFile(page.srcPath, chunkPath, pageSelection, model.NewDefaultConfiguration()); err != nil {
			return fmt.Errorf("failed to extract page %d from %q: %w", page.pageNumber, filepath.Base(page.srcPath), err)
		}

		if page.rotation != 0 {
			if err := api.RotateFile(chunkPath, "", page.rotation, nil, model.NewDefaultConfiguration()); err != nil {
				return fmt.Errorf("failed to rotate page %d by %d degrees: %w", i+1, page.rotation, err)
			}
		}

		chunkPaths = append(chunkPaths, chunkPath)
	}

	mergedTempPath := filepath.Join(tempDir, "merged_output.pdf")
	if len(chunkPaths) == 1 {
		mergedTempPath = chunkPaths[0]
	} else {
		if err := api.MergeCreateFile(chunkPaths, mergedTempPath, false, model.NewDefaultConfiguration()); err != nil {
			return fmt.Errorf("failed to merge PDF pages: %w", err)
		}
	}

	if err := os.MkdirAll(filepath.Dir(absOut), 0o755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	if err := writeFileAtomic(mergedTempPath, absOut); err != nil {
		return fmt.Errorf("failed to write final PDF to %q: %w", absOut, err)
	}

	return nil
}

// writeFileAtomic copies srcPath into a temporary file in dstPath's directory,
// syncs and closes it, and atomically renames it into place so existing files
// are never left truncated on I/O failure.
func writeFileAtomic(srcPath, dstPath string) error {
	in, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer in.Close()

	tmpOut, err := os.CreateTemp(filepath.Dir(dstPath), ".pdfpagecomposer-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmpOut.Name()
	tmpClosed := false
	cleanupTemp := true
	defer func() {
		if !tmpClosed {
			_ = tmpOut.Close()
		}
		if cleanupTemp {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := io.Copy(tmpOut, in); err != nil {
		return err
	}
	if err := tmpOut.Sync(); err != nil {
		return err
	}
	if err := tmpOut.Close(); err != nil {
		tmpClosed = true
		return err
	}
	tmpClosed = true

	if err := os.Chmod(tmpPath, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, dstPath); err != nil {
		return err
	}
	cleanupTemp = false
	return nil
}
