import { test, expect } from "@playwright/test";
import { queryDb } from "./helpers/db-helper";

test.describe("01. Authentication, Sessions & Route Protection", () => {
  test.setTimeout(120000);

  const timestamp = Date.now();
  const recruiterEmail = `auth_test_${timestamp}@example.com`;
  const password = "Password123!";

  test("Register -> Store JWT -> Verify in Supabase -> Redirect to Dashboard", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveTitle(/TalentFlow|Job Tracker/i);

    await page.fill("#email", recruiterEmail);
    await page.fill("#password", password);
    await page.fill("#confirmPassword", password);
    await page.click('button[type="submit"]:has-text("Create Account")');

    await page.waitForURL("**/dashboard", { timeout: 25000 });
    await expect(page.locator("h1")).toContainText(/Command Center|Dashboard/i);

    // Verify user row exists in Supabase
    const userRows = queryDb(`SELECT id, email, created_at FROM users WHERE email='${recruiterEmail}';`);
    expect(userRows.length).toBe(1);
    expect(userRows[0].email).toBe(recruiterEmail);
  });

  test("Logout -> Clear auth token -> Redirect to Login", async ({ page }) => {
    // First login
    await page.goto("/login");
    await page.fill("#email", recruiterEmail);
    await page.fill("#password", password);
    await page.click('button[type="submit"]:has-text("Sign in")');
    await page.waitForURL("**/dashboard", { timeout: 25000 });

    // Open User profile menu or click Sign Out
    await page.goto("/settings");
    await page.waitForURL("**/settings");
    const logoutBtn = page.locator('button:has-text("Sign Out"), button:has-text("Log out")').first();
    await expect(logoutBtn).toBeVisible({ timeout: 15000 });
    await logoutBtn.click();

    await page.waitForURL("**/login", { timeout: 15000 });
    await expect(page.locator("h3:has-text('Welcome back')")).toBeVisible();

    // Verify token removed from localStorage
    const storedToken = await page.evaluate(() => localStorage.getItem("job_tracker_token") || localStorage.getItem("access_token"));
    expect(storedToken).toBeNull();
  });

  test("Login with Valid Credentials vs Invalid Credentials", async ({ page }) => {
    await page.goto("/login");

    // 1. Invalid attempt
    await page.fill("#email", recruiterEmail);
    await page.fill("#password", "WrongPassword999!");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Invalid email or password")).toBeVisible({ timeout: 10000 });

    // 2. Valid attempt
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard", { timeout: 25000 });
    await expect(page.locator("h1")).toContainText(/Command Center|Dashboard/i);
  });

  test("Protected Routes: Unauthenticated access redirects to /login", async ({ browser }) => {
    // New incognito context with zero cookies or tokens
    const context = await browser.newContext();
    const page = await context.newPage();

    const protectedPaths = [
      "/dashboard",
      "/pipeline",
      "/inbox",
      "/interviews",
      "/openings",
      "/screening",
      "/compare",
      "/settings",
    ];

    for (const path of protectedPaths) {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 10000 });
      expect(page.url()).toContain("/login");
    }

    await context.close();
  });
});
