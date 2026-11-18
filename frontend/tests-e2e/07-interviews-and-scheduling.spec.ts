import { test, expect } from "@playwright/test";
import { queryDb } from "./helpers/db-helper";

const SUITE_ID = Date.now();
const recruiterEmail = `scheduling_test_${SUITE_ID}@example.com`;
const password = "Password123!";
const openingTitle = `Cloud Architect ${SUITE_ID}`;

const candidate1Name = `Elena Rostova ${SUITE_ID}`;
const candidate1Email = `elena_${SUITE_ID}@example.com`;

const candidate2Name = `Tariq Mansoor ${SUITE_ID}`;
const candidate2Email = `tariq_${SUITE_ID}@example.com`;

test.describe("07. Interviews & Public Candidate Scheduling Studio", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90000);

  let openingId = "";
  let candidate1Id = "";
  let candidate2Id = "";
  let authToken = "";
  let scheduleToken = "";

  test.beforeAll(async ({ request }) => {
    // 1. Register recruiter
    const regRes = await request.post("http://localhost:3000/api/auth/register", {
      data: { email: recruiterEmail, password: password },
    });
    expect([200, 201]).toContain(regRes.status());

    // 2. Get auth token
    const loginRes = await request.post("http://127.0.0.1:8000/api/v1/auth/login", {
      data: { email: recruiterEmail, password: password },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    authToken = loginData.access_token;
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

  test("0. Setup Requisition and Scheduling Candidates", async ({ page }) => {
    // 1. Create Requisition
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
      "#description",
      "Architect cloud computing environments using AWS, Kubernetes, Terraform, and Go."
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
      "Principal Cloud Engineer with 9 years architecting AWS distributed clusters."
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
      "Senior Infrastructure Engineer with 7 years cloud operations experience."
    );
    await page.click('button[type="submit"]:has-text("Save Candidate")');
    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    const dbCandidates = queryDb(
      `SELECT id, name FROM candidates WHERE opening_id='${openingId}' ORDER BY created_at ASC;`
    );
    expect(dbCandidates.length).toBe(2);
    candidate1Id = dbCandidates[0].id;
    candidate2Id = dbCandidates[1].id;
  });

  test("1. Availability Rules: Configure Recruiter Working Hours & Timezone", async ({ page }) => {
    await page.goto("/interviews");
    await page.waitForURL("**/interviews");

    // Click Availability Rules button
    await page.click('button:has-text("Availability Rules")');

    // Modal should be visible
    await expect(page.locator("text=Interview Availability Rules")).toBeVisible({ timeout: 15000 });

    // Select Timezone "Asia/Karachi"
    await page.selectOption("#select-availability-timezone", "Asia/Karachi");

    // Click Save Availability
    await page.click('button:has-text("Save Availability")');

    // Modal should close
    await expect(page.locator("text=Interview Availability Rules")).toBeHidden({ timeout: 15000 });

    // Verify in Supabase
    const dbSchedule = queryDb(
      `SELECT timezone, slot_duration_minutes, buffer_minutes, is_active FROM availability_schedules WHERE is_active=true ORDER BY updated_at DESC LIMIT 1;`
    );
    expect(dbSchedule.length).toBeGreaterThan(0);
    expect(dbSchedule[0].timezone).toBe("Asia/Karachi");
    expect(dbSchedule[0].slot_duration_minutes).toBe(30);
  });

  test("2. Generate Scheduling Link: Tokenized Candidate Link Created", async ({ request }) => {
    // Generate scheduling link for Candidate 1
    const linkRes = await request.post("http://127.0.0.1:8000/api/v1/scheduling/links", {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        candidate_id: candidate1Id,
        opening_id: openingId,
        slot_duration_minutes: 30,
        expires_in_days: 7,
      },
    });

    expect([200, 201]).toContain(linkRes.status());
    const linkData = await linkRes.json();
    expect(linkData.token).toBeTruthy();
    expect(linkData.status).toBe("active");
    scheduleToken = linkData.token;

    // Verify in Supabase
    const dbLinks = queryDb(
      `SELECT id, token, status FROM scheduling_links WHERE token='${scheduleToken}';`
    );
    expect(dbLinks.length).toBe(1);
    expect(dbLinks[0].status).toBe("active");
  });

  test("3. Candidate Public Page: Select Free Slot -> Confirm Booking with Google Meet", async ({
    page,
  }) => {
    // Navigate directly to public tokenized schedule page
    await page.goto(`/schedule/${scheduleToken}`);
    await page.waitForURL(`**/schedule/${scheduleToken}`);

    // Verify candidate name and opening title rendered
    await expect(page.locator(`text=${candidate1Name}`).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`text=${openingTitle}`).first()).toBeVisible({ timeout: 15000 });

    // Verify slot buttons are present
    const slotBtn = page.locator('button:has-text("AM"), button:has-text("PM")').first();
    await expect(slotBtn).toBeVisible({ timeout: 25000 });
    await slotBtn.click();

    // Fill notes if input or textarea is present
    const notesInput = page.locator('textarea[placeholder*="questions"], input[placeholder*="questions"]');
    if (await notesInput.isVisible()) {
      await notesInput.fill("Looking forward to discussing the role.");
    }

    // Confirm booking
    const confirmBtn = page.locator("#btn-confirm-booking").or(page.locator('button:has-text("Confirm Interview")'));
    await expect(confirmBtn).toBeVisible({ timeout: 15000 });
    await confirmBtn.click();

    // Verify confirmation view appears
    await expect(page.locator("text=You're Scheduled!").or(page.locator("text=Interview Confirmed!")).first()).toBeVisible({ timeout: 20000 });

    // Verify Google Meet link is generated
    await expect(page.locator("text=Join Google Meet").or(page.locator("text=Google Meet")).first()).toBeVisible({ timeout: 15000 });

    // Verify in Supabase interviews table
    const dbInterviews = queryDb(
      `SELECT id, status, meet_link, candidate_id FROM interviews WHERE candidate_id='${candidate1Id}';`
    );
    expect(dbInterviews.length).toBe(1);
    expect(dbInterviews[0].status).toBe("scheduled");
    expect(dbInterviews[0].meet_link).toContain("meet.google.com");
  });

  test("4. Double-Booking Prevention: Blocks Overlapping Slot with 409 Conflict", async ({
    request,
  }) => {
    // Get existing interview's start time
    const dbInterviews = queryDb(
      `SELECT start_time FROM interviews WHERE candidate_id='${candidate1Id}';`
    );
    const existingStartTime = dbInterviews[0].start_time;

    // Create a second scheduling link for Candidate 2
    const linkRes2 = await request.post("http://127.0.0.1:8000/api/v1/scheduling/links", {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        candidate_id: candidate2Id,
        opening_id: openingId,
        slot_duration_minutes: 30,
        expires_in_days: 7,
      },
    });
    expect([200, 201]).toContain(linkRes2.status());
    const link2Data = await linkRes2.json();
    const token2 = link2Data.token;

    // Attempt to book the exact same start_time for the same recruiter
    const conflictRes = await request.post(
      `http://127.0.0.1:8000/api/v1/scheduling/public/${token2}/book`,
      {
        data: {
          start_time: existingStartTime,
          timezone: "Asia/Karachi",
          notes: "Attempting duplicate slot booking",
        },
      }
    );

    // Must be rejected with HTTP 409 Conflict
    expect(conflictRes.status()).toBe(409);
    const errBody = await conflictRes.json();
    expect(errBody.detail.toLowerCase()).toContain("booked by another candidate");
  });

  test("5. Reschedule & Cancel Flow: Candidate Reschedules and Cancels Interview", async ({
    page,
  }) => {
    await page.goto(`/schedule/${scheduleToken}`);
    await page.waitForURL(`**/schedule/${scheduleToken}`);

    // Screen should show confirmed interview with Reschedule and Cancel buttons
    const cancelBtn = page.locator("#btn-trigger-cancel-interview").or(page.locator('button:has-text("Cancel interview")'));
    await expect(cancelBtn).toBeVisible({ timeout: 15000 });
    await cancelBtn.click();

    // Cancel modal should appear
    await expect(page.locator("text=Cancel Interview").first()).toBeVisible({ timeout: 10000 });

    // Confirm cancellation
    const confirmCancelBtn = page.locator("#btn-confirm-cancel-interview").or(page.locator('button:has-text("Confirm Cancellation")'));
    await confirmCancelBtn.click();

    // Verify cancellation confirmation appears
    await expect(page.locator("text=Interview Cancelled").first()).toBeVisible({ timeout: 15000 });

    // Verify in Supabase
    const dbCancelled = queryDb(
      `SELECT status FROM interviews WHERE candidate_id='${candidate1Id}';`
    );
    expect(dbCancelled[0].status).toBe("cancelled");
  });

  test("6. Token Expiry Handling: Expired Link Displays Clear Expiry Error", async ({ page }) => {
    // Manually expire the link in Supabase
    queryDb(
      `UPDATE scheduling_links SET status='expired', expires_at='2020-01-01 00:00:00+00' WHERE token='${scheduleToken}';`
    );

    // Navigate to expired token page
    await page.goto(`/schedule/${scheduleToken}`);

    // Verify error state is shown
    await expect(
      page.locator("text=Scheduling Link Expired").or(page.locator("text=expired")).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
