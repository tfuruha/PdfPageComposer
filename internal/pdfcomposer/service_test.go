package pdfcomposer

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// writeMinimalPDF generates a valid multi-page PDF file with pageCount pages at path.
func writeMinimalPDF(t *testing.T, path string, pageCount int) {
	t.Helper()
	if pageCount < 1 {
		t.Fatalf("pageCount must be >= 1, got %d", pageCount)
	}

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")

	totalObjs := 3 + 2*pageCount
	offsets := make([]int, totalObjs+1)

	offsets[1] = buf.Len()
	buf.WriteString("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")

	var kids bytes.Buffer
	kids.WriteString("[")
	for i := 0; i < pageCount; i++ {
		if i > 0 {
			kids.WriteString(" ")
		}
		fmt.Fprintf(&kids, "%d 0 R", 3+i)
	}
	kids.WriteString("]")

	offsets[2] = buf.Len()
	fmt.Fprintf(&buf, "2 0 obj\n<< /Type /Pages /Kids %s /Count %d >>\nendobj\n", kids.String(), pageCount)

	fontObjNum := 3 + pageCount
	for i := 0; i < pageCount; i++ {
		pageObjNum := 3 + i
		contentObjNum := 4 + pageCount + i
		offsets[pageObjNum] = buf.Len()
		fmt.Fprintf(
			&buf,
			"%d 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>\nendobj\n",
			pageObjNum, fontObjNum, contentObjNum,
		)
	}

	offsets[fontObjNum] = buf.Len()
	fmt.Fprintf(&buf, "%d 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", fontObjNum)

	for i := 0; i < pageCount; i++ {
		contentObjNum := 4 + pageCount + i
		stream := fmt.Sprintf("BT /F1 24 Tf 72 720 Td (Test Page %d) Tj ET", i+1)
		offsets[contentObjNum] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n", contentObjNum, len(stream), stream)
	}

	xrefPos := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", totalObjs+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= totalObjs; i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", totalObjs+1, xrefPos)

	if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
		t.Fatalf("failed to write test PDF: %v", err)
	}
}

func TestRegisterFileAndGetSource(t *testing.T) {
	tempDir := t.TempDir()
	pdfA := filepath.Join(tempDir, "docA.pdf")
	writeMinimalPDF(t, pdfA, 3)

	svc := NewService()
	src, err := svc.RegisterFile(pdfA)
	if err != nil {
		t.Fatalf("RegisterFile failed: %v", err)
	}
	if src.PageCount != 3 {
		t.Errorf("expected PageCount=3, got %d", src.PageCount)
	}
	if src.FileName != "docA.pdf" {
		t.Errorf("expected FileName=docA.pdf, got %q", src.FileName)
	}

	srcAgain, err := svc.RegisterFile(pdfA)
	if err != nil {
		t.Fatalf("second RegisterFile failed: %v", err)
	}
	if srcAgain.ID != src.ID {
		t.Errorf("expected identical ID %q, got %q", src.ID, srcAgain.ID)
	}

	fetched, ok := svc.GetSource(src.ID)
	if !ok || fetched.FilePath != src.FilePath {
		t.Errorf("GetSource returned (%+v, %v), want (%+v, true)", fetched, ok, src)
	}
}

func TestCompose_MergeDeleteReorderAndRotate(t *testing.T) {
	tempDir := t.TempDir()
	pdfA := filepath.Join(tempDir, "docA.pdf")
	pdfB := filepath.Join(tempDir, "docB.pdf")
	writeMinimalPDF(t, pdfA, 3)
	writeMinimalPDF(t, pdfB, 2)

	svc := NewService()
	srcA, err := svc.RegisterFile(pdfA)
	if err != nil {
		t.Fatalf("RegisterFile(pdfA) failed: %v", err)
	}
	srcB, err := svc.RegisterFile(pdfB)
	if err != nil {
		t.Fatalf("RegisterFile(pdfB) failed: %v", err)
	}

	outPath := filepath.Join(tempDir, "composed.pdf")
	req := ExportRequest{
		OutputPath: outPath,
		Pages: []PageSpec{
			{SourceID: srcA.ID, PageNumber: 3, Rotation: 90},
			{SourceID: srcB.ID, PageNumber: 1, Rotation: 0},
			{SourceID: srcA.ID, PageNumber: 1, Rotation: -180},
		},
	}

	if err := svc.Compose(req); err != nil {
		t.Fatalf("Compose failed: %v", err)
	}

	outCount, err := api.PageCountFile(outPath)
	if err != nil {
		t.Fatalf("PageCountFile on output failed: %v", err)
	}
	if outCount != 3 {
		t.Errorf("expected output PDF to have 3 pages, got %d", outCount)
	}
}

func TestCompose_ValidationErrors(t *testing.T) {
	tempDir := t.TempDir()
	pdfA := filepath.Join(tempDir, "docA.pdf")
	writeMinimalPDF(t, pdfA, 2)

	svc := NewService()
	srcA, err := svc.RegisterFile(pdfA)
	if err != nil {
		t.Fatalf("RegisterFile failed: %v", err)
	}

	tests := []struct {
		name string
		req  ExportRequest
	}{
		{
			name: "empty output path",
			req: ExportRequest{
				OutputPath: "",
				Pages:      []PageSpec{{SourceID: srcA.ID, PageNumber: 1}},
			},
		},
		{
			name: "empty pages",
			req: ExportRequest{
				OutputPath: filepath.Join(tempDir, "out.pdf"),
				Pages:      nil,
			},
		},
		{
			name: "unknown source ID",
			req: ExportRequest{
				OutputPath: filepath.Join(tempDir, "out.pdf"),
				Pages:      []PageSpec{{SourceID: "unknown_id", PageNumber: 1}},
			},
		},
		{
			name: "page number out of bounds",
			req: ExportRequest{
				OutputPath: filepath.Join(tempDir, "out.pdf"),
				Pages:      []PageSpec{{SourceID: srcA.ID, PageNumber: 5}},
			},
		},
		{
			name: "invalid rotation angle",
			req: ExportRequest{
				OutputPath: filepath.Join(tempDir, "out.pdf"),
				Pages:      []PageSpec{{SourceID: srcA.ID, PageNumber: 1, Rotation: 45}},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if err := svc.Compose(tc.req); err == nil {
				t.Errorf("expected error for %s, got nil", tc.name)
			}
		})
	}
}
