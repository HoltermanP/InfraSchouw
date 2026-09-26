import { expect, test } from "@playwright/test";
import { expectToast, loginAs, uniqueSuffix } from "./helpers";

test.describe("projecten en templates", () => {
  test("projectleider maakt een project aan en voegt een teamlid toe", async ({ page }) => {
    await loginAs(page, "projectleider");
    const nr = `E2E-${uniqueSuffix()}`;
    await page.goto("/projecten/nieuw");
    await page.getByLabel("Projectnummer").fill(nr);
    await page.getByLabel("Naam").fill(`E2E project ${nr}`);
    await page.getByLabel("Opdrachtgever").fill("Enexis Netbeheer");
    await page.getByLabel("Projectgebied (GeoJSON)").fill(
      JSON.stringify({ type: "Polygon", coordinates: [[[6.08, 52.5], [6.12, 52.5], [6.12, 52.53], [6.08, 52.53], [6.08, 52.5]]] }),
    );
    await page.getByRole("button", { name: "Project aanmaken" }).click();
    await page.waitForURL(/\/projecten\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: `E2E project ${nr}` })).toBeVisible();

    await page.getByRole("link", { name: "Team" }).click();
    await page.getByRole("button", { name: "Toevoegen" }).click();
    await expectToast(page, "Teamlid toegevoegd");

    await page.goto(`/projecten?q=${nr}`);
    await expect(page.getByRole("link", { name: `E2E project ${nr}` })).toBeVisible();
  });

  test("lezer kan geen project aanmaken en ziet geen instellingen", async ({ page }) => {
    await loginAs(page, "lezer");
    await page.goto("/projecten");
    await expect(page.getByRole("link", { name: "Nieuw project" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Instellingen" })).toHaveCount(0);
    const res = await page.goto("/instellingen/templates");
    expect(res?.status()).toBeGreaterThanOrEqual(400);
  });

  test("beheerder bewerkt een template", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/instellingen/templates");
    await page.getByRole("link", { name: "Calamiteit-/storingsschouw" }).click();
    await page.getByRole("button", { name: "Vraag" }).click();
    const inputs = page.getByLabel(/^Vraag \d+$/);
    await inputs.last().fill("E2E-controlevraag");
    await page.getByRole("button", { name: "Opslaan" }).first().click();
    await expectToast(page, "Template opgeslagen");
    await page.reload();
    await expect(page.getByLabel(/^Vraag \d+$/).last()).toHaveValue("E2E-controlevraag");
    // Clean up: remove the question again.
    const count = await page.getByLabel(/^Vraag \d+$/).count();
    await page.getByRole("button", { name: "Rij verwijderen" }).nth(count - 1).click();
    await page.getByRole("button", { name: "Opslaan" }).first().click();
    await expectToast(page, "Template opgeslagen");
  });
});
