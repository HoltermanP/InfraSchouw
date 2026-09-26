import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

// Runs first (alphabetical, 1 worker): the freshly seeded demo shows every feature.
test("demodata laat alle functies zien", async ({ page }) => {
  await loginAs(page, "projectleider", "/schouwen");
  for (const title of [
    "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan",
    "Stationsoplevering ZWL-STH-4012 Frankhuizerallee",
    "Nulmeting / vooropname Frankhuizerallee 110–126",
    "Graafschade LS-kabel Assendorperstraat",
  ]) {
    await expect(page.getByRole("link", { name: title })).toBeVisible();
  }
  // Definitive report with archived PDF and an active share link.
  const trace = (await page.getByRole("link", { name: "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan" }).getAttribute("href"))!;
  await page.goto(`${trace}/verslag`);
  await expect(page.getByText("Definitief en vergrendeld")).toBeVisible();
  await page.getByTestId("panel-delen").click();
  await expect(page.getByTestId("revoke-share-link").first()).toBeVisible();
  // Map with track, photos and findings; timeline with linked transcript.
  await page.goto(trace);
  await expect(page.getByText(/15 op kaart/)).toBeVisible();
  // Station inspection: description + as-built, AI concept report.
  const station = (await page.goto("/schouwen"), await page.getByRole("link", { name: "Stationsoplevering ZWL-STH-4012 Frankhuizerallee" }).getAttribute("href"))!;
  await page.goto(`${station}/station`);
  await expect(page.getByTestId("asbuilt")).toBeVisible();
  await page.goto(`${station}/verslag`);
  await expect(page.getByText("Concept (AI-voorstel)").first()).toBeVisible();
  // Project: billing items with evidence, stations, KLIC layer.
  await page.goto("/projecten");
  await page.getByRole("link", { name: "Netverzwaring Demo – 10 kV ring" }).click();
  await page.waitForURL(/\/projecten\/[0-9a-f-]{36}$/);
  const project = page.url();
  await page.goto(`${project}/afrekening`);
  await expect(page.getByTestId("billing-overview").getByText("Leveren en plaatsen RMU 3K+1T (SF6-vrij)")).toBeVisible();
  await expect(page.getByTestId("evidence-table").locator("tr[data-testid=evidence-row]").first()).toBeVisible();
  await page.goto(`${project}/stations`);
  await expect(page.getByText("ZWL-STH-4013").first()).toBeVisible();
  await page.goto(`${project}/documenten`);
  await expect(page.getByText(/KLIC-leveringen/)).toBeVisible();
  // Glasses: registered device and inbox captures.
  await page.goto("/inbox");
  await expect.poll(() => page.getByTestId("inbox-list").locator("li").count()).toBeGreaterThanOrEqual(2);
  await loginAs(page, "admin", "/instellingen/apparaten");
  await expect(page.getByText(/Meta Ray-Ban/).first()).toBeVisible();
});
