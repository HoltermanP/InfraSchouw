import { test } from "@playwright/test";
import { loginAs } from "./helpers";
test.skip(!process.env.DEBUG_MAP, "debug");
test("map debug", async ({ page }) => {
  await loginAs(page, "projectleider", "/schouwen");
  const href = await page.getByRole("link", { name: "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan" }).getAttribute("href");
  await page.goto(href!);
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=infra-map]") as HTMLElement;
    const out: string[] = [];
    let n: HTMLElement | null = el;
    for (let i = 0; i < 5 && n; i++) {
      const cs = getComputedStyle(n);
      out.push(`${n.tagName}.${n.className.slice(0, 80)} h=${n.getBoundingClientRect().height} css-h=${cs.height} pos=${cs.position}`);
      n = n.parentElement;
    }
    return out.join("\n");
  });
  console.log(info);
});
