#!/usr/bin/env bash
# ==============================================================================
# PdfPageComposer 配布用パッケージングスクリプト (Linux/Bash)
# 実行ファイルとユーザー説明書を同梱した Tar.gz / Zip アーカイブを dist/ に生成します。
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

VERSION="${1:-1.0.0}"
DIST_DIR="$PROJECT_ROOT/dist"
BIN_PATH="$PROJECT_ROOT/build/bin/PdfPageComposer"
MANUAL_PATH="$PROJECT_ROOT/docs/user_manual.md"
ARCHIVE_NAME="PdfPageComposer-linux-amd64-v${VERSION}.tar.gz"
TEMP_DIR="$DIST_DIR/temp_package"

echo "=========================================================="
echo " PdfPageComposer 配布パッケージ作成ツール (Linux)"
echo " プロジェクトルート: $PROJECT_ROOT"
echo "=========================================================="

if [ ! -f "$BIN_PATH" ]; then
    echo "[1/4] 実行ファイルが見つからないためビルドします..."
    go build -tags desktop,production,webkit2_41 -o "$BIN_PATH" .
fi
echo "[1/4] 実行ファイルを確認: $BIN_PATH"

if [ ! -f "$MANUAL_PATH" ]; then
    echo "エラー: 説明書ファイルが見つかりません: $MANUAL_PATH" >&2
    exit 1
fi
echo "[2/4] 説明書ファイルを確認: $MANUAL_PATH"

echo "[3/4] パッケージ用作業ディレクトリを準備中..."
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR/PdfPageComposer"
mkdir -p "$DIST_DIR"

cp "$BIN_PATH" "$TEMP_DIR/PdfPageComposer/PdfPageComposer"
chmod +x "$TEMP_DIR/PdfPageComposer/PdfPageComposer"
cp "$MANUAL_PATH" "$TEMP_DIR/PdfPageComposer/説明書.md"
cp "$MANUAL_PATH" "$TEMP_DIR/PdfPageComposer/README.md"

echo "[4/4] アーカイブを作成中: $ARCHIVE_NAME..."
tar -czf "$DIST_DIR/$ARCHIVE_NAME" -C "$TEMP_DIR" PdfPageComposer
rm -rf "$TEMP_DIR"

echo "=========================================================="
echo " パッケージ作成完了: $DIST_DIR/$ARCHIVE_NAME"
ls -lh "$DIST_DIR/$ARCHIVE_NAME"
echo "=========================================================="
