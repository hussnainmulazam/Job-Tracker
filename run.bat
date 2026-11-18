@echo off
title Job Tracker - Unified Launcher
cls
echo ====================================================================
echo                 STARTING JOB TRACKER APPLICATION                    
echo ====================================================================
echo.

set ROOT_DIR=%~dp0
set VENV_PY=%ROOT_DIR%backend\.venv\Scripts\python.exe

if not exist "%VENV_PY%" (
    echo [ERROR] Virtual environment python was not found at:
    echo %VENV_PY%
    echo Please make sure the virtual environment is installed.
    pause
    exit /b 1
)

echo [1/2] Starting FastAPI Backend on http://localhost:8000 ...
start "Job Tracker - Backend API (Port 8000)" cmd /k "cd /d "%ROOT_DIR%" && set PYTHONPATH=backend && "%VENV_PY%" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload"

echo [2/2] Starting Next.js Frontend on http://localhost:3000 ...
start "Job Tracker - Next.js 15 Frontend (Port 3000)" cmd /k "cd /d "%ROOT_DIR%\frontend" && npm run dev"

echo.
echo ====================================================================
echo  Servers launched in separate dedicated terminal windows:
echo    - Frontend UI:  http://localhost:3000
echo    - Backend API:  http://localhost:8000
echo    - API Docs:     http://localhost:8000/docs
echo ====================================================================
echo.
echo Opening default web browser in 3 seconds...
timeout /t 3 >nul
start http://localhost:3000

echo.
echo To stop the servers, simply close the opened terminal windows.
echo.
pause

