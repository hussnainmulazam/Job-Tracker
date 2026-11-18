import { test, expect } from "@playwright/test";
import path from "path";

test.describe("Add Candidate Dialog Validation & Upload Flow", () => {
  test.setTimeout(180000); // 3 minutes

  test("Validates zero openings, placeholder selection, per-field errors, autofill protection, and real PDF + text uploads", async ({
    page,
  }) => {
    const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
    const timestamp = Date.now();
    const recruiterEmail = `recruiter_${timestamp}@example.com`;
    const password = "Password123!";
    const openingTitle = `Lead Cloud Architect ${timestamp}`;
    const pdfCandidateName = `Jordan Blake ${timestamp}`;
    const pdfCandidateEmail = `jordan_${timestamp}@example.com`;
    const textCandidateName = `Samira Patel ${timestamp}`;
    const textCandidateEmail = `samira_${timestamp}@example.com`;

    page.on("console", (msg) => console.log("BROWSER LOG:", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message, "\nSTACK:", err.stack));
    page.on("response", (resp) => {
      if (resp.url().includes("/api/")) {
        console.log(`API ${resp.status()} ${resp.url()}`);
      } else if (resp.status() >= 400) {
        console.log(`HTTP ${resp.status()} ${resp.url()}`);
      }
    });

    // ── 1. Register fresh recruiter ──────────────────────────────────────────
    await page.goto(`${BASE_URL}/register`);
    await page.fill("#email", recruiterEmail);
    await page.fill("#password", password);
    await page.fill("#confirmPassword", password);
    await page.click('button[type="submit"]:has-text("Create Account")');

    await page.waitForURL("**/dashboard", { timeout: 20000 });

    // ── 2. Test Zero Openings Case in Pipeline ────────────────────────────────
    await page.goto(`${BASE_URL}/pipeline`);
    await page.waitForURL("**/pipeline");

    await page.click('button:has-text("Add Candidate")');

    // Dialog opens
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Verify Zero Openings Warning banner
    const zeroOpeningsBanner = page.locator('text=No active job openings found. Create a job opening first');
    await expect(zeroOpeningsBanner).toBeVisible();

    const createOpeningLink = page.locator('a:has-text("Create a job opening first")');
    await expect(createOpeningLink).toBeVisible();
    expect(await createOpeningLink.getAttribute("href")).toBe("/openings");

    // Verify submit button is disabled when zero openings
    const uploadBtnDisabled = page.locator('button[type="submit"]:has-text("Upload & Create")');
    await expect(uploadBtnDisabled).toBeDisabled();

    // Close modal
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('[role="dialog"]')).toBeHidden();

    // ── 3. Create a Job Requisition ───────────────────────────────────────────
    await page.goto(`${BASE_URL}/openings`);
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
      "#description",
      "Architect and scale distributed multi-cloud services with Go, Python, and Kubernetes."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');

    // Wait for creation to complete (modal closes, card appears)
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 45000 });
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible({ timeout: 15000 });

    // ── 4. Return to Pipeline & Open Add Candidate Dialog ─────────────────────
    await page.goto(`${BASE_URL}/pipeline`);
    await page.waitForURL("**/pipeline");

    await page.click('button:has-text("Add Candidate")');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Zero openings banner should now be GONE
    await expect(zeroOpeningsBanner).toBeHidden();

    // Verify Job Opening select has placeholder and is initialized
    const openingSelect = page.locator("#pdf-opening");
    await expect(openingSelect).toBeVisible();
    await expect(openingSelect.locator('option[value=""]')).toHaveText("Select opening");

    // Value should be initialized to the created opening ID
    const selectedOpeningVal = await openingSelect.inputValue();
    expect(selectedOpeningVal).not.toBe("");

    // ── 5. Test Per-Field Validation & No Generic Toast ────────────────────────
    // Clear opening to placeholder to trigger opening validation
    await openingSelect.selectOption("");

    // Click submit without filling required fields
    const submitBtn = page.locator('button[type="submit"]:has-text("Upload & Create")');
    await submitBtn.click();

    // Verify per-field validation messages appear under their inputs
    await expect(page.locator("text=Candidate name must be at least 2 characters")).toBeVisible();
    await expect(page.locator("text=Please enter a valid email address")).toBeVisible();
    await expect(page.locator("text=Please select a job opening")).toBeVisible();
    await expect(page.locator("text=Please choose a PDF resume file to upload")).toBeVisible();

    // Verify NO generic "Missing fields: Please fill in candidate name, email, and opening" toast is shown
    await expect(page.locator("text=Missing fields")).toBeHidden();

    // ── 6. Test Browser Autofill Simulation & PDF Upload Flow ──────────────────
    // Simulate browser autofill directly in the DOM
    await page.evaluate(
      ({ name, email }) => {
        const nameInput = document.getElementById("pdf-name") as HTMLInputElement;
        const emailInput = document.getElementById("pdf-email") as HTMLInputElement;
        if (nameInput) nameInput.value = name;
        if (emailInput) emailInput.value = email;
      },
      { name: pdfCandidateName, email: pdfCandidateEmail }
    );

    // Re-select the opening
    await openingSelect.selectOption(selectedOpeningVal);

    // Attach PDF file
    const samplePdfPath = path.resolve(__dirname, "fixtures", "sample-resume.pdf");
    await page.locator("#file-upload").setInputFiles(samplePdfPath);

    // Verify filename display in dropzone
    await expect(page.locator("text=sample-resume.pdf")).toBeVisible();

    // Submit the PDF upload
    await submitBtn.click();

    // Confirm button disables during upload with loading state
    // and success toast appears
    await expect(
      page.locator("text=Resume Extracted & Uploaded")
    ).toBeVisible({ timeout: 20000 });

    // Dialog automatically closes
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 });

    // Verify candidate card appears in the pipeline
    await expect(page.locator(`text=${pdfCandidateName}`).first()).toBeVisible({ timeout: 15000 });

    // ── 7. Test Paste CV Text Tab ─────────────────────────────────────────────
    await page.click('button:has-text("Add Candidate")');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Switch to Text tab
    await page.click('button[role="tab"]:has-text("Paste CV Text")');

    // Fill in text fields
    await page.fill("#text-name", textCandidateName);
    await page.fill("#text-email", textCandidateEmail);
    await page.fill(
      "#text-cv",
      "Principal backend engineer with extensive experience in cloud distributed systems, Go, Python, PostgreSQL, and high-concurrency architectures."
    );

    // Submit text form
    await page.click('button[type="submit"]:has-text("Save Candidate")');

    // Verify success toast
    await expect(page.locator("text=Candidate Created")).toBeVisible({ timeout: 15000 });

    // Dialog closes
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 10000 });

    // Verify second candidate appears in the pipeline
    await expect(page.locator(`text=${textCandidateName}`).first()).toBeVisible({ timeout: 15000 });
  });
});
