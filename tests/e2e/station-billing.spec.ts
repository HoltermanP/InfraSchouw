import { expect, test } from "@playwright/test";
import { expectToast, loginAs, uniqueSuffix } from "./helpers";

test("stationsschouw: begeleide shotlist, typeplaat overnemen, installatiebeschrijving en as-built", async ({ page }) => {
  await loginAs(page, "schouwer", "/veld?nieuw=1");
  await page.getByRole("button", { name: /Stationsschouw \(bestaand\)/ }).click();
  await page.getByLabel("MS-station").selectOption({ label: "ZWL-STH-4013 – MS-station Stadshagen Werkerlaan" });
  await page.getByTestId("start-inspection").click();
  await page.getByRole("button", { name: /^Shotlist/ }).click();
  await expect(page.getByTestId("shotlist-status")).toContainText("verplichte foto's ontbreken");
  await expect(page.getByText("Typeplaat transformator")).toBeVisible();

  await page.goto("/schouwen");
  const href = (await page.getByRole("link", { name: "Stationsoplevering ZWL-STH-4012 Frankhuizerallee" }).getAttribute("href"))!;
  await page.goto(`${href}/station`);
  await expect(page.getByTestId("nameplate").first()).toBeVisible();
  await page.getByTestId("nameplate").last().getByRole("button", { name: "Overnemen als transformator" }).click();
  await expectToast(page, "Typeplaatgegevens overgenomen");
  await page.getByTestId("run-asbuilt").click();
  await expectToast(page, "As-built-check uitgevoerd");
  await expect(page.getByTestId("asbuilt").getByText("Afwijkend")).toBeVisible();
  await page.goto(`${href}/bevindingen`);
  await expect(page.getByText("As-built afwijking: Aantal LS-groepen")).toBeVisible();
});

test("afrekenposten importeren, bewijs koppelen, bevestigen en exporteren", async ({ page }) => {
  await loginAs(page, "projectleider");
  const nr = `E2E-AF-${uniqueSuffix()}`;
  await page.goto("/projecten/nieuw");
  await page.getByLabel("Projectnummer").fill(nr);
  await page.getByLabel("Naam").fill(`Afrekentest ${nr}`);
  await page.getByRole("button", { name: "Project aanmaken" }).click();
  await page.waitForURL(/\/projecten\/[0-9a-f-]{36}$/);
  const projectUrl = page.url();
  await page.getByRole("link", { name: "Afrekenposten" }).click();
  await page.getByTestId("billing-import").setInputFiles({
    name: "posten.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Postcode;Omschrijving;Eenheid;Eenheidsprijs;Hoeveelheid\n01.01;MS-kabel 3x1x240;m;38,50;100\n04.01;RMU 3K+1T;st;28.500,00;1\n"),
  });
  await expect(page.getByTestId("billing-overview").getByText("RMU 3K+1T")).toBeVisible();

  // Link a loose inspection to this project and add evidence.
  await page.goto("/schouwen?koppeling=los");
  await page.getByRole("link", { name: "Graafschade LS-kabel Assendorperstraat" }).click();
  await page.getByTestId("link-project").click();
  await page.getByRole("dialog").getByLabel("Project").selectOption({ label: `${nr} – Afrekentest ${nr}` });
  await page.getByTestId("confirm-link-project").click();
  await expectToast(page, "Schouw gekoppeld aan project");
  const inspectionPath = new URL(page.url()).pathname;
  await page.goto(`${inspectionPath}/afrekening`);
  await page.getByTestId("add-evidence").click();
  await page.getByLabel("Afrekenpost").selectOption({ index: 1 });
  await page.getByRole("button", { name: /Foto 1/ }).first().click();
  await page.getByRole("button", { name: "Opslaan" }).click();
  await expectToast(page, "Bewijsregel toegevoegd");
  await page.getByTestId("confirm-evidence").first().click();
  await expectToast(page, "Afrekenbewijs bijgewerkt");

  await page.goto(`${projectUrl}/afrekening`);
  await expect(page.getByTestId("evidence-table").getByText("Bevestigd")).toBeVisible();
  const projectId = projectUrl.split("/").pop();
  for (const f of ["billing-xlsx", "billing-pdf"]) {
    const res = await page.request.get(`/api/exports/projects/${projectId}/${f}`);
    expect(res.status(), f).toBe(200);
    expect((await res.body()).byteLength).toBeGreaterThan(1000);
  }
});
