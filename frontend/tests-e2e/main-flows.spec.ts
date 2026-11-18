import { test, expect } from "@playwright/test";

test.describe("Recruiting Copilot Full SaaS Lifecycle", () => {
  test.setTimeout(120000); // 2 minutes for full flow

  test("1. Full Recruiter Journey: Register -> Dashboard -> Requisition -> Add Candidate -> Pipeline -> Candidate Drawer -> Compare -> Settings -> Logout", async ({
    page,
  }) => {
    const timestamp = Date.now();
    const testEmail = `recruiter_${timestamp}@example.com`;
    const testPassword = "Password123!";
    const testOpening = `Staff Distributed Systems Engineer ${timestamp}`;
    const candidateName = `Elena Rostova ${timestamp}`;

    // ── 1. Register Recruiter Account ─────────────────────────────────
    await page.goto("/register");
    await expect(page).toHaveTitle(/TalentFlow|Job Tracker/i);

    await page.fill("#email", testEmail);
    await page.fill("#password", testPassword);
    await page.fill("#confirmPassword", testPassword);
    await page.click('button[type="submit"]:has-text("Create Account")');

    // Wait for auto-redirect to /dashboard
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    await expect(page.locator("h1")).toContainText(/Command Center|Dashboard/i);

    // ── 2. Verify Recruiter Metric Cards ──────────────────────────────
    await expect(page.locator("text=Active Requisitions")).toBeVisible();
    await expect(page.locator("text=Total Candidates")).toBeVisible();
    await expect(page.locator("text=Avg Fit Score")).toBeVisible();
    await expect(page.locator("text=Shortlisted Talent")).toBeVisible();

    // ── 3. Create a Job Requisition ───────────────────────────────────
    await page.click('nav a[href="/openings"], a:has-text("Requisitions")');
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", testOpening);
    await page.fill(
      "#description",
      "Architect resilient distributed backend systems with Python, FastAPI, and PostgreSQL."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');

    // Confirm requisition card appears
    await expect(page.locator(`text=${testOpening}`)).toBeVisible({ timeout: 15000 });

    // ── 4. Navigate to Pipeline & Add Candidate ────────────────────────
    await page.click('nav a[href="/pipeline"], a:has-text("Pipeline")');
    await page.waitForURL("**/pipeline");

    await page.click('button:has-text("Add Candidate")');

    // Switch to Text paste tab
    await page.click('button[role="tab"]:has-text("Paste CV Text")');
    await page.fill("#text-name", candidateName);
    await page.fill("#text-email", `elena_${timestamp}@example.com`);
    await page.fill(
      "#text-cv",
      "Senior backend software engineer with 7+ years of experience in Python, FastAPI, PostgreSQL, and distributed streaming architectures."
    );
    await page.click('button[type="submit"]:has-text("Save Candidate")');

    // Wait for candidate card to appear on Kanban board
    const card = page.locator(`[data-testid="kanban-card"][data-candidate-name="${candidateName}"]`);
    await expect(card).toBeVisible({ timeout: 15000 });

    // ── 5. Open Candidate Detail Drawer & Run Actions ─────────────────
    await card.click();
    await expect(page.locator("h2")).toContainText(candidateName);

    // Run AI Screening
    const screenBtn = page.locator('button:has-text("Run AI Screening")');
    if (await screenBtn.isVisible()) {
      await screenBtn.click();
      // Wait for AI scoring response
      await expect(
        page.getByText("Candidate Screened", { exact: false })
      ).toBeVisible({ timeout: 70000 });
    }

    // Close Drawer
    await page.keyboard.press("Escape");

    // ── 6. Check Candidate Comparison Studio ──────────────────────────
    await page.click('nav a[href="/compare"], a:has-text("Compare")');
    await page.waitForURL("**/compare");
    await expect(page.locator("h1")).toContainText(/Comparison/i);

    // ── 7. Settings and Sign Out ───────────────────────────────────────
    await page.click('nav a[href="/settings"], a:has-text("Settings")');
    await page.waitForURL("**/settings");

    await page.click('button:has-text("Sign Out of Account")');
    await page.waitForURL("**/login", { timeout: 15000 });
    await expect(page.locator('button[type="submit"]')).toContainText(/Sign In/i);
  });

  test("2. Direct Recruiter Login with Credentials", async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `recruiterlogin_${timestamp}@example.com`;
    const testPassword = "Password123!";

    // Register user first
    await page.goto("/register");
    await page.fill("#email", testEmail);
    await page.fill("#password", testPassword);
    await page.fill("#confirmPassword", testPassword);
    await page.click('button[type="submit"]:has-text("Create Account")');
    await page.waitForURL("**/dashboard", { timeout: 20000 });

    // Logout
    await page.goto("/settings");
    await page.waitForURL("**/settings");
    await page.click('button:has-text("Sign Out of Account")');
    await page.waitForURL("**/login", { timeout: 15000 });

    // Direct Login
    await page.fill("#email", testEmail);
    await page.fill("#password", testPassword);
    await page.click('button[type="submit"]:has-text("Sign In")');

    await page.waitForURL("**/dashboard", { timeout: 20000 });
    await expect(page.locator("h1")).toContainText(/Command Center|Dashboard/i);
  });
});
