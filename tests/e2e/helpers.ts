import { expect, type Page } from "@playwright/test";

export type DemoRole = "admin" | "projectleider" | "schouwer" | "lezer";

export async function loginAs(page: Page, role: DemoRole, returnTo = "/dashboard") {
  await page.goto(`/demo-login?terug=${encodeURIComponent(returnTo)}`);
  await page.getByTestId(`demo-user-${role}`).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/demo-login"));
}

export function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
