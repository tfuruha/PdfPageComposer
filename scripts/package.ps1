# ==============================================================================
# PdfPageComposer 配布用パッケージングスクリプト (PowerShell)
# 実行ファイルとユーザー説明書を同梱した Zip アーカイブを dist/ フォルダに生成します。
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$BuildIfNeeded = $true,
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# スクリプト自身のディレクトリからプロジェクトルートを特定
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PdfPageComposer 配布パッケージ作成ツール" -ForegroundColor Cyan
Write-Host " プロジェクトルート: $ProjectRoot" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# パス定義
$ExePath = Join-Path $ProjectRoot "build\bin\PdfPageComposer.exe"
$ManualPath = Join-Path $ProjectRoot "docs\user_manual.md"
$DistDir = Join-Path $ProjectRoot "dist"
$ZipName = "PdfPageComposer-windows-amd64-v$Version.zip"
$ZipPath = Join-Path $DistDir $ZipName
$TempDir = Join-Path $ProjectRoot "dist\temp_package"

# 1. 実行ファイルの存在確認・必要に応じたビルド
if (-not (Test-Path $ExePath)) {
    if ($BuildIfNeeded) {
        Write-Host "`n[1/4] 実行ファイルが見つからないため、Windows本番バイナリをビルドします..." -ForegroundColor Yellow
        $buildCmd = 'go build -tags desktop,production -ldflags "-w -s -H windowsgui" -o build/bin/PdfPageComposer.exe .'
        Write-Host "実行: $buildCmd" -ForegroundColor Gray
        Invoke-Expression $buildCmd
        if (-not (Test-Path $ExePath)) {
            Write-Error "ビルドに失敗しました。$ExePath が生成されていません。"
            exit 1
        }
        Write-Host "ビルド成功: $ExePath" -ForegroundColor Green
    } else {
        Write-Error "実行ファイルが見つかりません: $ExePath`n先にビルドを行うか、-BuildIfNeeded スイッチを有効にしてください。"
        exit 1
    }
} else {
    Write-Host "`n[1/4] 実行ファイルを確認しました: $ExePath" -ForegroundColor Green
}

# 2. 説明書の存在確認
if (-not (Test-Path $ManualPath)) {
    Write-Error "説明書ファイルが見つかりません: $ManualPath"
    exit 1
}
Write-Host "[2/4] 説明書ファイルを確認しました: $ManualPath" -ForegroundColor Green

# 3. 出力先ディレクトリと一時フォルダの準備
Write-Host "[3/4] パッケージ用作業ディレクトリを準備中..." -ForegroundColor Cyan
if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
}
New-Item -ItemType Directory -Path (Join-Path $TempDir "PdfPageComposer") -Force | Out-Null
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
}

$PackageContentDir = Join-Path $TempDir "PdfPageComposer"

# ファイルの配置
Copy-Item $ExePath -Destination (Join-Path $PackageContentDir "PdfPageComposer.exe")
# 配布先で一目で分かるよう「説明書.md」および「README.md」として配置
Copy-Item $ManualPath -Destination (Join-Path $PackageContentDir "説明書.md")
Copy-Item $ManualPath -Destination (Join-Path $PackageContentDir "README.md")

# 4. Zip アーカイブ作成
Write-Host "[4/4] Zip アーカイブを作成中: $ZipName..." -ForegroundColor Cyan
if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}

# Compress-Archive による ZIP 化
Compress-Archive -Path "$PackageContentDir\*" -DestinationPath $ZipPath -Force

# 一時フォルダの削除
Remove-Item -Recurse -Force $TempDir

# 作成完了とファイル情報の表示
$ZipItem = Get-Item $ZipPath
$ZipSizeMB = [math]::Round($ZipItem.Length / 1MB, 2)

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " パッケージ作成が正常に完了しました！" -ForegroundColor Green
Write-Host " 出力ファイル: $($ZipItem.FullName)" -ForegroundColor White
Write-Host " ファイルサイズ: $ZipSizeMB MB ($($ZipItem.Length) bytes)" -ForegroundColor White
Write-Host " 同梱内容:" -ForegroundColor White
Write-Host "   - PdfPageComposer.exe (Windows 64bit 実行ファイル)" -ForegroundColor Gray
Write-Host "   - 説明書.md (ユーザー向け操作マニュアル)" -ForegroundColor Gray
Write-Host "   - README.md (同上)" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green
