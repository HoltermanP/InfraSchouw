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

test("bril-UI is volledig met spraak te bedienen: schouw starten, vastleggen, afronden", async ({ page }) => {
  // Fake Web Speech API: window.__say(text) delivers a final recognition result.
  await page.addInitScript(() => {
    type Rec = { onresult: ((e: unknown) => void) | null; onend: (() => void) | null; onerror: unknown; start(): void; stop(): void };
    const w = window as unknown as { __rec?: Rec; __say?: (t: string) => void; webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown };
    class FakeRecognition {
      lang = "nl-NL";
      continuous = true;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: unknown = null;
      constructor() {
        w.__rec = this as unknown as Rec;
      }
      start() {}
      stop() {}
    }
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
    w.__say = (t: string) => w.__rec?.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: true })] });
  });
  const say = async (t: string) => {
    await page.evaluate((text) => (window as unknown as { __say: (x: string) => void }).__say(text), t);
    await page.waitForTimeout(400);
  };
  await loginAs(page, "schouwer", "/veld/bril");
  await expect(page.getByRole("heading", { name: "InfraSchouw — bril" })).toBeVisible();
  await say("nieuwe schouw calamiteit");
  await expect(page.getByTestId("glasses-title")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500); // camera start
  await say("foto");
  await say("notitie kabel ligt ondieper dan verwacht");
  await say("bevinding hoog mantelbuis gescheurd");
  await say("meting diepte 45 centimeter");
  await expect(page.getByText(/[1-9]\d* opnames/)).toBeVisible();
  await say("afronden");
  await page.waitForTimeout(300);
  if (await page.getByTestId("glasses-finish").isVisible()) {
    await expect(page.getByTestId("glasses-finish")).toContainText("verplicht punt");
    await say("reden niet vastgelegd via de bril");
  }
  // Back on the home screen with a confirmation; nothing is running any more.
  await expect(page.getByText("SCHOUW AFGEROND")).toBeVisible();
  await expect(page.getByTestId("glasses-title")).toHaveCount(0);
  await expect(page.getByText(/^Geen\. Zeg/)).toBeVisible();
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
