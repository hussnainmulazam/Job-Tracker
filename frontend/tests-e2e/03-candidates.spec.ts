import { test, expect } from "@playwright/test";
import path from "path";
import { queryDb } from "./helpers/db-helper";

const SUITE_ID = Date.now();
const recruiterEmail = `candidate_test_${SUITE_ID}@example.com`;
const password = "Password123!";
const openingTitle = `Cloud Native Architect ${SUITE_ID}`;

const pdfCandidateName = `Alex Rivers ${SUITE_ID}`;
const pdfCandidateEmail = `alex_${SUITE_ID}@example.com`;

const textCandidateName = `Morgan Chen ${SUITE_ID}`;
const textCandidateEmail = `morgan_${SUITE_ID}@example.com`;

test.describe("03. Candidates Lifecycle, Uploads & Validation", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60000);

  let openingId = "";

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

  test("0. Setup Requisition for Candidates", async ({ page }) => {
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
      "#description",
      "Architect and implement distributed cloud infrastructure using Kubernetes, Go, Python, and PostgreSQL."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');

    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 45000 });
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible({ timeout: 15000 });

    const dbOpenings = queryDb(`SELECT id FROM job_openings WHERE title='${openingTitle}';`);
    expect(dbOpenings.length).toBe(1);
    openingId = dbOpenings[0].id;
  });

  test("1. Add Candidate via Real PDF Upload -> Verify Pipeline & Supabase", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    await page.click('#btn-sidebar-add-candidate');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.selectOption("#pdf-opening", openingId);
    await page.fill("#pdf-name", pdfCandidateName);
    await page.fill("#pdf-email", pdfCandidateEmail);

    const samplePdfPath = path.resolve(__dirname, "fixtures", "sample-resume.pdf");
    await page.locator("#file-upload").setInputFiles(samplePdfPath);
    await expect(page.locator("text=sample-resume.pdf")).toBeVisible();

    await page.click('button[type="submit"]:has-text("Upload & Create")');

    await expect(page.locator("text=Resume Extracted & Uploaded").first()).toBeVisible({ timeout: 25000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    // Verify in UI Pipeline
    await expect(page.locator(`text=${pdfCandidateName}`).first()).toBeVisible({ timeout: 15000 });

    // Verify in Supabase
    const dbCandidates = queryDb(
      `SELECT id, name, email, stage, opening_id, cv_text FROM candidates WHERE email='${pdfCandidateEmail}';`
    );
    expect(dbCandidates.length).toBe(1);
    expect(dbCandidates[0].name).toBe(pdfCandidateName);
    expect(dbCandidates[0].email).toBe(pdfCandidateEmail);
    expect(dbCandidates[0].opening_id).toBe(openingId);
    expect(dbCandidates[0].stage).toBe("applied");
  });

  test("2. Add Candidate via Pasted CV Text -> Verify Pipeline & Supabase", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    await page.click('#btn-sidebar-add-candidate');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Switch to Paste CV Text tab
    await page.click('#tab-paste-cv');

    await page.selectOption("#text-opening", openingId);
    await page.fill("#text-name", textCandidateName);
    await page.fill("#text-email", textCandidateEmail);
    await page.fill(
      "#text-cv",
      "Principal DevOps and Cloud Architect with 8 years designing Terraform, Kubernetes, and AWS infrastructure."
    );

    await page.click('button[type="submit"]:has-text("Save Candidate")');

    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    // Verify in Pipeline UI
    await expect(page.locator(`text=${textCandidateName}`).first()).toBeVisible({ timeout: 15000 });

    // Verify in Supabase
    const dbCandidates = queryDb(
      `SELECT id, name, email, stage, opening_id FROM candidates WHERE email='${textCandidateEmail}';`
    );
    expect(dbCandidates.length).toBe(1);
    expect(dbCandidates[0].name).toBe(textCandidateName);
    expect(dbCandidates[0].email).toBe(textCandidateEmail);
  });

  test("3. Duplicate Email Handling: Rejects Duplicate Email for Same Opening", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    await page.click('#btn-sidebar-add-candidate');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Try re-adding textCandidateEmail to the exact same opening
    await page.click('#tab-paste-cv');
    await page.selectOption("#text-opening", openingId);
    await page.fill("#text-name", "Duplicate Tester");
    await page.fill("#text-email", textCandidateEmail);
    await page.fill("#text-cv", "Duplicate candidate cv text content.");

    await page.click('button[type="submit"]:has-text("Save Candidate")');

    // Should display rejection message (either in toast or under email field)
    await expect(
      page.locator("text=already applied for this opening").or(page.locator("text=Creation Failed")).first()
    ).toBeVisible({ timeout: 15000 });

    // Close dialog
    await page.click('#btn-cancel-text-candidate');
    await expect(page.locator('[role="dialog"]')).toBeHidden();

    // Verify Supabase still has exactly 1 record for this email
    const dbCandidates = queryDb(
      `SELECT count(*) FROM candidates WHERE email='${textCandidateEmail}';`
    );
    expect(Number(dbCandidates[0].count)).toBe(1);
  });

  test("4. Invalid File Validation: Non-PDF, Empty File, and >10MB File", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    await page.click('#btn-sidebar-add-candidate');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.click('#tab-upload-pdf');
    await page.selectOption("#pdf-opening", openingId);
    await page.fill("#pdf-name", "Invalid Files Test");
    await page.fill("#pdf-email", `invalid_files_${SUITE_ID}@example.com`);

    // A. Non-PDF File (.txt)
    const invalidTxtPath = path.resolve(__dirname, "fixtures", "invalid.txt");
    await page.locator("#file-upload").setInputFiles(invalidTxtPath);
    await expect(page.locator("text=Only PDF files (.pdf) are supported").first()).toBeVisible({ timeout: 10000 });

    // B. Empty PDF (0 bytes)
    const emptyPdfPath = path.resolve(__dirname, "fixtures", "empty.pdf");
    await page.locator("#file-upload").setInputFiles(emptyPdfPath);
    await expect(page.locator("text=PDF file is empty (0 bytes)").first()).toBeVisible({ timeout: 10000 });

    // C. Oversized PDF (>10MB)
    const oversizedPdfPath = path.resolve(__dirname, "fixtures", "oversized.pdf");
    await page.locator("#file-upload").setInputFiles(oversizedPdfPath);
    await expect(page.locator("text=File size exceeds 10MB limit").first()).toBeVisible({ timeout: 10000 });

    await page.click('#btn-cancel-pdf-candidate');
    await expect(page.locator('[role="dialog"]')).toBeHidden();
  });

  test("5. Candidate Drawer: View Tabs, Edit Stage -> Verify Persistence in Supabase", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Click candidate name to open Drawer
    const candidateName = page.locator(`h4:has-text("${pdfCandidateName}")`).first();
    await expect(candidateName).toBeVisible({ timeout: 15000 });
    await candidateName.click();

    // Verify Candidate Drawer is open
    await expect(page.locator(`h2:has-text("${pdfCandidateName}")`)).toBeVisible({ timeout: 15000 });

    // Check tabs
    await expect(page.locator('button[role="tab"]:has-text("AI Fit & Skills")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Screening Questions")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Scorecards")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Raw CV")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Audit Trail")')).toBeVisible();

    // Change stage to "screening"
    const stageSelect = page.locator("#candidate-stage-select");
    await stageSelect.selectOption("screening");

    // Toast confirmation
    await expect(page.locator("text=Stage Updated").first()).toBeVisible({ timeout: 10000 });

    // Close drawer
    await page.keyboard.press("Escape");

    // Verify in Supabase
    const dbCandidates = queryDb(
      `SELECT stage FROM candidates WHERE email='${pdfCandidateEmail}';`
    );
    expect(dbCandidates[0].stage).toBe("screening");
  });

  test("6. Candidate Deletion: Delete Candidate -> Verify UI & Supabase", async ({ page }) => {
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Click candidate name to open drawer
    const candidateName = page.locator(`h4:has-text("${pdfCandidateName}")`).first();
    await expect(candidateName).toBeVisible({ timeout: 15000 });
    await candidateName.click();
    await expect(page.locator(`h2:has-text("${pdfCandidateName}")`)).toBeVisible({ timeout: 15000 });

    // Click Delete in Drawer
    page.on("dialog", (dialog) => dialog.accept());
    const deleteBtn = page.locator('button[title="Delete Candidate"]');
    await deleteBtn.click();

    await expect(page.locator("text=Candidate Deleted").first()).toBeVisible({ timeout: 15000 });

    // Candidate card should disappear from Pipeline UI
    await expect(page.locator(`[data-candidate-name="${pdfCandidateName}"]`)).toBeHidden({ timeout: 15000 });

    // Verify candidate row deleted from Supabase
    const dbCandidates = queryDb(
      `SELECT count(*) FROM candidates WHERE email='${pdfCandidateEmail}';`
    );
    expect(Number(dbCandidates[0].count)).toBe(0);
  });
});
