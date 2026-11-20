import { chromium } from '@playwright/test';
import fs from 'fs';
import http from 'http';

const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3ODY3ZDBkMC01Yzc2LTQwMzAtYWI3NC1mNDMyMDI1YjVmYTYiLCJleHAiOjE3OTUyNDg5NTh9.vbgNfmwd9I2FY-A4JS46VHp3lQH9CPSknX5JifsWiHU";
const BASE_URL = "http://localhost:3000";
const API_URL = "http://127.0.0.1:8000";

const PAGES = [
  { path: "/", purpose: "Public marketing landing page" },
  { path: "/login", purpose: "Recruiter login form" },
  { path: "/register", purpose: "Recruiter registration form" },
  { path: "/dashboard", purpose: "Command center KPIs, metrics, and setup progress checklist" },
  { path: "/pipeline", purpose: "Kanban hiring pipeline across candidate lifecycle stages" },
  { path: "/openings", purpose: "Job openings list & requisition management" },
  { path: "/openings/2a96e791-2b89-4491-be44-f72c1b010572", purpose: "Requisition detail, candidate list, and JD requirements" },
  { path: "/screening", purpose: "AI CV Review queue (Needs HR Review / Approved / Rejected)" },
  { path: "/compare", purpose: "Side-by-side candidate comparison matrix" },
  { path: "/inbox", purpose: "Unified recruiting inbox for candidate email/Gmail threads" },
  { path: "/outreach", purpose: "AI outreach draft message approval queue" },
  { path: "/interviews", purpose: "Interviews calendar, outcomes recording, and rescheduling" },
  { path: "/availability", purpose: "Recruiter weekly working schedule configuration & week preview" },
  { path: "/schedule/hzwb78FAwfiBSNyAaumCUuCDtNV-FiYU", purpose: "Public candidate self-scheduling slot booking page" },
  { path: "/settings", purpose: "Account, Google integration, Agent controls, and Email templates" },
  { path: "/setup", purpose: "First-login 4-step Onboarding Setup Wizard" },
  { path: "/agent", purpose: "Agent status and activity log page" },
  { path: "/ai-tools", purpose: "Legacy AI tools route (redirects to /screening)" },
  { path: "/applications", purpose: "Legacy applications route (redirects to /pipeline)" },
  { path: "/cv", purpose: "Legacy CV route (redirects to /pipeline)" }
];

async function testPages() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  // Set auth cookie for Next.js middleware and proxy
  await context.addCookies([
    {
      name: "auth_token",
      value: TOKEN,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax"
    }
  ]);

  const page = await context.newPage();

  // Set localStorage token before any script runs
  await page.addInitScript((token) => {
    localStorage.setItem("job_tracker_token", token);
    localStorage.setItem("access_token", token);
  }, TOKEN);

  const results = [];

  for (const p of PAGES) {
    const fullUrl = `${BASE_URL}${p.path}`;
    console.log(`Testing: ${p.path} ...`);
    const consoleErrors = [];
    const failedApiRequests = [];

    const onConsole = msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    };
    const onPageError = err => {
      consoleErrors.push(err.message || String(err));
    };
    const onResponse = res => {
      const status = res.status();
      const url = res.url();
      if (status >= 400 && !url.includes("favicon") && !url.includes("_next/static")) {
        failedApiRequests.push({ url, status, statusText: res.statusText() });
      }
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    let navStatus = "OK";
    let finalUrl = "";
    let skeletonStuck = false;
    let buttonsCount = 0;
    let inputsCount = 0;
    let titleText = "";
    let bodySnippet = "";
    let errorDetail = null;

    try {
      const resp = await page.goto(fullUrl, { waitUntil: 'load', timeout: 15000 });
      navStatus = resp ? resp.status() : "no-response";
      finalUrl = page.url();

      // Wait 3 seconds for dynamic data to fetch
      await page.waitForTimeout(3000);

      titleText = await page.title();

      // Check for stuck skeletons
      const skeletons = await page.locator('.animate-pulse, [data-skeleton], [data-loading="true"]').count();
      // If skeleton is still visible after 3s and content is empty
      const mainText = (await page.locator('main, body').innerText()).trim();
      bodySnippet = mainText.slice(0, 150).replace(/\n+/g, ' ');

      if (skeletons > 2 && mainText.length < 50) {
        skeletonStuck = true;
      }

      buttonsCount = await page.locator('button, a[role="button"]').count();
      inputsCount = await page.locator('input, textarea, select').count();

    } catch (e) {
      navStatus = "TIMEOUT / ERROR";
      errorDetail = e.message;
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }

    const hasErrors = consoleErrors.length > 0 || failedApiRequests.length > 0 || skeletonStuck || navStatus >= 400 || errorDetail !== null;
    let statusLabel = "WORKS";
    if (navStatus === "TIMEOUT / ERROR" || (typeof navStatus === 'number' && navStatus >= 500)) {
      statusLabel = "BROKEN";
    } else if (hasErrors) {
      statusLabel = "BROKEN";
    }

    results.push({
      path: p.path,
      purpose: p.purpose,
      statusLabel,
      navStatus,
      finalUrl,
      buttonsCount,
      inputsCount,
      skeletonStuck,
      consoleErrors: consoleErrors.slice(0, 3),
      failedApiRequests: failedApiRequests.slice(0, 3),
      errorDetail,
      bodySnippet
    });
  }

  await browser.close();
  return results;
}

// Backend API tester
async function testApiEndpoints() {
  const endpoints = [
    { method: "GET", path: "/health", auth: false },
    { method: "GET", path: "/api/v1/auth/me", auth: true },
    { method: "GET", path: "/api/v1/candidates", auth: true },
    { method: "GET", path: "/api/v1/candidates/audit-logs/recent", auth: true },
    { method: "GET", path: "/api/v1/cv-review/queue", auth: true },
    { method: "GET", path: "/api/v1/openings", auth: true },
    { method: "GET", path: "/api/v1/openings/2a96e791-2b89-4491-be44-f72c1b010572", auth: true },
    { method: "GET", path: "/api/v1/scheduling/availability", auth: true },
    { method: "GET", path: "/api/v1/scheduling/availability/week-preview", auth: true },
    { method: "GET", path: "/api/v1/scheduling/interviews", auth: true },
    { method: "GET", path: "/api/v1/scheduling/booking-link", auth: true },
    { method: "GET", path: "/api/v1/scheduling/public/hzwb78FAwfiBSNyAaumCUuCDtNV-FiYU", auth: false },
    { method: "GET", path: "/api/v1/scheduling/public/hzwb78FAwfiBSNyAaumCUuCDtNV-FiYU/slots", auth: false },
    { method: "GET", path: "/api/v1/outreach/queue", auth: true },
    { method: "GET", path: "/api/v1/outreach/audit-trail", auth: true },
    { method: "GET", path: "/api/v1/integrations/google/status", auth: true },
    { method: "GET", path: "/api/v1/integrations/google/conversations", auth: true },
    { method: "GET", path: "/api/v1/templates", auth: true },
    { method: "GET", path: "/api/v1/agent-settings", auth: true },
    { method: "GET", path: "/api/v1/agent-settings/today-activity", auth: true },
    { method: "GET", path: "/api/v1/setup", auth: true },
    { method: "GET", path: "/api/v1/debug/integrations", auth: false }
  ];

  const results = [];
  for (const ep of endpoints) {
    const url = new URL(ep.path, API_URL);
    const headers = {};
    if (ep.auth) {
      headers["Authorization"] = `Bearer ${TOKEN}`;
    }

    const t0 = Date.now();
    try {
      const res = await fetch(url.toString(), { method: ep.method, headers });
      const latency = Date.now() - t0;
      let bodyText = "";
      try {
        const json = await res.json();
        bodyText = JSON.stringify(json).slice(0, 100);
      } catch {
        bodyText = (await res.text()).slice(0, 100);
      }

      results.push({
        method: ep.method,
        path: ep.path,
        authRequired: ep.auth,
        status: res.status,
        statusText: res.statusText,
        latencyMs: latency,
        responseSnippet: bodyText,
        ok: res.ok
      });
    } catch (e) {
      results.push({
        method: ep.method,
        path: ep.path,
        authRequired: ep.auth,
        status: "ERR",
        statusText: e.message,
        latencyMs: Date.now() - t0,
        responseSnippet: "",
        ok: false
      });
    }
  }
  return results;
}

async function main() {
  console.log("=== 1. Testing Frontend Pages with Playwright ===");
  const pageResults = await testPages();

  console.log("\n=== 2. Testing Backend Endpoints ===");
  const apiResults = await testApiEndpoints();

  fs.writeFileSync("playwright_verification_results.json", JSON.stringify({ pages: pageResults, api: apiResults }, null, 2));
  console.log("\nWrote playwright_verification_results.json successfully!");
}

main().catch(console.error);
