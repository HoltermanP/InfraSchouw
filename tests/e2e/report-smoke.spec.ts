import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("verslag: afronden, basisverslag, editor en exports", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  await loginAs(page, "schouwer", "/veld");
  await page.getByTestId("new-inspection").click();
  await page.getByRole("button", { name: /Tracéschouw/ }).click();
  await page.getByTestId("start-inspection").click();
  await expect(page.getByTestId("inspection-title")).toBeVisible();
  await page.getByTestId("btn-photo").click();
  await page.waitForTimeout(1200);
  await page.getByTestId("shutter").click();
  await expect(page.getByText("1 ✓")).toBeVisible();
  await page.getByRole("button", { name: "Camera sluiten" }).click();
  await page.getByTestId("btn-finding").click();
  await page.getByLabel("Omschrijving bevinding").fill("Boom binnen 1 m van het tracé. Kroonprojectie beschermen.");
  await page.getByTestId("save-finding").click();
  // Wait for sync
  await expect(page.getByTestId("sync-indicator")).toHaveAttribute("data-pending", "0", { timeout: 30_000 });
  const url = new URL(page.url());
  const inspectionId = url.searchParams.get("schouw")!;

  await page.goto(`/schouwen/${inspectionId}`);
  await page.getByRole("button", { name: "Afronden" }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Schouw afgerond" })).toBeVisible();
  await page.goto(`/schouwen/${inspectionId}/verslag`);
  await expect(page.getByTestId("report-editor")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("report-finding").first()).toBeVisible();

  for (const fmt of ["pdf", "docx", "xlsx", "zip", "geojson"]) {
    const res = await page.request.get(`/api/exports/inspections/${inspectionId}/${fmt}`);
    expect(res.status(), fmt).toBe(200);
    expect((await res.body()).byteLength, fmt).toBeGreaterThan(200);
  }
});
