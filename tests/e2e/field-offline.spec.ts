import { expect, test, type Page } from "@playwright/test";
import { expectToast, loginAs, uniqueSuffix } from "./helpers";

async function closeCamera(page: Page) {
  await page.getByRole("button", { name: "Camera sluiten" }).click();
}

test("losse schouw volledig offline vastleggen, afronden, synchroniseren en later aan project koppelen", async ({ page, context }) => {
  test.setTimeout(240_000);
  const title = `E2E offline calamiteit ${uniqueSuffix()}`;
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await loginAs(page, "schouwer", "/veld");
  await expect(page.getByTestId("new-inspection")).toBeVisible();
  // Bootstrap data is cached; from here on the device is offline.
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await page.getByTestId("new-inspection").click();
  await page.getByRole("button", { name: /Calamiteit-\/storingsschouw/ }).click();
  await page.getByLabel("Titel").fill(title);
  await page.getByTestId("start-inspection").click();
  await expect(page.getByTestId("inspection-title")).toHaveText(title);
  await expect(page.getByTestId("sync-indicator")).toHaveAttribute("data-online", "false");

  // Photo (getUserMedia with fake camera)
  await page.getByTestId("btn-photo").click();
  await page.waitForTimeout(1200);
  await page.getByTestId("shutter").click();
  await expect(page.getByText("1 ✓")).toBeVisible();
  await closeCamera(page);

  // Video (MediaRecorder, keyframes)
  await page.getByTestId("btn-video").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("video-button").click();
  await page.waitForTimeout(2500);
  await page.getByTestId("video-button").click();
  await expect(page.getByText("1 ✓")).toBeVisible({ timeout: 20_000 });
  await closeCamera(page);

  // Audio (continuous)
  await page.getByTestId("btn-audio").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("stop-audio").click();

  // Note
  await page.getByTestId("btn-note").click();
  await page.getByLabel("Notitie", { exact: true }).fill("Kabelschade bij de oprit, afgezet met hekken.");
  await page.getByTestId("save-note").click();

  // Measurement linked to the photo
  await page.getByTestId("btn-measurement").click();
  await page.getByLabel("Waarde").fill("72");
  await page.getByTestId("save-measurement").click();

  // Finding
  await page.getByTestId("btn-finding").click();
  await page.getByRole("radio", { name: "Hoog" }).click();
  await page.getByLabel("Omschrijving bevinding").fill("Blootliggende aders LS-kabel. Direct afschermen.");
  await page.getByTestId("save-finding").click();

  // QR / barcode (manual entry fallback)
  await page.getByTestId("btn-scan").click();
  await page.getByLabel("Code handmatig").fill("HASPEL-2026-0042");
  await page.getByRole("button", { name: "Vastleggen" }).click();

  // Sketch on a blank canvas
  await page.getByTestId("btn-more").click();
  await page.getByTestId("btn-sketch").click();
  const canvas = page.getByTestId("annotation-canvas");
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 150, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Schets opslaan" }).click();

  // All capture types are stored locally with time (and GPS where available).
  const grid = page.getByTestId("capture-grid");
  for (const t of ["photo", "video", "audio", "note", "measurement", "scan", "sketch"]) {
    await expect(grid.getByTestId(`capture-${t}`).first()).toBeVisible();
  }
  await expect(page.getByTestId("sync-indicator")).not.toHaveAttribute("data-pending", "0");

  // Finish: skip the missing mandatory items with a reason.
  await page.getByTestId("goto-finish").click();
  await expect(page.getByRole("heading", { name: "Schouw afronden" })).toBeVisible();
  const reasons = page.getByLabel(/^Reden overslaan/);
  await expect(reasons.first()).toBeVisible();
  const n = await reasons.count();
  for (let i = 0; i < n; i++) await reasons.nth(i).fill("Niet van toepassing bij deze calamiteit");
  await page.getByTestId("finish-inspection").click();
  await expect(page.getByText("Deze schouw is afgerond.")).toBeVisible();
  const inspectionId = new URL(page.url()).searchParams.get("schouw")!;

  // Back online → everything syncs without data loss.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("sync-indicator")).toHaveAttribute("data-pending", "0", { timeout: 90_000 });

  await page.goto(`/schouwen/${inspectionId}/media`);
  const media = page.getByTestId("media-grid");
  // photo, video (+ its audio track), audio, note, measurement, scan, sketch
  await expect.poll(async () => media.locator("li").count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(8);
  await page.goto(`/schouwen/${inspectionId}/bevindingen`);
  await expect(page.getByText("Blootliggende aders LS-kabel", { exact: true })).toBeVisible();
  await page.goto(`/schouwen/${inspectionId}/checklist`);
  await expect(page.getByText("Bewust overgeslagen foto's")).toBeVisible();

  // Later: link the loose inspection to a project.
  await page.goto(`/schouwen/${inspectionId}`);
  await page.getByTestId("link-project").click();
  await page.getByTestId("confirm-link-project").click();
  await expectToast(page, "Schouw gekoppeld aan project");
  await page.goto("/projecten");
  await page.getByRole("link", { name: "Netverzwaring Demo – 10 kV ring" }).click();
  await page.getByRole("link", { name: "Schouwen" }).last().click();
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
