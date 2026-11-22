"""
scripts/run_playwright_e2e.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Automated runner for Playwright End-to-End Test Suite:
1. Boots FastAPI backend on 127.0.0.1:8000
2. Boots Next.js production server on 127.0.0.1:3000
3. Executes Playwright test suite against the running full stack
4. Safely tears down all child processes on completion
"""

import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
PYTHON_EXE = BACKEND_DIR / ".venv" / "Scripts" / "python.exe"


def wait_for_url(url: str, timeout_sec: int = 40, name: str = "service"):
    start = time.time()
    while time.time() - start < timeout_sec:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "HealthCheck"})
            with urllib.request.urlopen(req, timeout=2) as response:
                if response.status in (200, 307, 308):
                    print(f"  [OK] {name} is alive at {url} ({time.time() - start:.1f}s)")
                    return True
        except Exception:
            time.sleep(1)
    print(f"  [ERROR] Timed out waiting for {name} at {url}")
    return False


def main():
    print("=" * 80)
    print("LAUNCHING PLAYWRIGHT FULL-STACK E2E TEST RUNNER")
    print("=" * 80)

    backend_proc = None
    frontend_proc = None

    try:
        # 1. Start Backend
        print("\n1. Starting FastAPI Backend on 0.0.0.0:8000...")
        backend_env = os.environ.copy()
        backend_proc = subprocess.Popen(
            [str(PYTHON_EXE), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
            cwd=str(BACKEND_DIR),
            env=backend_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        if not wait_for_url("http://127.0.0.1:8000/health", timeout_sec=30, name="FastAPI Backend"):
            sys.exit(1)

        # 2. Start Frontend (dev server)
        print("\n2. Starting Next.js Dev Server on 127.0.0.1:3000...")
        frontend_env = os.environ.copy()
        frontend_env["PORT"] = "3000"
        frontend_env["NEXT_PUBLIC_API_URL"] = "http://127.0.0.1:8000"

        npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
        frontend_proc = subprocess.Popen(
            [npx_cmd, "next", "dev", "-p", "3000"],
            cwd=str(FRONTEND_DIR),
            env=frontend_env,
        )

        if not wait_for_url("http://127.0.0.1:3000", timeout_sec=45, name="Next.js Frontend"):
            sys.exit(1)

        # 3. Run Playwright Tests
        print("\n3. Executing Playwright E2E Suite...")
        npx_cmd = "npx.cmd" if os.name == "nt" else "npx"
        test_env = os.environ.copy()
        test_env["BASE_URL"] = "http://localhost:3000"

        playwright_res = subprocess.run(
            [npx_cmd, "playwright", "test"],
            cwd=str(FRONTEND_DIR),
            env=test_env,
        )

        print("\n" + "=" * 80)
        if playwright_res.returncode == 0:
            print("ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!")
        else:
            print(f"PLAYWRIGHT TESTS FAILED WITH CODE {playwright_res.returncode}")
        print("=" * 80)
        sys.exit(playwright_res.returncode)

    finally:
        print("\nTearing down test servers...")
        if frontend_proc:
            try:
                subprocess.run(
                    f"taskkill /F /T /PID {frontend_proc.pid}",
                    shell=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception:
                pass
        if backend_proc:
            try:
                subprocess.run(
                    f"taskkill /F /T /PID {backend_proc.pid}",
                    shell=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except Exception:
                pass
        print("Teardown complete.")


if __name__ == "__main__":
    main()

