import { test, expect } from "@playwright/test";

test.describe("Login Screen", () => {
  test("renders the login page with Catan theme", async ({ page }) => {
    await page.goto("/");

    // Title and subtitle visible
    await expect(page.getByText("Khalese Lab Helper")).toBeVisible();
    await expect(page.getByText("In Runx-1 We Trust")).toBeVisible();
    await expect(page.getByText("Enter Settlement")).toBeVisible();

    // Passcode input exists
    const input = page.getByPlaceholder("Enter lab passcode");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    // Login button exists
    await expect(page.getByRole("button", { name: /enter the settlement/i })).toBeVisible();

    // Resource badges visible
    await expect(page.getByText("Literature")).toBeVisible();
    await expect(page.getByText("Methods")).toBeVisible();
    await expect(page.getByText("Data")).toBeVisible();
    await expect(page.getByText("Analysis")).toBeVisible();
    await expect(page.getByText("Synthesis")).toBeVisible();

    // Footer
    await expect(page.getByText("Powered by EurekaClaw + AutoResearch")).toBeVisible();
  });

  test("shows error on wrong passcode", async ({ page }) => {
    await page.goto("/");

    const input = page.getByPlaceholder("Enter lab passcode");
    await input.fill("000000");
    await page.getByRole("button", { name: /enter the settlement/i }).click();

    // Error message appears
    await expect(page.getByText(/robber blocks your path/i)).toBeVisible();

    // Error disappears after ~2s
    await expect(page.getByText(/robber blocks your path/i)).toBeHidden({ timeout: 5000 });
  });

  test("wrong passcode via Enter key", async ({ page }) => {
    await page.goto("/");

    const input = page.getByPlaceholder("Enter lab passcode");
    await input.fill("999999");
    await input.press("Enter");

    await expect(page.getByText(/robber blocks your path/i)).toBeVisible();
  });

  test("successful login navigates to topic screen", async ({ page }) => {
    await page.goto("/");

    const input = page.getByPlaceholder("Enter lab passcode");
    await input.fill("071195");
    await page.getByRole("button", { name: /enter the settlement/i }).click();

    // Should now see the topic input screen
    await expect(page.getByText("What would you like to research?")).toBeVisible();
    await expect(page.getByText("Trade Routes")).toBeVisible();
  });

  test("successful login via Enter key", async ({ page }) => {
    await page.goto("/");

    const input = page.getByPlaceholder("Enter lab passcode");
    await input.fill("071195");
    await input.press("Enter");

    await expect(page.getByText("What would you like to research?")).toBeVisible();
  });
});

test.describe("Topic Screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Enter lab passcode").fill("071195");
    await page.getByPlaceholder("Enter lab passcode").press("Enter");
    await expect(page.getByText("What would you like to research?")).toBeVisible();
  });

  test("renders topic screen elements", async ({ page }) => {
    // Header is visible after login
    await expect(page.locator("header")).toBeVisible();
    await expect(page.getByText("EurekaClaw v2.0")).toBeVisible();
    await expect(page.getByText("AutoResearch")).toBeVisible();

    // Textarea for topic
    const textarea = page.getByPlaceholder(/RUNX1 mutations/);
    await expect(textarea).toBeVisible();

    // Talk to Khalese button
    await expect(page.getByRole("button", { name: /talk to khalese/i })).toBeVisible();

    // Quick start buttons
    await expect(page.getByRole("button", { name: /RUNX1 in hematopoietic/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /CAR-T cell therapy/i })).toBeVisible();
  });

  test("quick start buttons populate the textarea", async ({ page }) => {
    await page.getByRole("button", { name: /RUNX1 in hematopoietic/i }).click();

    const textarea = page.getByPlaceholder(/RUNX1 mutations/);
    await expect(textarea).toHaveValue("RUNX1 in hematopoietic stem cells");
  });

  test("Talk to Khalese button is disabled when topic is empty", async ({ page }) => {
    const button = page.getByRole("button", { name: /talk to khalese/i });
    await expect(button).toBeDisabled();
  });

  test("typing a topic enables the button", async ({ page }) => {
    const textarea = page.getByPlaceholder(/RUNX1 mutations/);
    await textarea.fill("Gene therapy approaches");

    const button = page.getByRole("button", { name: /talk to khalese/i });
    await expect(button).toBeEnabled();
  });

  test("submitting a topic navigates to clarify screen", async ({ page }) => {
    const textarea = page.getByPlaceholder(/RUNX1 mutations/);
    await textarea.fill("RUNX1 in leukemia");

    await page.getByRole("button", { name: /talk to khalese/i }).click();

    // Should transition to clarify screen (chat interface)
    // May show API key error or thinking state - either means we navigated
    await expect(
      page.getByText(/type your answer/i).or(page.getByText(/API Key Required/i)).or(page.getByText(/thinking/i))
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Page Metadata & Structure", () => {
  test("has correct page title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Khalese Lab Helper/);
  });

  test("page loads without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Filter out known non-critical errors (e.g. favicon)
    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("404")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("responsive layout - mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await expect(page.getByText("Khalese Lab Helper")).toBeVisible();
    await expect(page.getByPlaceholder("Enter lab passcode")).toBeVisible();
  });
});
