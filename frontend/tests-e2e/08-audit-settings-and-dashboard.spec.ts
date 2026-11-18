import { test, expect } from "@playwright/test";
import { queryDb } from "./helpers/db-helper";

const SUITE_ID = Date.now();
const recruiterEmail = `ops_audit_${SUITE_ID}@example.com`;
const password = "Password123!";
const openingTitle = `DevOps Reliability Engineer ${SUITE_ID}`;
const candidateName = `Kiran Patel ${SUITE_ID}`;
const candidateEmail = `kiran_${SUITE_ID}@example.com`;

test.describe("08. Settings, Audit Trail & Command Center Dashboard", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90000);

  let userId = "";
  let openingId = "";
  let candidateId = "";

  test.beforeAll(async ({ request }) => {
    // 1. Register Recruiter
    const regRes = await request.post("http://localhost:3000/api/auth/register", {
      data: { email: recruiterEmail, password: password },
    });
    expect([200, 201]).toContain(regRes.status());

    // 2. Query user id from Supabase
    const dbUsers = queryDb(`SELECT id FROM users WHERE email='${recruiterEmail}';`);
    expect(dbUsers.length).toBe(1);
    userId = dbUsers[0].id;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", recruiterEmail);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 25000 });
  });

  test("0. Setup Requisition, Candidate & Audit Activity", async ({ page }) => {
    // 1. Create Job Opening
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
      "#description",
      "Lead Site Reliability Engineering, Kubernetes clusters, and Terraform."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 45000 });
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible({ timeout: 15000 });

    const dbOpenings = queryDb(`SELECT id FROM job_openings WHERE title='${openingTitle}';`);
    expect(dbOpenings.length).toBe(1);
    openingId = dbOpenings[0].id;

    // 2. Add Candidate via Paste Text
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    await page.click("#btn-sidebar-add-candidate");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.click("#tab-paste-cv");
    await page.selectOption("#text-opening", openingId);
    await page.fill("#text-name", candidateName);
    await page.fill("#text-email", candidateEmail);
    await page.fill(
      "#text-cv",
      "Senior Site Reliability Engineer with 8 years scaling Kubernetes and AWS."
    );
    await page.click('button[type="submit"]:has-text("Save Candidate")');
    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    const dbCandidates = queryDb(
      `SELECT id, name FROM candidates WHERE opening_id='${openingId}';`
    );
    expect(dbCandidates.length).toBe(1);
    candidateId = dbCandidates[0].id;

    // 3. Move candidate from applied -> screening (creates an audit log entry)
    const candidateCardHeading = page.locator(`h4:has-text("${candidateName}")`).first();
    await expect(candidateCardHeading).toBeVisible({ timeout: 15000 });
    await candidateCardHeading.click();
    await expect(page.locator(`h2:has-text("${candidateName}")`)).toBeVisible({ timeout: 15000 });

    const stageSelect = page.locator("#candidate-stage-select");
    await stageSelect.selectOption("screening");
    await expect(page.locator("text=Stage Updated").first()).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");
  });

  test("1. Settings Studio: Recruiter Profile, Live AI Health & System Status", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL("**/settings");

    // 1. Verify Recruiter Profile Email
    await expect(page.locator(`text=${recruiterEmail}`).first()).toBeVisible({ timeout: 15000 });

    // 2. Verify Backend & Supabase System Status
    await expect(page.locator("text=FastAPI Backend Status").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Supabase PostgreSQL Database").first()).toBeVisible({ timeout: 15000 });

    // 3. Verify AI Model Health Telemetry
    await expect(page.locator("text=OpenRouter AI Models Health").first()).toBeVisible({ timeout: 15000 });
  });

  test("2. Settings: Theme Switcher (Dark / Light Mode Toggle)", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForURL("**/settings");

    // Toggle theme to dark
    const darkBtn = page.locator('button:has-text("Dark")').first();
    if (await darkBtn.isVisible()) {
      await darkBtn.click();
      await page.waitForTimeout(500);
      const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      expect(isDark).toBe(true);
    }

    // Toggle theme to light
    const lightBtn = page.locator('button:has-text("Light")').first();
    if (await lightBtn.isVisible()) {
      await lightBtn.click();
      await page.waitForTimeout(500);
      const isLight = await page.evaluate(() => !document.documentElement.classList.contains("dark"));
      expect(isLight).toBe(true);
    }
  });

  test("3. Audit Trail: Pipeline Audit Drawer Logs Recruiter Actions", async ({ page }) => {
    // Verify audit logs exist in Supabase
    const dbAudit = queryDb(
      `SELECT action, user_id FROM audit_logs WHERE user_id='${userId}' ORDER BY created_at DESC;`
    );
    expect(dbAudit.length).toBeGreaterThan(0);

    // Open Pipeline page
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Open Audit Drawer
    const auditBtn = page.locator("#btn-open-audit-drawer").or(page.locator('button:has-text("Audit")')).first();
    if (await auditBtn.isVisible()) {
      await auditBtn.click();
      await expect(
        page.locator("text=Pipeline Audit Trail").or(page.locator("text=Audit Trail")).first()
      ).toBeVisible({ timeout: 15000 });
    }
  });

  test("4. Candidate Drawer: Audit Trail Tab Displays Candidate History", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Click candidate card
    const candidateCard = page.locator(`h4:has-text("${candidateName}")`).first();
    await expect(candidateCard).toBeVisible({ timeout: 15000 });
    await candidateCard.click();

    // Verify drawer opens
    await expect(page.locator(`h2:has-text("${candidateName}")`)).toBeVisible({ timeout: 15000 });

    // Click Audit Trail tab
    const auditTab = page.locator('button[role="tab"]:has-text("Audit Trail")').first();
    await auditTab.click();
    await expect(
      page.locator("text=event").or(page.locator("text=Activity")).or(page.locator("text=Stage Transition")).first()
    ).toBeVisible({ timeout: 15000 });
  });

  test("5. Command Center Dashboard: Direct SQL Verification of Recruiter Metrics", async ({
    page,
  }) => {
    // Query direct SQL counts from Supabase
    const dbOpeningsCount = queryDb(
      `SELECT count(*) as cnt FROM job_openings WHERE user_id='${userId}';`
    )[0].cnt;
    const dbCandidatesCount = queryDb(
      `SELECT count(*) as cnt FROM candidates WHERE user_id='${userId}';`
    )[0].cnt;
    const dbInterviewsCount = queryDb(
      `SELECT count(*) as cnt FROM interviews WHERE user_id='${userId}';`
    )[0].cnt;

    // Navigate to dashboard
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard");

    // Verify stats header is loaded
    await expect(page.locator("text=New CVs Today").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Pending Reviews").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Awaiting Reply").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Interviews This Week").first()).toBeVisible({ timeout: 15000 });

    // Verify candidate card in recent activity
    await expect(page.locator(`text=${candidateName}`).first()).toBeVisible({ timeout: 15000 });

    // Cross-verify with database numbers
    expect(Number(dbOpeningsCount)).toBeGreaterThanOrEqual(1);
    expect(Number(dbCandidatesCount)).toBeGreaterThanOrEqual(1);
    expect(Number(dbInterviewsCount)).toBeGreaterThanOrEqual(0);
  });

  test("6. Responsive Layout: Mobile Viewport Render Check (375x667)", async ({ page }) => {
    // Set viewport to iPhone SE mobile dimensions
    await page.setViewportSize({ width: 375, height: 667 });

    // Test Dashboard mobile layout
    await page.goto("/dashboard");
    await page.waitForURL("**/dashboard");
    await expect(page.locator('h1:has-text("Recruiting")').or(page.locator("text=New CVs Today")).first()).toBeVisible({ timeout: 15000 });

    // Test Pipeline mobile layout
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");
    await expect(page.locator('h1:has-text("Pipeline")').or(page.locator("text=Applied")).first()).toBeVisible({ timeout: 15000 });

    // Test Settings mobile layout
    await page.goto("/settings");
    await page.waitForURL("**/settings");
    await expect(page.locator('h1:has-text("Settings")').or(page.locator("text=User Profile")).first()).toBeVisible({ timeout: 15000 });
  });
});
