import { describe, expect, it } from "vitest";
import { billingOverview, parseBillingRows, parseCsv, parseNumber } from "@/lib/billing/import";

describe("billing import", () => {
  it("parses Dutch numbers", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("€ 38,50")).toBe(38.5);
    expect(parseNumber("1234.5")).toBe(1234.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(12)).toBe(12);
  });

  it("parses CSV with quoted fields and ; separator", () => {
    const rows = parseCsv('Postcode;Omschrijving;Eenheid;Eenheidsprijs;Hoeveelheid\n01.01;"MS-kabel ""3x240""";m;38,50;1.850\n');
    expect(rows[1]).toEqual(["01.01", 'MS-kabel "3x240"', "m", "38,50", "1.850"]);
  });

  it("maps headers and validates rows", () => {
    const { items, errors } = parseBillingRows([
      ["Bestek InfraSchouw"],
      ["Post", "Omschrijving", "Eenheid", "Prijs", "Gepland"],
      ["01.01", "MS-kabel", "m", "38,50", "1850"],
      ["01.01", "Dubbel", "m", "1", "1"],
      ["02.01", "", "m", "1", "1"],
      [],
    ]);
    expect(items).toEqual([{ code: "01.01", description: "MS-kabel", unit: "m", unitPrice: 38.5, plannedQuantity: 1850 }]);
    expect(errors.map((e) => e.row)).toEqual([4, 5]);
  });

  it("reports missing columns", () => {
    expect(parseBillingRows([["Post", "Omschrijving"]]).errors[0]!.message).toMatch(/ontbreken/);
  });

  it("computes planned vs demonstrated", () => {
    const { rows, totals } = billingOverview(
      [{ id: "a", code: "04.01", description: "RMU", unit: "st", unitPrice: 1000, plannedQuantity: 2 }],
      [
        { billingItemId: "a", quantity: 1, status: "bevestigd" },
        { billingItemId: "a", quantity: 1, status: "voorgesteld" },
        { billingItemId: "a", quantity: 5, status: "afgewezen" },
      ],
    );
    expect(rows[0]).toMatchObject({ demonstrated: 1, proposed: 1, difference: -1, demonstratedAmount: 1000 });
    expect(totals).toEqual({ planned: 2000, demonstrated: 1000, difference: -1000 });
  });
});
