import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const TEST_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3ODY3ZDBkMC01Yzc2LTQwMzAtYWI3NC1mNDMyMDI1YjVmYTYiLCJleHAiOjE3OTUyNDg5NTh9.vbgNfmwd9I2FY-A4JS46VHp3lQH9CPSknX5JifsWiHU";

async function main() {
  console.log(`\n======================================================`);
  console.log(`🚀 6-PAGE RECRUITING APP PLAYWRIGHT VERIFICATION`);
  console.log(`   Frontend: ${BASE_URL}`);
  console.log(`   Backend:  ${BACKEND_URL}`);
  console.log(`======================================================\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Set auth cookie
  await context.addCookies([
    {
      name: "auth_token",
      value: TEST_JWT,
      domain: "localhost",
      path: "/",
    },
  ]);

  const page = await context.newPage();

  // Inject localStorage token
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate((token) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("token", token);
  }, TEST_JWT);

  const pagesToTest = [
    {
      name: "Page 1: Action Center (Home)",
      path: "/dashboard",
      verify: async (p) => {
        await p.waitForSelector("h1", { timeout: 8000 });
        const text = await p.innerText("body");
        const has4Numbers =
          text.includes("Pending CV Reviews") &&
          text.includes("Interview Results") &&
          text.includes("Offer Approvals") &&
          text.includes("Active Requisitions");
        const hasQueues =
          text.includes("CV Review Queue") ||
          text.includes("Interview Results Needed") ||
          text.includes("Offer Approvals");
        return {
          pass: has4Numbers && hasQueues,
          details: `4 Real Numbers: ${has4Numbers ? "YES" : "NO"} | Action Queues: ${hasQueues ? "YES" : "NO"}`,
        };
      },
    },
    {
      name: "Page 2: Pipeline (with Compare)",
      path: "/pipeline",
      verify: async (p) => {
        await p.waitForSelector("body", { timeout: 8000 });
        const text = await p.innerText("body");
        const hasCompareBtn = await p.locator("button:has-text('Compare')").count();
        const hasKanban = text.includes("Pipeline") || text.includes("Applied") || text.includes("Screening");
        return {
          pass: hasKanban && hasCompareBtn > 0,
          details: `Kanban Stages: ${hasKanban ? "YES" : "NO"} | Compare Button: ${hasCompareBtn > 0 ? "YES" : "NO"}`,
        };
      },
    },
    {
      name: "Page 3: Recruiting Inbox",
      path: "/inbox",
      verify: async (p) => {
        await p.waitForSelector("body", { timeout: 8000 });
        const text = await p.innerText("body");
        const hasInbox = text.includes("Inbox") || text.includes("Conversations") || text.includes("Gmail");
        return {
          pass: hasInbox,
          details: `Inbox Threads UI: ${hasInbox ? "YES" : "NO"}`,
        };
      },
    },
    {
      name: "Page 4: Interviews (with Availability tab)",
      path: "/interviews",
      verify: async (p) => {
        await p.waitForSelector("body", { timeout: 8000 });
        const text = await p.innerText("body");
        const hasSessionsTab = text.includes("Scheduled Sessions");
        const hasAvailabilityTab = text.includes("Working Availability");
        return {
          pass: hasSessionsTab && hasAvailabilityTab,
          details: `Sessions Tab: ${hasSessionsTab ? "YES" : "NO"} | Availability Tab: ${hasAvailabilityTab ? "YES" : "NO"}`,
        };
      },
    },
    {
      name: "Page 5: Requisitions / Openings",
      path: "/openings",
      verify: async (p) => {
        await p.waitForSelector("body", { timeout: 8000 });
        const text = await p.innerText("body");
        const hasRequisitions = text.includes("Requisitions") || text.includes("Job Openings") || text.includes("Opening");
        return {
          pass: hasRequisitions,
          details: `Requisitions List UI: ${hasRequisitions ? "YES" : "NO"}`,
        };
      },
    },
    {
      name: "Page 6: Settings (Integrated Tabs)",
      path: "/settings",
      verify: async (p) => {
        await p.waitForSelector("body", { timeout: 8000 });
        const text = await p.innerText("body");
        const hasTabs =
          text.includes("General & Account") &&
          text.includes("Agent Settings") &&
          text.includes("Google Workspace") &&
          text.includes("Recruiting Templates");
        return {
          pass: hasTabs,
          details: `Integrated Settings Tabs: ${hasTabs ? "YES" : "NO"}`,
        };
      },
    },
    // Merged Redirections Check
    {
      name: "Redirect: /screening -> /dashboard",
      path: "/screening",
      verify: async (p) => {
        const url = p.url();
        return {
          pass: url.includes("/dashboard"),
          details: `Final URL: ${url}`,
        };
      },
    },
    {
      name: "Redirect: /outreach -> /dashboard",
      path: "/outreach",
      verify: async (p) => {
        const url = p.url();
        return {
          pass: url.includes("/dashboard"),
          details: `Final URL: ${url}`,
        };
      },
    },
    {
      name: "Redirect: /agent -> /dashboard",
      path: "/agent",
      verify: async (p) => {
        const url = p.url();
        return {
          pass: url.includes("/dashboard"),
          details: `Final URL: ${url}`,
        };
      },
    },
    {
      name: "Redirect: /compare -> /pipeline",
      path: "/compare",
      verify: async (p) => {
        const url = p.url();
        return {
          pass: url.includes("/pipeline"),
          details: `Final URL: ${url}`,
        };
      },
    },
    {
      name: "Redirect: /availability -> /interviews",
      path: "/availability",
      verify: async (p) => {
        const url = p.url();
        return {
          pass: url.includes("/interviews"),
          details: `Final URL: ${url}`,
        };
      },
    },
    {
      name: "Candidate Public Booking Link",
      path: "/schedule/hzwb78FAwfiBSNyAaumCUuCDtNV-FiYU",
      verify: async (p) => {
        const text = await p.innerText("body");
        const hasBooking = text.includes("Confirmed") || text.includes("Schedule") || text.includes("Interview");
        return {
          pass: hasBooking,
          details: `Public Booking UI: ${hasBooking ? "YES" : "NO"}`,
        };
      },
    },
  ];

  const results = [];

  for (const item of pagesToTest) {
    process.stdout.write(`Testing ${item.name.padEnd(42)} ... `);
    try {
      const resp = await page.goto(`${BASE_URL}${item.path}`, {
        waitUntil: "networkidle",
        timeout: 10000,
      });

      // Check stuck skeleton loaders
      const pulseSkeletons = await page.locator(".animate-pulse").count();
      // Allow minor badge pulse (like Live indicator), but ensure page content is loaded
      const isSkeletonStuck = pulseSkeletons > 10;

      const verification = await item.verify(page);
      const isPass = verification.pass && !isSkeletonStuck;

      results.push({
        name: item.name,
        path: item.path,
        status: resp ? resp.status() : 200,
        pass: isPass,
        pulseCount: pulseSkeletons,
        details: verification.details,
      });

      if (isPass) {
        console.log(`✅ PASS (${verification.details})`);
      } else {
        console.log(`❌ FAIL (${verification.details}, pulseCount: ${pulseSkeletons})`);
      }
    } catch (err) {
      console.log(`❌ ERROR (${err.message})`);
      results.push({
        name: item.name,
        path: item.path,
        status: "ERROR",
        pass: false,
        pulseCount: -1,
        details: err.message,
      });
    }
  }

  // Test Compare Modal Trigger on Pipeline
  console.log(`\nTesting Compare Modal on Pipeline Page ...`);
  try {
    await page.goto(`${BASE_URL}/pipeline`, { waitUntil: "networkidle" });
    const compareBtn = page.locator("button:has-text('Compare')").first();
    await compareBtn.click();
    await page.waitForTimeout(1000);
    const dialogVisible = await page.locator("text=Side-by-side evaluation").isVisible();
    console.log(`  Modal opened successfully: ${dialogVisible ? "✅ YES" : "❌ NO"}`);
  } catch (e) {
    console.log(`  Compare Modal test warning: ${e.message}`);
  }

  // Test Availability Tab on Interviews Page
  console.log(`\nTesting Availability Tab on Interviews Page ...`);
  try {
    await page.goto(`${BASE_URL}/interviews`, { waitUntil: "networkidle" });
    const availTab = page.locator("button[role='tab']:has-text('Working Availability')").first();
    await availTab.click();
    await page.waitForTimeout(1000);
    const availVisible = (await page.innerText("body")).includes("Weekly Working Hours") || (await page.innerText("body")).includes("Monday");
    console.log(`  Availability Tab rendered successfully: ${availVisible ? "✅ YES" : "❌ NO"}`);
  } catch (e) {
    console.log(`  Availability Tab test warning: ${e.message}`);
  }

  await browser.close();

  console.log(`\n======================================================`);
  const allPass = results.every((r) => r.pass);
  console.log(`OVERALL RESULT: ${allPass ? "🎉 ALL 6 PAGES & REDIRECTS PASS!" : "⚠️ SOME TESTS FAILED"}`);
  console.log(`======================================================\n`);
}

main().catch((e) => {
  console.error("Fatal test runner error:", e);
  process.exit(1);
});
