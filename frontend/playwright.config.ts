import { defineConfig, devices } from "@playwright/test";
import path from "path";

const backendDir = path.resolve(__dirname, "../backend");
const pythonExe = path.join(backendDir, ".venv", "Scripts", "python.exe");

export default defineConfig({
  testDir: "./tests-e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 120000,
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
  },
  webServer: [
    {
      command: ".venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload",
      url: "http://127.0.0.1:8000/health",
      cwd: backendDir,
      env: {
        ...process.env,
        PYTHONPATH: ".",
      },
      reuseExistingServer: true,
      timeout: 60000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      cwd: __dirname,
      reuseExistingServer: true,
      timeout: 60000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

