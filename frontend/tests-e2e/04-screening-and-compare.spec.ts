import { test, expect } from "@playwright/test";
import { queryDb } from "./helpers/db-helper";

const SUITE_ID = Date.now();
const recruiterEmail = `screening_test_${SUITE_ID}@example.com`;
const password = "Password123!";
const openingTitle = `Senior Backend Engineer ${SUITE_ID}`;

const candidateAName = `Maya Lin ${SUITE_ID}`;
const candidateAEmail = `maya_${SUITE_ID}@example.com`;
const candidateACv = `Staff Backend Engineer with 7 years of deep production experience with Go, Kubernetes, PostgreSQL, microservices, and distributed systems. Expert in Docker, REST APIs, and database performance tuning.`;

const candidateBName = `Ethan Hall ${SUITE_ID}`;
const candidateBEmail = `ethan_${SUITE_ID}@example.com`;
const candidateBCv = `Junior Developer with 1 year of experience in Python, HTML, CSS, and basic SQL. Looking for growth opportunities in backend development.`;

test.describe("04. AI Screening, Questions & Candidate Compare Studio", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90000);

  let openingId = "";
  let candidateAId = "";
  let candidateBId = "";

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

  test("0. Setup Requisition and Candidates", async ({ page }) => {
    // 1. Create Requisition
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
      "#description",
      "We are seeking an experienced Backend Engineer skilled in Go, Kubernetes, PostgreSQL, Docker, and distributed systems architecture."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 45000 });
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible({ timeout: 15000 });

    const dbOpenings = queryDb(`SELECT id FROM job_openings WHERE title='${openingTitle}';`);
    expect(dbOpenings.length).toBe(1);
    openingId = dbOpenings[0].id;

    // 2. Add Candidate A (Strong Match)
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    await page.click("#btn-sidebar-add-candidate");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.click("#tab-paste-cv");
    await page.selectOption("#text-opening", openingId);
    await page.fill("#text-name", candidateAName);
    await page.fill("#text-email", candidateAEmail);
    await page.fill("#text-cv", candidateACv);
    await page.click('button[type="submit"]:has-text("Save Candidate")');
    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    // 3. Add Candidate B (Partial/Junior Match)
    await page.click("#btn-sidebar-add-candidate");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.click("#tab-paste-cv");
    await page.selectOption("#text-opening", openingId);
    await page.fill("#text-name", candidateBName);
    await page.fill("#text-email", candidateBEmail);
    await page.fill("#text-cv", candidateBCv);
    await page.click('button[type="submit"]:has-text("Save Candidate")');
    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    // Retrieve Candidate IDs from Supabase
    const dbCandidates = queryDb(
      `SELECT id, name FROM candidates WHERE opening_id='${openingId}' ORDER BY created_at ASC;`
    );
    expect(dbCandidates.length).toBe(2);
    candidateAId = dbCandidates[0].id;
    candidateBId = dbCandidates[1].id;
  });

  test("1. AI Fit Screening: Screen Candidate -> Verify ScoreRing, Skills & Supabase", async ({
    page,
  }) => {
    await page.goto("/screening");
    await page.waitForURL("**/screening");

    // Select Candidate A
    const candidateSelect = page.locator("select").first();
    await candidateSelect.selectOption(candidateAId);

    // Verify candidate name in header
    await expect(page.locator(`h3:has-text("${candidateAName}")`).or(page.locator(`div:has-text("${candidateAName}")`)).first()).toBeVisible();

    // Click Run AI Screen
    const screenBtn = page.locator('button:has-text("Run AI Screen"), button:has-text("Re-Screen with AI")').first();
    await expect(screenBtn).toBeVisible();
    await screenBtn.click();

    // Expect screening toast
    await expect(page.locator("text=Candidate Screened").first()).toBeVisible({ timeout: 45000 });

    // Verify matched skills appear in UI
    await expect(page.locator("text=Matched Skills").first()).toBeVisible();

    // Query Supabase directly to verify score, matched_skills, and summary
    const dbRows = queryDb(
      `SELECT score, matched_skills, missing_skills, summary FROM candidates WHERE id='${candidateAId}';`
    );
    expect(dbRows.length).toBe(1);
    expect(dbRows[0].score).not.toBeNull();
    const scoreVal = Number(dbRows[0].score);
    expect(scoreVal).toBeGreaterThan(0);
    expect(scoreVal).toBeLessThanOrEqual(100);
    expect(dbRows[0].matched_skills.length).toBeGreaterThan(0);
    expect(dbRows[0].summary).toBeTruthy();
  });

  test("2. Question Studio: Generate 5 Tailored Questions -> Copy to Clipboard", async ({
    page,
  }) => {
    await page.goto("/screening");
    await page.waitForURL("**/screening");

    // Select Candidate A
    const candidateSelect = page.locator("select").first();
    await candidateSelect.selectOption(candidateAId);

    // Click Generate Interview Questions
    const questionsBtn = page.locator('button:has-text("Generate Interview Questions")');
    await expect(questionsBtn).toBeVisible();
    await questionsBtn.click();

    // Expect Questions Ready toast
    await expect(page.locator("text=Questions Ready").first()).toBeVisible({ timeout: 45000 });

    // Verify list of questions is rendered
    await expect(page.locator("text=Tailored Screening Questions").first()).toBeVisible({ timeout: 10000 });
    const questionItems = page.locator("p.font-medium.text-foreground");
    await expect(questionItems.first()).toBeVisible();
    const count = await questionItems.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Test copy button
    const copyBtn = page.locator('button[title="Copy question"]').first();
    await copyBtn.click({ force: true });
    await expect(page.locator("text=Question copied to clipboard").or(page.locator("text=Copied")).first()).toBeVisible({ timeout: 10000 });
  });

  test("3. Candidate Compare Studio: Side-by-Side Analysis -> Advance Candidate", async ({
    page,
  }) => {
    await page.goto("/compare");
    await page.waitForURL("**/compare");

    // Explicitly select Candidate A and Candidate B
    const selects = page.locator("select");
    await selects.nth(1).selectOption(candidateAId);
    await selects.nth(2).selectOption(candidateBId);

    // Requisition comparison cards should be visible
    await expect(page.locator(`h3:has-text("${candidateAName}")`).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`h3:has-text("${candidateBName}")`).first()).toBeVisible({ timeout: 15000 });

    // Verify Candidate A details in column
    await expect(page.locator(`h5:has-text("AI Executive Summary")`).first()).toBeVisible();

    // Click Advance to Interview on Candidate A
    const advanceBtn = page.locator('button:has-text("Advance to Interview")').first();
    await expect(advanceBtn).toBeVisible();
    await advanceBtn.click();

    // Expect toast
    await expect(page.locator("text=Candidate Advanced").first()).toBeVisible({ timeout: 15000 });

    // Verify stage in Supabase
    const dbCandidate = queryDb(
      `SELECT stage FROM candidates WHERE id='${candidateAId}';`
    );
    expect(dbCandidate[0].stage).toBe("interview");
  });

  test("4. Bulk Scoring / Matching on Requisition Detail Page", async ({ page }) => {
    await page.goto(`/openings/${openingId}`);
    await page.waitForURL(`**/openings/${openingId}`);

    // Click Match Candidates button
    const matchBtn = page.locator('button:has-text("Match Candidates"), button:has-text("Matching...")').first();
    await expect(matchBtn).toBeVisible();
    await matchBtn.click();

    // Assert Match Job Started toast
    await expect(
      page.locator("text=AI Matching Job Started").or(page.locator("text=Matching...")).first()
    ).toBeVisible({ timeout: 15000 });

    // Wait for matching to complete and update Supabase
    let matched = false;
    for (let i = 0; i < 15; i++) {
      const checkCandidates = queryDb(
        `SELECT id, name, score FROM candidates WHERE opening_id='${openingId}';`
      );
      if (checkCandidates.length === 2 && checkCandidates.some((c) => c.score !== null)) {
        matched = true;
        break;
      }
      await page.waitForTimeout(2000);
    }

    // Verify Candidate has a score recorded in Supabase
    const dbCandidates = queryDb(
      `SELECT id, name, score FROM candidates WHERE opening_id='${openingId}';`
    );
    expect(dbCandidates.length).toBe(2);
    expect(dbCandidates.some((c) => c.score !== null)).toBe(true);
  });

  test("5. Error Handling & Fallback: Graceful failure toast when AI service fails", async ({
    page,
  }) => {
    await page.goto("/screening");
    await page.waitForURL("**/screening");

    // Select Candidate A
    const candidateSelect = page.locator("select").first();
    await candidateSelect.selectOption(candidateAId);

    // Intercept scoring API call with 500 error simulating upstream failure
    await page.route("**/api/v1/candidates/*/score", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "OpenRouter primary & fallback upstream timeout." }),
      });
    });

    // Click Re-Screen with AI
    const screenBtn = page.locator('button:has-text("Re-Screen with AI"), button:has-text("Run AI Screen")').first();
    await screenBtn.click();

    // Expect clear error toast
    await expect(page.locator("text=Screening Failed").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=OpenRouter primary & fallback upstream timeout.").first()).toBeVisible({ timeout: 15000 });

    // Unroute for future tests
    await page.unroute("**/api/v1/candidates/*/score");
  });
});
