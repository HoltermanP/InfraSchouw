import { expect, test, type Page } from "@playwright/test";
import { expectToast, loginAs } from "./helpers";

async function hrefOf(page: Page, name: string) {
  await page.goto("/schouwen");
  return (await page.getByRole("link", { name }).getAttribute("href"))!;
}

test("verslag bewerken: foto slepen, opslaan als versie, versie terugzetten", async ({ page }) => {
  await loginAs(page, "schouwer");
  const href = await hrefOf(page, "Nulmeting / vooropname Frankhuizerallee 110–126");
  await page.goto(`${href}/verslag`);
  const editor = page.getByTestId("report-editor");
  await expect(editor).toBeVisible();
  const before = await page.getByTestId("report-photo").count();
  // Drag a photo from the side panel into the findings section.
  const captureId = await page.getByTestId("panel-photo").first().getAttribute("data-capture-id");
  const target = page.locator('[data-section-key="bevindingen"] p').first();
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  // Synthetic HTML5 drop with the same payload the side panel sets on dragstart.
  await page.evaluate(
    ({ id, x, y }) => {
      const dt = new DataTransfer();
      dt.setData("application/x-infraschouw-capture", id);
      dt.setData("text/plain", "Foto");
      const el = document.elementFromPoint(x, y)!;
      el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { id: captureId!, x: box.x + 10, y: box.y + box.height / 2 },
  );
  await expect.poll(() => page.getByTestId("report-photo").count()).toBeGreaterThan(before);
  // Edit text
  await page.locator('[data-section-key="doel_scope"] .ProseMirror p, [data-section-key="doel_scope"] p').first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Aangevuld door E2E.");
  await page.getByTestId("save-report").click();
  await expectToast(page, "Verslag opgeslagen");
  await page.getByTestId("panel-versies").click();
  const versions = page.getByTestId("versions-panel");
  await expect(versions.getByText("(huidig)")).toBeVisible();
  // Compare and restore version 1
  // The editor remounts once the refreshed version arrives; retry until the diff sticks.
  await expect(async () => {
    await versions.getByRole("button", { name: /Verschil t\.o\.v\. v/ }).first().click();
    await expect(page.getByTestId("version-diff")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  page.once("dialog", (d) => d.accept());
  await versions.getByTestId("restore-1").click();
  await expectToast(page, "Vorige versie teruggezet");
});

test("statusflow tot definitief, deellink maken, openen en intrekken", async ({ page, browser }) => {
  // Schouwer: accept AI key points, answer open questions, offer for review.
  await loginAs(page, "schouwer");
  const href = await hrefOf(page, "Graafschade LS-kabel Assendorperstraat");
  await page.goto(`${href}/verslag`);
  await expect(page.getByTestId("report-editor")).toBeVisible();
  // Report is "ter review": schouwer cannot edit; projectleider finalises.
  await loginAs(page, "projectleider");
  await page.goto(`${href}/verslag`);
  const questions = page.getByTestId("open-questions");
  if (await questions.isVisible()) {
    const boxes = questions.getByRole("checkbox");
    for (let i = 0; i < (await boxes.count()); i++) if (!(await boxes.nth(i).isChecked())) await boxes.nth(i).click();
  }
  await page.getByTestId("panel-aandachtspunten").click();
  const accept = page.getByTestId("key-points").getByRole("button", { name: "Accepteer" });
  while ((await accept.count()) > 0) await accept.first().click();
  if (await page.getByTestId("save-report").isEnabled()) {
    await page.getByTestId("save-report").click();
    await expectToast(page, "Verslag opgeslagen");
  }
  // Saving a report under review keeps it editable for the projectleider; back to review then final.
  if (await page.getByTestId("transition-ter_review").isVisible().catch(() => false)) {
    await page.getByTestId("transition-ter_review").click();
    await expectToast(page, "Status gewijzigd");
  }
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("transition-definitief").click();
  await expectToast(page, "Status gewijzigd");
  await expect(page.getByText("Definitief en vergrendeld")).toBeVisible();

  // Share link
  await page.getByTestId("panel-delen").click();
  await page.getByTestId("create-share-link").click();
  const url = await page.getByTestId("share-url").inputValue();
  const anon = await browser.newContext();
  const guest = await anon.newPage();
  await guest.goto(url);
  await expect(guest.getByRole("heading", { name: "Calamiteitenverslag graafschade Assendorperstraat" })).toBeVisible();
  const pdf = await guest.request.get(`${new URL(url).pathname.replace("/delen/", "/api/share/")}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  // Revoke → link no longer works
  await page.reload();
  await page.getByTestId("panel-delen").click();
  await page.getByTestId("revoke-share-link").first().click();
  await expectToast(page, "Deellink ingetrokken");
  const again = await guest.goto(url);
  expect(again?.status()).toBe(404);
  await anon.close();
});

test("zonder OpenAI-sleutel: geen hergenereerknop, verslag en PDF-export werken", async ({ page }) => {
  await loginAs(page, "schouwer");
  const href = await hrefOf(page, "Stationsoplevering ZWL-STH-4012 Frankhuizerallee");
  await page.goto(`${href}/verslag`);
  await expect(page.getByTestId("report-editor")).toBeVisible();
  await expect(page.getByTestId("regenerate-bevindingen")).toHaveCount(0);
  // Export/preview still work without AI.
  const res = await page.request.get(`/api/exports/inspections/${href.split("/").pop()}/pdf`);
  expect(res.status()).toBe(200);
});
