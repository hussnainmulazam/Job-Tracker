import { test, expect } from "@playwright/test";
import { queryDb } from "./helpers/db-helper";

test.describe("02. Job Requisitions, AI JD Extraction & Status Lifecycle", () => {
  test.setTimeout(180000);

  const timestamp = Date.now();
  const recruiterEmail = `req_recruiter_${timestamp}@example.com`;
  const password = "Password123!";
  const openingTitle = `Principal Distributed Systems Engineer ${timestamp}`;
  const jdText = "Architect and scale distributed event-driven systems using Go, Kafka, PostgreSQL, and Kubernetes.";

  test.beforeAll(async ({ request }) => {
    // Register recruiter via API for clean test speed
    const regRes = await request.post("http://localhost:3000/api/auth/register", {
      data: { email: recruiterEmail, password: password },
    });
    expect([200, 201]).toContain(regRes.status());
  });

  test.beforeEach(async ({ page }) => {
    // Authenticate session before every test
    await page.goto("/login");
    await page.fill("#email", recruiterEmail);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 25000 });
  });

  test("Create Requisition -> AI JD Extraction -> Verify in Supabase", async ({ page }) => {
    // Go to Openings
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    // Click New Requisition
    await page.click('button:has-text("New Requisition")');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill form
    await page.fill("#title", openingTitle);
    await page.fill("#description", jdText);

    // Add a custom skill tag
    await page.fill('input[placeholder*="Add skill"]', "Kafka");
    await page.click('#btn-add-skill');
    await expect(page.locator("span:has-text('Kafka')")).toBeVisible();

    // Submit
    await page.click('button[type="submit"]:has-text("Create Requisition")');

    // Dialog closes
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 45000 });

    // Verify requisition card in UI
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`div:has-text("Active")`).first()).toBeVisible();

    // Verify row in Supabase
    const dbOpenings = queryDb(
      `SELECT id, title, description, status, required_skills, user_id FROM job_openings WHERE title='${openingTitle}';`
    );
    expect(dbOpenings.length).toBe(1);
    expect(dbOpenings[0].title).toBe(openingTitle);
    expect(dbOpenings[0].status).toBe("active");
    expect(JSON.stringify(dbOpenings[0].required_skills)).toContain("Kafka");
  });

  test("Search Requisitions & Status Filter", async ({ page }) => {
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    // Search box
    const searchInput = page.locator('input[placeholder*="Search requisitions"]');
    await searchInput.fill(openingTitle);
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible();

    // Negative search
    await searchInput.fill("NonExistentRoleXYZ999");
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeHidden();

    // Clear search
    await searchInput.fill("");
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible();
  });

  test("Edit Requisition & Close -> Verify UI & Supabase", async ({ page }) => {
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    // Click Edit button on opening card
    const editBtn = page.locator('button[title="Edit Requisition"]').first();
    await editBtn.click();
    await expect(page.locator("text=Edit Job Requisition")).toBeVisible();

    // Change status to closed
    await page.selectOption("#edit-status", "closed");
    await page.click('button[type="submit"]:has-text("Save Changes")');

    // Dialog closes
    await expect(page.locator("text=Edit Job Requisition")).toBeHidden({ timeout: 15000 });

    // Verify Closed badge in UI
    await expect(page.locator(`div:has-text("Closed")`).first()).toBeVisible({ timeout: 15000 });

    // Verify in Supabase
    const dbOpenings = queryDb(`SELECT id, status FROM job_openings WHERE title='${openingTitle}';`);
    expect(dbOpenings.length).toBe(1);
    expect(dbOpenings[0].status).toBe("closed");
  });

  test("Delete Requisition -> Verify Deletion in UI & Supabase", async ({ page }) => {
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    // Click delete on opening card
    page.on("dialog", (dialog) => dialog.accept());
    const deleteBtn = page.locator('button[title="Delete Requisition"]').first();
    await deleteBtn.click();

    // Card should disappear
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeHidden({ timeout: 15000 });

    // Verify deleted in Supabase
    const dbOpenings = queryDb(`SELECT id FROM job_openings WHERE title='${openingTitle}';`);
    expect(dbOpenings.length).toBe(0);
  });
});
