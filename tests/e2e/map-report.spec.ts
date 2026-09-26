import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

async function traceHref(page: import("@playwright/test").Page) {
  await page.goto("/schouwen");
  return (await page.getByRole("link", { name: "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan" }).getAttribute("href"))!;
}

test("kaart toont alle foto's; klik opent info; van kaart naar verslag en terug", async ({ page }) => {
  await loginAs(page, "projectleider");
  const href = await traceHref(page);
  await page.goto(href);
  await expect(page.getByTestId("infra-map")).toBeVisible();
  await expect(page.getByText(/15 op kaart/)).toBeVisible();
  // Zoom in via the "Alles" fit until individual markers show, then open one.
  await expect.poll(() => page.locator(".maplibre-capture, .maplibre-cluster").count(), { timeout: 20_000 }).toBeGreaterThan(0);
  if ((await page.locator(".maplibre-capture").count()) === 0) await page.locator(".maplibre-cluster").first().click();
  await page.locator(".maplibre-capture").first().click();
  const panel = page.getByTestId("map-side-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("RD (x, y)")).toBeVisible();
  await expect(panel.getByText("WGS84")).toBeVisible();
  await expect(panel.getByText("Kijkrichting")).toBeVisible();
  await panel.getByTestId("show-in-report").click();
  await page.waitForURL(/\/verslag#capture-/);
  await expect(page.getByTestId("report-editor")).toBeVisible();
  // And back: photo in the report → map with that capture selected.
  await page.getByTestId("photo-to-map").first().click();
  await page.waitForURL(/\?capture=/);
  await expect(page.getByTestId("map-side-panel")).toBeVisible();
});

test("tijdlijn toont captures en transcriptie gekoppeld aan foto's", async ({ page }) => {
  await loginAs(page, "lezer");
  const href = await traceHref(page);
  await page.goto(`${href}/tijdlijn`);
  const tl = page.getByTestId("timeline");
  await expect(tl.getByText("Kroonprojectie gaat over het tracé heen", { exact: false })).toBeVisible();
  await expect(tl.getByText(/gekoppeld aan foto 2/).first()).toBeVisible();
});
