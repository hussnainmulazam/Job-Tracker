import { test, expect } from "@playwright/test";
import { queryDb } from "./helpers/db-helper";

const SUITE_ID = Date.now();
const recruiterEmail = `inbox_test_${SUITE_ID}@example.com`;
const password = "Password123!";
const openingTitle = `Engineering Lead ${SUITE_ID}`;

const candidateName = `Kira Thorne ${SUITE_ID}`;
const candidateEmail = `kira_${SUITE_ID}@example.com`;
const candidatePhoneDigits = "1650" + SUITE_ID.toString().slice(-7);
const candidatePhone = `+${candidatePhoneDigits}`;

test.describe("06. Unified Inbox & WhatsApp Messaging Studio", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90000);

  let openingId = "";
  let candidateId = "";
  let authToken = "";

  test.beforeAll(async ({ request }) => {
    // 1. Register recruiter
    const regRes = await request.post("http://localhost:3000/api/auth/register", {
      data: { email: recruiterEmail, password: password },
    });
    expect([200, 201]).toContain(regRes.status());

    // 2. Obtain JWT auth token
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

  test("0. Setup Requisition and Candidate with Phone Number", async ({ page, request }) => {
    // 1. Create Requisition
    await page.goto("/openings");
    await page.waitForURL("**/openings");

    await page.click('button:has-text("New Requisition")');
    await page.fill("#title", openingTitle);
    await page.fill(
      "#description",
      "Lead high-growth engineering teams delivering scalable systems in Python, Go, and React."
    );
    await page.click('button[type="submit"]:has-text("Create Requisition")');
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 45000 });
    await expect(page.locator(`h3:has-text("${openingTitle}")`)).toBeVisible({ timeout: 15000 });

    const dbOpenings = queryDb(`SELECT id FROM job_openings WHERE title='${openingTitle}';`);
    expect(dbOpenings.length).toBe(1);
    openingId = dbOpenings[0].id;

    // 2. Add Candidate via Pasted Text
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
      "Engineering Manager with 10 years experience scaling distributed software teams."
    );
    await page.click('button[type="submit"]:has-text("Save Candidate")');
    await expect(page.locator("text=Candidate Created").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).toBeHidden({ timeout: 15000 });

    const dbCandidates = queryDb(
      `SELECT id FROM candidates WHERE email='${candidateEmail}';`
    );
    expect(dbCandidates.length).toBe(1);
    candidateId = dbCandidates[0].id;

    // 3. Attach Phone Number to Candidate
    const updateRes = await request.patch(`http://127.0.0.1:8000/api/v1/candidates/${candidateId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { phone: candidatePhone },
    });
    expect(updateRes.status()).toBe(200);

    const dbPhone = queryDb(
      `SELECT phone, whatsapp_opt_in FROM candidates WHERE id='${candidateId}';`
    );
    expect(dbPhone[0].phone).toBe(candidatePhone);
    expect(dbPhone[0].whatsapp_opt_in).toBe(false);
  });

  test("1. Opt-In Security Requirement: Blocks Outbound Messages when Opt-in is False", async ({
    request,
  }) => {
    // Attempt to send template message while opt_in is False
    const sendRes = await request.post("http://127.0.0.1:8000/api/v1/whatsapp/send-template", {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        candidate_id: candidateId,
        template_name: "recruitment_application_received",
        variables: {
          candidate_name: candidateName,
          job_title: openingTitle,
          company_name: "Acme Corp",
        },
      },
    });

    // Must be blocked with HTTP 400
    expect(sendRes.status()).toBe(400);
    const errBody = await sendRes.json();
    expect(errBody.detail).toContain("not opted in");

    // Set opt-in flag to True
    const optInRes = await request.post(
      `http://127.0.0.1:8000/api/v1/whatsapp/candidates/${candidateId}/opt-in`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
        data: { whatsapp_opt_in: true },
      }
    );
    expect(optInRes.status()).toBe(200);

    // Verify in Supabase
    const dbOptIn = queryDb(
      `SELECT whatsapp_opt_in FROM candidates WHERE id='${candidateId}';`
    );
    expect(dbOptIn[0].whatsapp_opt_in).toBe(true);
  });

  test("2. Send WhatsApp Template Message: Dispatches & Records in Supabase", async ({
    request,
  }) => {
    // Send pre-approved template message now that candidate is opted-in
    const sendRes = await request.post("http://127.0.0.1:8000/api/v1/whatsapp/send-template", {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        candidate_id: candidateId,
        template_name: "recruitment_application_received",
        variables: {
          candidate_name: candidateName,
          job_title: openingTitle,
          company_name: "Acme Corp",
        },
      },
    });

    expect(sendRes.status()).toBe(200);
    const msgData = await sendRes.json();
    expect(msgData.id).toBeTruthy();
    expect(msgData.direction).toBe("outbound");
    expect(msgData.message_type).toBe("template");

    // Verify in Supabase messages table
    const dbMessages = queryDb(
      `SELECT id, direction, message_type, status, body FROM messages WHERE candidate_id='${candidateId}';`
    );
    expect(dbMessages.length).toBe(1);
    expect(dbMessages[0].direction).toBe("outbound");
    expect(dbMessages[0].message_type).toBe("template");
    expect(dbMessages[0].body).toContain(candidateName);
  });

  test("3. 24-Hour Care Window Enforcement: Blocks Freeform Text when Care Window Closed", async ({
    request,
  }) => {
    // Attempt freeform message before candidate has sent any inbound message
    const sendRes = await request.post("http://127.0.0.1:8000/api/v1/whatsapp/send-freeform", {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        candidate_id: candidateId,
        message: "Hi Kira, quick question about your start date.",
      },
    });

    // Must be blocked because 24h care window is closed
    expect(sendRes.status()).toBe(400);
    const errBody = await sendRes.json();
    expect(errBody.detail).toContain("24-hour");
  });

  test("4. Webhook Handshake & Inbound Message Simulation: Opens 24h Care Window", async ({
    request,
  }) => {
    // A. Meta Webhook Handshake (GET)
    const challenge = "test_meta_challenge_99812";
    const handshakeRes = await request.get(
      "http://127.0.0.1:8000/api/v1/whatsapp/webhook?hub.mode=subscribe&hub.challenge=" +
        challenge +
        "&hub.verify_token=job_tracker_whatsapp_verify_token_2026"
    );
    expect(handshakeRes.status()).toBe(200);
    expect(await handshakeRes.text()).toBe(challenge);

    // B. Simulate Inbound Webhook Event from Candidate (POST)
    const inboundPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1476230845569922",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { display_phone_number: candidatePhoneDigits, phone_number_id: "1476230845569922" },
                contacts: [{ profile: { name: candidateName }, wa_id: candidatePhoneDigits }],
                messages: [
                  {
                    from: candidatePhoneDigits,
                    id: `wamid.inbound_${SUITE_ID}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: "text",
                    text: {
                      body: "Thank you for the update! I am very interested and available next week.",
                    },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const webhookRes = await request.post("http://127.0.0.1:8000/api/v1/whatsapp/webhook", {
      data: inboundPayload,
    });
    expect(webhookRes.status()).toBe(200);

    // Verify inbound message created in Supabase
    const dbInbound = queryDb(
      `SELECT direction, body FROM messages WHERE candidate_id='${candidateId}' AND direction='inbound';`
    );
    expect(dbInbound.length).toBe(1);
    expect(dbInbound[0].body).toContain("available next week");

    // Verify candidate's last_inbound_whatsapp_at is now set
    const dbCandidate = queryDb(
      `SELECT last_inbound_whatsapp_at FROM candidates WHERE id='${candidateId}';`
    );
    expect(dbCandidate[0].last_inbound_whatsapp_at).not.toBeNull();
  });

  test("5. Unified Inbox UI: Active 24h Window, View Thread, AI Draft & Reply Send", async ({
    page,
  }) => {
    await page.goto("/inbox");
    await page.waitForURL("**/inbox");

    // Verify Candidate appears in conversation list on left pane
    await expect(page.locator(`text=${candidateName}`).first()).toBeVisible({ timeout: 15000 });

    // Click candidate thread
    await page.locator(`text=${candidateName}`).first().click();

    // Verify 24h Session Active pill is visible
    await expect(page.locator("text=24h Session Active").first()).toBeVisible({ timeout: 15000 });

    // Verify both outbound template message and inbound message appear in chat thread
    await expect(page.locator("text=available next week").first()).toBeVisible({ timeout: 15000 });

    // Click Ask AI to Draft Reply
    const aiDraftBtn = page.locator('button:has-text("Ask AI to Draft Reply")');
    await expect(aiDraftBtn).toBeVisible();
    await aiDraftBtn.click();

    // Expect AI Draft Ready toast
    await expect(page.locator("text=AI Draft Ready").first()).toBeVisible({ timeout: 30000 });

    // Reply textarea should be populated with draft
    const replyTextarea = page.locator('textarea[placeholder*="Type your reply"]');
    await expect(replyTextarea).not.toBeEmpty();

    // Click Send Reply
    const sendBtn = page.locator('#btn-send-whatsapp-reply');
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // Expect Message Sent toast
    await expect(page.locator("text=Message Sent").first()).toBeVisible({ timeout: 15000 });

    // Verify outbound freeform message is stored in Supabase
    const dbOutbound = queryDb(
      `SELECT id, direction, message_type FROM messages WHERE candidate_id='${candidateId}' AND direction='outbound' AND message_type='text';`
    );
    expect(dbOutbound.length).toBeGreaterThan(0);
    expect(dbOutbound[0].direction).toBe("outbound");
  });

  test("6. Settings Page: WhatsApp Cloud API Status Card and Webhook Configuration", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.waitForURL("**/settings");

    // Expect WhatsApp Cloud API Integration card
    await expect(page.locator("text=WhatsApp Cloud API Integration").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=Phone Number ID").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=1476230845569922").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("text=http://localhost:8000/whatsapp/webhook").first()).toBeVisible({ timeout: 15000 });

    // Verify Recheck button
    const recheckBtn = page.locator("#btn-refresh-whatsapp-status");
    await expect(recheckBtn).toBeVisible();
    await recheckBtn.click();
  });

  test("7. Contact Candidate Dialog: Pakistan Phone Normalization and Contact Dispatch", async ({
    page,
    request,
  }) => {
    // Create candidate with Pakistan local number format: 03704570873
    const pakCandidateName = `Bilal Khan ${SUITE_ID}`;
    const pakCandidateEmail = `bilal_${SUITE_ID}@example.pk`;
    const pakPhone = "03704570873";

    const createRes = await request.post("http://127.0.0.1:8000/api/v1/candidates", {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        opening_id: openingId,
        name: pakCandidateName,
        email: pakCandidateEmail,
        cv_text: "Experienced cloud developer based in Pakistan.",
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const candData = await createRes.json();

    // Attach Pakistan local phone
    await request.patch(`http://127.0.0.1:8000/api/v1/candidates/${candData.id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: { phone: pakPhone },
    });

    // Navigate to pipeline
    await page.goto("/pipeline");
    await page.waitForURL("**/pipeline");

    // Click candidate card to open drawer
    await page.locator(`text=${pakCandidateName}`).first().click();
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 15000 });

    // Click Contact Candidate button
    const contactBtn = page.locator("#btn-contact-candidate");
    await expect(contactBtn).toBeVisible({ timeout: 15000 });
    await contactBtn.click();

    // Contact modal opens
    await expect(page.locator("text=Contact Candidate").first()).toBeVisible({ timeout: 15000 });
    // Verify phone normalized to E.164: +923704570873
    await expect(page.locator("text=+923704570873").first()).toBeVisible({ timeout: 15000 });

    // Verify Opt-in checkbox is checked
    const optInBox = page.locator("#opt-in-checkbox");
    await expect(optInBox).toBeChecked();

    // Click Approve & Send button
    const confirmBtn = page.locator("#btn-confirm-contact-candidate");
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Expect success toast
    await expect(page.locator("text=WhatsApp Message Dispatched").first()).toBeVisible({ timeout: 20000 });

    // Verify candidate now has whatsapp_opt_in = true in database
    const dbPakCand = queryDb(
      `SELECT whatsapp_opt_in FROM candidates WHERE id='${candData.id}';`
    );
    expect(dbPakCand[0].whatsapp_opt_in).toBe(true);
  });
});
