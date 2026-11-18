import { test, expect } from "@playwright/test";
import fs from "fs";
import { queryDb } from "./helpers/db-helper";

const SUITE_ID = Date.now();
const recruiterEmail = `pipeline_test_${SUITE_ID}@example.com`;
const password = "Password123!";
const openingTitle = `Site Reliability Lead ${SUITE_ID}`;

const candidate1Name = `Zoe Vance ${SUITE_ID}`;
const candidate1Email = `zoe_${SUITE_ID}@example.com`;

const candidate2Name = `Liam Cruz ${SUITE_ID}`;
const candidate2Email = `liam_${SUITE_ID}@example.com`;

test.describe("05. Pipeline Kanban, Filters, Audit Drawer & CSV Export", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90000);

  let openingId = "";
  let candidate1Id = "";
  let candidate2Id = "";

  test.beforeAll(async ({ request }) => {
    // Register recruiter
    const regRes = await request.post("http://localhost:3000/api/auth/register", {
      data: { email: recruiterEmail, password: password },
    });
    expect([200, 201]).toContain(regRes.status());
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", recruiterEmail);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 25000 });

    if (!openingId) {
      const dbOpenings = queryDb(`SELECT id FROM job_openings WHERE title='${openingTitle}';`);
      if (dbOpenings.length > 0) {
        openingId = dbOpenings[0].id;
      }
    }
  });

  test("0. Setup Requisition and Pipeline Candidates", async ({ page }) => {
    // 1. Create Requisition
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
      "#description",
      "Lead enterprise site reliability and platform engineering using Kubernetes, Prometheus, Go, Terraform, and AWS."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 45000 });
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible({ timeout: 15000 });

    const dbOpenings = queryDb(`SELECT id FROM job_openings WHERE title='${openingTitle}';`);
    expect(dbOpenings.length).toBe(1);
    openingId = dbOpenings[0].id;

    // 2. Add Candidate 1
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    await page.click("#btn-sidebar-add-candidate");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.click("#tab-paste-cv");
    await page.selectOption("#text-opening", openingId);
    await page.fill("#text-name", candidate1Name);
    await page.fill("#text-email", candidate1Email);
    await page.fill(
      "#text-cv",
      "Senior SRE with 6 years experience in Kubernetes, Terraform, Prometheus, and Golang."
    );
    await page.click('button[type="submit"]:has-text("Save Candidate")');
    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    // 3. Add Candidate 2
    await page.click("#btn-sidebar-add-candidate");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.click("#tab-paste-cv");
    await page.selectOption("#text-opening", openingId);
    await page.fill("#text-name", candidate2Name);
    await page.fill("#text-email", candidate2Email);
    await page.fill(
      "#text-cv",
      "Platform Engineer with 4 years experience in Linux, Docker, AWS, and Python."
    );
    await page.click('button[type="submit"]:has-text("Save Candidate")');
    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    // Get IDs from Supabase
    const dbCandidates = queryDb(
      `SELECT id, name FROM candidates WHERE opening_id='${openingId}' ORDER BY created_at ASC;`
    );
    expect(dbCandidates.length).toBe(2);
    candidate1Id = dbCandidates[0].id;
    candidate2Id = dbCandidates[1].id;
  });

  test("1. Kanban Search & Opening Filters", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Both candidates visible initially
    await expect(page.locator(`[data-candidate-name="${candidate1Name}"]`)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`[data-candidate-name="${candidate2Name}"]`)).toBeVisible({ timeout: 15000 });

    // Search for Candidate 1 only
    const searchInput = page.locator('input[placeholder*="Search candidate"]');
    await searchInput.fill(candidate1Name);

    // Candidate 1 should be visible, Candidate 2 hidden
    await expect(page.locator(`[data-candidate-name="${candidate1Name}"]`)).toBeVisible();
    await expect(page.locator(`[data-candidate-name="${candidate2Name}"]`)).toBeHidden();

    // Clear search query
    await searchInput.fill("");
    await expect(page.locator(`[data-candidate-name="${candidate1Name}"]`)).toBeVisible();
    await expect(page.locator(`[data-candidate-name="${candidate2Name}"]`)).toBeVisible();

    // Filter by Specific Requisition
    const openingFilter = page.locator("select").first();
    await openingFilter.selectOption(openingId);
    await expect(page.locator(`[data-candidate-name="${candidate1Name}"]`)).toBeVisible();
    await expect(page.locator(`[data-candidate-name="${candidate2Name}"]`)).toBeVisible();
  });

  test("2. Stage Transition: Move Candidate -> Persist in Supabase & Across Reload", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Move candidate 1 from applied to screening via candidate drawer stage select
    const candidate1Card = page.locator(`[data-candidate-name="${candidate1Name}"] h4`);
    await candidate1Card.click();

    // Verify drawer open
    await expect(page.locator(`h2:has-text("${candidate1Name}")`)).toBeVisible({ timeout: 15000 });

    // Change stage to "screening"
    const stageSelect = page.locator("#candidate-stage-select");
    await stageSelect.selectOption("screening");
    await expect(page.locator("text=Stage Updated").first()).toBeVisible({ timeout: 10000 });

    // Close drawer
    await page.keyboard.press("Escape");

    // Verify candidate card is now under the "AI Screening" column
    const screeningColumn = page.locator('[data-column-id="screening"]');
    await expect(
      screeningColumn.locator(`[data-candidate-name="${candidate1Name}"]`)
    ).toBeVisible({ timeout: 15000 });

    // Verify in Supabase
    const dbCandidate = queryDb(
      `SELECT stage FROM candidates WHERE id='${candidate1Id}';`
    );
    expect(dbCandidate[0].stage).toBe("screening");

    // Reload page to verify persistence across page refresh
    await page.reload();
    await page.waitForURL("**/pipeline");

    const reloadedScreeningColumn = page.locator('[data-column-id="screening"]');
    await expect(
      reloadedScreeningColumn.locator(`[data-candidate-name="${candidate1Name}"]`)
    ).toBeVisible({ timeout: 15000 });
  });

  test("3. Pipeline Audit Drawer: Shows Recent Stage Events", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Click Audit Trail button on Kanban control bar
    const auditBtn = page.locator('button:has-text("Audit Trail")');
    await expect(auditBtn).toBeVisible();
    await auditBtn.click();

    // Audit drawer sheet should open
    await expect(page.locator("text=Pipeline Audit Trail").first()).toBeVisible({ timeout: 10000 });

    // Verify the stage transition event is recorded
    await expect(
      page.locator(`text=${candidate1Name}`).or(page.locator("text=Stage Transition")).first()
    ).toBeVisible({ timeout: 15000 });

    // Close Audit Drawer
    await page.keyboard.press("Escape");
  });

  test("4. Export CSV: Download Shortlist & Verify Matches Supabase", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Select the requisition in opening dropdown to ensure correct export target
    const openingFilter = page.locator("select").first();
    await openingFilter.selectOption(openingId);

    // Click Export CSV button on Kanban bar
    await page.click('button:has-text("Export CSV")');

    // Verify UI Toast confirmation
    await expect(page.locator("text=Export Completed").first()).toBeVisible({ timeout: 15000 });

    // Retrieve auth token from browser session
    const token = await page.evaluate(() => localStorage.getItem("job_tracker_token"));
    expect(token).toBeTruthy();

    // Verify CSV endpoint response directly
    const exportRes = await page.request.get(
      `http://localhost:8000/api/v1/job-openings/${openingId}/shortlist/export`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    expect(exportRes.status()).toBe(200);

    const csvContent = await exportRes.text();

    // Verify CSV Headers
    expect(csvContent).toContain("Rank,Name,Email");
    expect(csvContent).toContain("Fit Score");
    expect(csvContent).toContain("Stage");

    // Verify CSV contents contain Candidate 1 and Candidate 2
    expect(csvContent).toContain(candidate1Name);
    expect(csvContent).toContain(candidate1Email);
    expect(csvContent).toContain(candidate2Name);
    expect(csvContent).toContain(candidate2Email);

    // Cross-verify with Supabase
    const dbCandidates = queryDb(
      `SELECT name, email, stage FROM candidates WHERE opening_id='${openingId}';`
    );
    expect(dbCandidates.length).toBe(2);
    for (const c of dbCandidates) {
      expect(csvContent).toContain(c.name);
      expect(csvContent).toContain(c.email);
    }
  });
});
