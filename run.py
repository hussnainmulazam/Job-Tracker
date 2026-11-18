"""
run.py
~~~~~~
One-click unified runner for Job Tracker.
Starts both the FastAPI backend and Next.js frontend concurrently.
Press Ctrl+C to cleanly stop both services.
"""
import os
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

# Virtual environment python binary
VENV_PYTHON = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
if not VENV_PYTHON.exists():
    VENV_PYTHON = Path(sys.executable)

print("=" * 65)
print("           🚀 STARTING JOB TRACKER APPLICATION            ")
print("=" * 65)
print(f"[*] Root Directory: {ROOT_DIR}")
print(f"[*] Backend Dir:    {BACKEND_DIR}")
print(f"[*] Frontend Dir:   {FRONTEND_DIR}")
print(f"[*] Python Exec:    {VENV_PYTHON}")
print("-" * 65)

# Backend command
backend_cmd = [
    str(VENV_PYTHON),
    "-m",
    "uvicorn",
    "app.main:app",
    "--app-dir",
    str(BACKEND_DIR),
    "--host",
    "0.0.0.0",
    "--port",
    "8000",
    "--reload",
]

# Frontend command (on Windows npm is npm.cmd)
npm_bin = "npm.cmd" if sys.platform == "win32" else "npm"
frontend_cmd = [npm_bin, "--prefix", str(FRONTEND_DIR), "run", "dev"]

processes = []

try:
    print("[1/2] Starting FastAPI Backend on http://localhost:8000 ...")
    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=str(ROOT_DIR),
        env={**os.environ, "PYTHONPATH": str(BACKEND_DIR)},
    )
    processes.append(backend_proc)

    time.sleep(1.5)

    print("[2/2] Starting Next.js Frontend on http://localhost:3000 ...")
    frontend_proc = subprocess.Popen(
        frontend_cmd,
        cwd=str(ROOT_DIR),
    )
    processes.append(frontend_proc)

    print("-" * 65)
    print("✨ Both servers are running!")
    print("👉 Frontend: http://localhost:3000")
    print("👉 Backend API: http://localhost:8000")
    print("👉 API Docs: http://localhost:8000/docs")
    print("-" * 65)
    print("Press Ctrl+C anytime to stop both servers.")
    print("=" * 65)

    # Automatically open browser after 3 seconds
    time.sleep(2)
    try:
        webbrowser.open("http://localhost:3000")
    except Exception:
        pass

    # Keep script alive and monitor processes
    while True:
        for p in processes:
            poll = p.poll()
            if poll is not None:
                print(f"[!] Process {p.args} exited with code {poll}")
                sys.exit(poll)
        time.sleep(1)

except KeyboardInterrupt:
    print("\n[*] Shutting down servers gracefully...")
    for p in processes:
        try:
            if sys.platform == "win32":
                p.terminate()
            else:
                p.send_signal(signal.SIGINT)
        except Exception:
            pass
    print("[*] All servers stopped. Goodbye!")

