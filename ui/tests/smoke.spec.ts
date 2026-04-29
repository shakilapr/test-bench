import { test, expect } from "@playwright/test";

// Smoke test — assumes infra + backend + UI build are all running and a
// simulator is publishing as bench-sim-01.
test("dashboard loads, ws goes live, commands round-trip", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bench" })).toBeVisible();
  await expect(page.getByTestId("ws-status")).toContainText("live", { timeout: 15_000 });
  await expect(page.getByTestId("live-card-bench-sim-01")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("interval-input").fill("250");
  await page.getByTestId("set-interval-btn").click();
  await expect(page.getByTestId("cmd-result")).toContainText("Issued cmd-", { timeout: 5_000 });

  await page.getByTestId("start-rec-btn").click();
  await expect(page.getByTestId("stop-rec-btn")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("stop-rec-btn").click();
  await expect(page.getByTestId("start-rec-btn")).toBeVisible({ timeout: 5_000 });
});
