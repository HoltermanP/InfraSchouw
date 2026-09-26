import { expect, test } from "@playwright/test";
import { expectToast, loginAs } from "./helpers";

test("PDF, Word, Excel, ZIP en GeoJSON export met de demodata", async ({ page }) => {
  await loginAs(page, "lezer");
  await page.goto("/schouwen");
  const href = (await page.getByRole("link", { name: "Tracéschouw MS-ring Frankhuizerallee – Werkerlaan" }).getAttribute("href"))!;
  const id = href.split("/").pop();
  const expected: Record<string, string> = { pdf: "application/pdf", docx: "wordprocessingml", xlsx: "spreadsheetml", zip: "application/zip", geojson: "geo+json" };
  for (const [fmt, type] of Object.entries(expected)) {
    const res = await page.request.get(`/api/exports/inspections/${id}/${fmt}`);
    expect(res.status(), fmt).toBe(200);
    expect(res.headers()["content-type"], fmt).toContain(type);
    const body = await res.body();
    expect(body.byteLength, fmt).toBeGreaterThan(500);
    if (fmt === "pdf") expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    if (fmt === "geojson") expect(JSON.parse(body.toString()).features.length).toBeGreaterThan(10);
  }
});

test("smart glasses: simulator stuurt via token naar de ingest-API, capture landt in de inbox en wordt toegewezen", async ({ page }) => {
  await loginAs(page, "admin", "/dev/glasses-simulator");
  await page.getByTestId("sim-create-device").click();
  await expect(page.getByTestId("sim-token")).toHaveValue(/^isg_/);
  await page.getByTestId("sim-status").click();
  await expect(page.getByText(/inbox|lopende schouw/).first()).toBeVisible();
  await page.getByTestId("sim-send-photo").click();
  await expect(page.getByTestId("sim-log").getByText("→ 201")).toBeVisible({ timeout: 30_000 });
  await page.goto("/inbox");
  await expect.poll(() => page.getByTestId("inbox-list").locator("li").count()).toBeGreaterThanOrEqual(3);
  await page.getByTestId("inbox-list").locator("li").first().click();
  await page.getByTestId("assign-inbox").click();
  await expectToast(page, "Toegewezen aan schouw");
});

test("ingest-API weigert ongeldig of ingetrokken token", async ({ request }) => {
  const res = await request.post("/api/ingest/glasses", { headers: { Authorization: "Bearer isg_nope1234_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }, multipart: { type: "photo" } });
  expect(res.status()).toBe(401);
});

test("bril-UI laadt en is volledig op spraak ingericht", async ({ page }) => {
  await loginAs(page, "schouwer", "/veld/bril");
  await expect(page.getByRole("heading", { name: "InfraSchouw — bril" })).toBeVisible();
  await expect(page.getByText(/nieuwe schouw/).first()).toBeVisible();
});

test("rollen worden afgedwongen", async ({ page }) => {
  await loginAs(page, "lezer");
  await expect(page.getByRole("link", { name: "Nieuwe schouw" })).toHaveCount(0);
  const settings = await page.goto("/instellingen");
  expect(settings?.status()).toBe(403);
  const sync = await page.request.post("/api/sync", { data: { ops: [{ id: "1", kind: "capture.delete", payload: { id: crypto.randomUUID() } }] } });
  expect(sync.status()).toBe(403);
  const unauth = await page.context().browser()!.newContext();
  const res = await unauth.request.get(`${test.info().project.use.baseURL}/api/field/bootstrap`);
  expect(res.status()).toBe(401);
  await unauth.close();
});
