import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("veld-app: losse schouw vastleggen en afronden", async ({ page }) => {
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
  page.on("console", (msg) => msg.type() === "error" && console.log("CONSOLE", msg.text()));
  await loginAs(page, "schouwer", "/veld");
  await page.getByTestId("new-inspection").click();
  await page.getByRole("button", { name: /Calamiteit-\/storingsschouw/ }).click();
  await page.getByTestId("start-inspection").click();
  await expect(page.getByTestId("inspection-title")).toBeVisible();

  // Photo via fake camera
  await page.getByTestId("btn-photo").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("shutter").click();
  await expect(page.getByText("1 ✓")).toBeVisible();
  await page.getByRole("button", { name: "Camera sluiten" }).click();

  // Note
  await page.getByTestId("btn-note").click();
  await page.getByLabel("Notitie", { exact: true }).fill("Kabelschade bij de oprit, afgezet met hekken.");
  await page.getByTestId("save-note").click();

  await expect(page.getByTestId("capture-grid").locator("li")).toHaveCount(2);
});
