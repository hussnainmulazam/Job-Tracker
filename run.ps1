# Job Tracker PowerShell Runner Script
$ErrorActionPreference = "Stop"

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "                STARTING JOB TRACKER APPLICATION                    " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPy = Join-Path $RootDir "backend\.venv\Scripts\python.exe"

if (-not (Test-Path $VenvPy)) {
    Write-Host "[ERROR] Virtual environment python not found at: $VenvPy" -ForegroundColor Red
    exit 1
}

Write-Host "[1/2] Starting FastAPI Backend on http://localhost:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir'; `$env:PYTHONPATH='backend'; & '$VenvPy' -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload"

Write-Host "[2/2] Starting Next.js Frontend on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootDir\frontend'; npm run dev"

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host " Both servers are running in separate background windows!" -ForegroundColor Green
Write-Host "   Frontend:  http://localhost:3000" -ForegroundColor Yellow
Write-Host "   Backend:   http://localhost:8000" -ForegroundColor Yellow
Write-Host "   Docs:      http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"

