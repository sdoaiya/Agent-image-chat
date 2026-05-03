$ErrorActionPreference = "Stop"

Write-Host "[1/2] Building Go backend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\..\backend"
go build -o ..\resources\gimg-backend.exe .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Go build failed" -ForegroundColor Red
    exit 1
}

Write-Host "[2/2] Starting dev environment..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\.."
npx concurrently -k `
    "go run ./backend" `
    "npx vite"