import { test } from "@playwright/test";
import { loginAs } from "./helpers";

// Visual smoke: captures screenshots of the main screens (not part of CI assertions).
test.skip(!process.env.SCREENSHOT_DIR, "Alleen voor handmatige visuele controle");

test("schermen", async ({ page }) => {
  const dir = process.env.SCREENSHOT_DIR!;
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, "projectleider");
  await page.screenshot({ path: `${dir}/01-dashboard.png` });
  await page.goto("/schouwen");
  const trace = page.getByRole("link", { name: "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan" });
  const href = await trace.getAttribute("href");
  await page.goto(href!);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${dir}/02-kaart.png` });
  await page.locator(".maplibre-capture").first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/03-kaart-paneel.png` });
  await page.goto(`${href}/verslag`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/04-verslag.png`, fullPage: false });
  await page.goto("/schouwen");
  const st = await page.getByRole("link", { name: "Stationsoplevering ZWL-STH-4012 Frankhuizerallee" }).getAttribute("href");
  await page.goto(`${st}/station`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/05-station.png`, fullPage: true });
  await page.goto(`${st}/verslag`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${dir}/06-verslag-concept.png` });
  await page.goto("/projecten");
  await page.getByRole("link", { name: "Netverzwaring Demo – 10 kV ring" }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${dir}/07-project.png` });
  await page.getByRole("link", { name: "Afrekenposten" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/08-afrekening.png`, fullPage: true });
  await page.goto(`${href}/tijdlijn`);
  await page.screenshot({ path: `${dir}/09-tijdlijn.png` });
  await page.goto(`${href}/media`);
  await page.screenshot({ path: `${dir}/10-media.png` });
});
