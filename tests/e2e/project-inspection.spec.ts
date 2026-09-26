import { expect, test } from "@playwright/test";
import { loginAs, uniqueSuffix } from "./helpers";

test("schouw starten vanuit project verschijnt op de projectkaart", async ({ page }) => {
  await loginAs(page, "schouwer", "/projecten");
  await page.getByRole("link", { name: "Netverzwaring Demo – 10 kV ring" }).click();
  await page.waitForURL(/\/projecten\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();
  await page.getByTestId("start-inspection-from-project").click();
  await page.waitForURL(/\/veld\?nieuw=1&project=/);
  await page.getByRole("button", { name: /Uitvoeringsschouw/ }).click();
  await expect(page.getByLabel("Project")).not.toHaveValue("");
  const title = `E2E vanuit project ${uniqueSuffix()}`;
  await page.getByLabel("Titel").fill(title);
  await page.getByTestId("start-inspection").click();
  await page.getByTestId("btn-photo").click();
  await page.waitForTimeout(1200);
  await page.getByTestId("shutter").click();
  await page.getByRole("button", { name: "Camera sluiten" }).click();
  await expect(page.getByTestId("sync-indicator")).toHaveAttribute("data-pending", "0", { timeout: 60_000 });

  await page.goto(`${projectUrl}/schouwen`);
  await expect(page.getByRole("link", { name: title })).toBeVisible();
  // Map on the project overview contains the inspection start point.
  await page.goto(projectUrl);
  await expect(page.getByTestId("infra-map")).toBeVisible();
  await expect.poll(() => page.locator(`.maplibre-point[aria-label*="${title}"]`).count(), { timeout: 20_000 }).toBeGreaterThan(0);
});
