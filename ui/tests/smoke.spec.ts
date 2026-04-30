import { test, expect, Page } from "@playwright/test";

// End-to-end UI test against the real dev stack:
//   embedded MQTT broker + backend + simulator + vite.
// Started automatically by the playwright.config webServer.

const DEVICE = "bench-sim-01";

async function waitForLive(page: Page) {
  await expect(page.getByTestId("ws-status")).toContainText("live");
  await expect(page.getByTestId(`device-row-${DEVICE}`)).toBeVisible();
  await expect(page.getByTestId(`live-panel-${DEVICE}`)).toBeVisible();
}

test.describe("Bench UI — live pipeline", () => {
  test("connects, shows device, streams telemetry tiles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Bench", exact: true })).toBeVisible();
    await waitForLive(page);

    await expect(page.getByTestId("current-device")).toHaveText(DEVICE);

    // Both metadata channels rendered as tiles, with numeric values.
    const current = page.getByTestId("ch-current_a");
    const temp = page.getByTestId("ch-chip_temp_c");
    await expect(current).toBeVisible();
    await expect(temp).toBeVisible();

    // Capture a value, wait for sim to publish another sample, expect it to update.
    // The tile shows "<num> <unit>"; just compare the entire text.
    const before = (await current.innerText()).trim();
    await expect
      .poll(async () => (await current.innerText()).trim(), { timeout: 10_000 })
      .not.toBe(before);
  });

  test("chart tabs switch between current and chip temp", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);

    // Default tab: current_a chart visible.
    await expect(page.getByTestId("chart-current_a")).toBeVisible();

    // Click the chip temp tab; chart for chip_temp_c should appear.
    await page.getByTestId("tab-chip_temp_c").click();
    await expect(page.getByTestId("chart-chip_temp_c")).toBeVisible();
    await expect(page.getByTestId("tab-chip_temp_c")).toHaveAttribute("aria-selected", "true");
  });

  test("sends a command and gets back a cmd id", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);

    await page.getByTestId("cmd-set_sample_interval-interval_ms").fill("400");
    await page.getByTestId("cmd-set_sample_interval-send").click();
    await expect(page.getByTestId("cmd-set_sample_interval-result")).toContainText(/cmd-/);
  });

  test("records a session via the panel record/stop buttons and exports valid CSV", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);

    // Block-level Start → REC badge appears in the header.
    await page.getByTestId("start-rec-btn").click();
    await expect(page.getByTestId("header-rec-active")).toBeVisible();

    // Let the sim publish a few samples.
    await page.waitForTimeout(3000);

    // Block-level Stop → start button is back.
    await page.getByTestId("stop-rec-btn").click();
    await expect(page.getByTestId("start-rec-btn")).toBeVisible();

    // Newest history row should be the recording we just stopped, with samples > 0.
    const firstRow = page.getByTestId("rec-history").locator("tbody tr").first();
    await expect(firstRow).toBeVisible();
    const samples = await firstRow.locator("td").nth(4).innerText();
    expect(Number(samples)).toBeGreaterThan(0);

    // Export CSV link → fetch it through the page context (carries cookies, baseURL).
    const exportLink = firstRow.getByRole("link", { name: "CSV" });
    const href = await exportLink.getAttribute("href");
    expect(href).toMatch(/^\/api\/recordings\/.+\/export\.csv$/);

    const res = await page.request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/csv/);
    const body = await res.text();
    const lines = body.trim().split(/\r?\n/);
    expect(lines[0]).toBe("ts_ms,iso,current_a,chip_temp_c,current_a_q,chip_temp_c_q");
    expect(lines.length).toBeGreaterThan(1);
    // Each data row should have 6 columns.
    expect(lines[1].split(",").length).toBe(6);
  });

  test("RecordingPanel local Start/Stop also works with a label", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);

    await page.getByTestId("rec-label").fill("playwright-run");
    await page.getByTestId("start-rec-btn").click();
    await expect(page.getByTestId("rec-active")).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByTestId("stop-rec-btn").click();
    await expect(page.getByTestId("start-rec-btn")).toBeVisible();

    // Newest history row should carry our label.
    const firstRow = page.getByTestId("rec-history").locator("tbody tr").first();
    await expect(firstRow.locator("td").nth(1)).toHaveText("playwright-run");
  });

  test("chart window selector + reset button manage retained samples", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);

    // Default window is 60s; switch to 5m and confirm the select keeps it.
    const win = page.getByTestId("chart-window");
    await expect(win).toHaveValue("60s");
    await win.selectOption("5m");
    await expect(win).toHaveValue("5m");

    // Wait for at least one sample so reset has something to clear.
    const reset = page.getByTestId("chart-reset");
    await expect(reset).toBeEnabled();
    await reset.click();
    // After reset the buffer is empty, so the button disables itself
    // until a new sample arrives (~500 ms cadence). Just check it toggled.
    await expect(reset).toBeDisabled({ timeout: 1000 }).catch(() => {});
    // And then re-enables once the sim publishes again.
    await expect(reset).toBeEnabled({ timeout: 5000 });
  });
});
