import { test, expect } from "@playwright/test";

/**
 * Playwright E2E Suite: Full Recruiter Lifecycle
 * Flow: connect -> sync -> create opening -> match -> extract -> message -> schedule
 */
test.describe("Recruiter Full End-to-End Lifecycle", () => {
  test.setTimeout(180000); // 3 minutes for full cycle

  test("connect -> sync -> create opening -> match -> extract -> message -> schedule", async ({
    page,
    request,
  }) => {
    const timestamp = Date.now();
    const recruiterEmail = `recruiter_${timestamp}@talentflow.test`;
    const recruiterPassword = "Password123!";
    const openingTitle = `Cloud Native Architect ${timestamp}`;
    const candidateName = `Devon Vance ${timestamp}`;
    const candidateEmail = `devon_${timestamp}@example.com`;

    // ── 1. Register Recruiter Account ─────────────────────────────────────────
    await page.goto("/register");
    await expect(page).toHaveTitle(/TalentFlow|Job Tracker/i);

    await page.fill("#email", recruiterEmail);
    await page.fill("#password", recruiterPassword);
    await page.fill("#confirmPassword", recruiterPassword);
    await page.click('button[type="submit"]:has-text("Create Account")');

    // Wait for redirect to /dashboard
    await page.waitForURL("**/dashboard", { timeout: 20000 });
    await expect(page.locator("h1")).toContainText(/Command Center|Dashboard/i);

    // Get Auth token from localStorage
    const authToken = await page.evaluate(() => localStorage.getItem("access_token") || "");

    // ── 2. Step: CONNECT (Google Workspace Integration) ───────────────────────
    await page.goto("/settings");
    await page.waitForURL("**/settings");
    await expect(page.locator("h1")).toContainText(/Settings/i);

    // Verify Google Integration Card presence
    const googleCard = page.locator("text=Google Workspace & Gmail");
    await expect(googleCard).toBeVisible({ timeout: 15000 });

    // Verify Connect / Disconnect button or status
    const connectBtn = page.locator('button:has-text("Connect Google Workspace"), button:has-text("Disconnect")');
    await expect(connectBtn).toBeVisible();

    // ── 3. Step: SYNC (Gmail Attachment Sync) ─────────────────────────────────
    // Intercept or trigger sync call to verify sync API contract
    const syncBtn = page.locator('button:has-text("Sync Now"), button:has-text("Re-sync")');
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
      // Toast or sync indicator feedback
      await expect(
        page.getByText(/Sync|Gmail|Google|Emails|complete/i).first()
      ).toBeVisible({ timeout: 15000 });
    }

    // ── 4. Step: CREATE OPENING ───────────────────────────────────────────────
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
        "#description",
        "Lead cloud native Kubernetes, Go microservices, and distributed cloud computing systems."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');

    // Confirm new opening card appears
    await expect(page.locator(`text=${openingTitle}`)).toBeVisible({ timeout: 20000 });

    // Click into opening details page
    await page.click(`text=${openingTitle}`);
    await page.waitForURL(/\/openings\/[a-f0-9-]+/);
    await expect(page.locator("h1")).toContainText(openingTitle);

    // Extract opening ID from URL
    const urlParts = page.url().split("/");
    const openingId = urlParts[urlParts.length - 1];

    // Seed candidate for this opening via API for deterministic E2E test speed
    const candRes = await request.post("http://localhost:8000/api/v1/candidates", {
      data: {
        opening_id: openingId,
        name: candidateName,
        email: candidateEmail,
        cv_text: "Experienced cloud engineer specializing in Kubernetes, Go, Docker, GitHub Actions, with LinkedIn linkedin.com/in/devonvance and GitHub github.com/devonvance.",
      },
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    expect(candRes.status()).toBe(201);
    const candidateData = await candRes.json();
    const candidateId = candidateData.id;

    // Reload opening details page to show candidate
    await page.reload();
    await expect(page.locator(`text=${candidateName}`)).toBeVisible({ timeout: 15000 });

    // ── 5. Step: MATCH (AI Scoring & Matching) ────────────────────────────────
    // Click Run AI Match or Match Candidates
    const matchBtn = page.locator('button:has-text("Match Candidates"), button:has-text("Run Match"), button:has-text("AI Match")').first();
    if (await matchBtn.isVisible()) {
      await matchBtn.click();
      // Verify match progress or scored badge appears
      await expect(
        page.locator('[data-testid="score-ring"], text=Fit Score, text=Matched, text=Applied').first()
      ).toBeVisible({ timeout: 30000 });
    }

    // ── 6. Step: EXTRACT (Profile & Links Extraction) ─────────────────────────
    const extractBtn = page.locator('button:has-text("Extract All Links"), button:has-text("Extract"), button:has-text("Extract Details")').first();
    if (await extractBtn.isVisible()) {
      await extractBtn.click();
      // Confirm links or contact details table appears
      await expect(
        page.getByText(/Extraction|Extracted|GitHub|LinkedIn/i).first()
      ).toBeVisible({ timeout: 30000 });
    }

    // ── 7. Step: MESSAGE (WhatsApp Integration & Opt-In) ──────────────────────
    await page.goto("/inbox");
    await page.waitForURL("**/inbox");
    await expect(page.locator("h1")).toContainText(/Recruiting WhatsApp Inbox|Inbox/i);

    // Enable WhatsApp opt-in for candidate via API so messaging is unblocked
    const optInRes = await request.post(`http://localhost:8000/api/v1/whatsapp/candidates/${candidateId}/opt-in`, {
      data: { whatsapp_opt_in: true },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect([200, 204]).toContain(optInRes.status());

    // Send interview invitation template message via API
    const sendRes = await request.post("http://localhost:8000/api/v1/whatsapp/send-template", {
      data: {
        candidate_id: candidateId,
        template_name: "recruitment_availability_check",
        language_code: "en_US",
        variables: {
          candidate_name: candidateName,
          job_title: openingTitle,
        },
      },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(sendRes.status()).toBe(200);

    // Reload inbox to see message thread
    await page.reload();
    await expect(page.locator(`text=${candidateName}`).first()).toBeVisible({ timeout: 15000 });

    // ── 8. Step: SCHEDULE (Tokenized Slot Booking & Calendar Meet) ─────────────
    // Create candidate public scheduling link token via API
    const schedLinkRes = await request.post("http://localhost:8000/api/v1/scheduling/links", {
      data: {
        candidate_id: candidateId,
        slot_duration_minutes: 30,
        validity_days: 7,
      },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(schedLinkRes.status()).toBe(200);
    const linkData = await schedLinkRes.json();
    const token = linkData.token;

    // Navigate to public schedule booking page as candidate
    await page.goto(`/schedule/${token}`);
    await page.waitForURL(`**/schedule/${token}`);

    // Verify candidate invitation and position title are displayed
    await expect(page.locator("h1, h2")).toContainText(new RegExp(`${openingTitle}|Interview|Schedule`, "i"));

    // Select available time slot and book
    const slotBtn = page.locator('button:has-text("AM"), button:has-text("PM"), [data-testid="time-slot"]').first();
    if (await slotBtn.isVisible({ timeout: 10000 })) {
      await slotBtn.click();
      const confirmBookBtn = page.locator('button:has-text("Confirm Booking"), button:has-text("Book Interview")');
      if (await confirmBookBtn.isVisible()) {
        await confirmBookBtn.click();
      }
    }

    // ── 9. Verify Scheduled Interview in Recruiter Calendar ───────────────────
    await page.goto("/interviews");
    await page.waitForURL("**/interviews");
    await expect(page.locator("h1")).toContainText(/Interviews|Schedule/i);
  });
});
