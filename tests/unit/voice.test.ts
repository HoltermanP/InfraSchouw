import { describe, expect, it } from "vitest";
import { parseVoiceCommand } from "@/lib/voice/commands";

describe("voice commands (nl-NL)", () => {
  it.each([
    ["Foto", { type: "photo" }],
    ["maak een foto", { type: "photo" }],
    ["start video", { type: "start-video" }],
    ["Stop video.", { type: "stop-video" }],
    ["start opname", { type: "start-audio" }],
    ["stop opname", { type: "stop-audio" }],
    ["volgende shot", { type: "next-shot" }],
    ["vorige shot", { type: "previous-shot" }],
    ["scan", { type: "scan" }],
    ["afronden", { type: "finish" }],
    ["stop handsfree", { type: "stop-handsfree" }],
  ])("%s", (input, expected) => {
    expect(parseVoiceCommand(input)).toEqual(expected);
  });

  it("parses notes and keeps the original casing", () => {
    expect(parseVoiceCommand("notitie Kabel ligt onder de KLIC-leiding")).toEqual({ type: "note", text: "Kabel ligt onder de KLIC-leiding" });
  });

  it("parses findings with priority", () => {
    expect(parseVoiceCommand("bevinding hoog afzetting ontbreekt bij sleuf")).toEqual({ type: "finding", priority: "hoog", text: "afzetting ontbreekt bij sleuf" });
    expect(parseVoiceCommand("bevinding scheur in gevel")).toMatchObject({ type: "finding", priority: "midden", text: "scheur in gevel" });
  });

  it("parses measurements with units and number words", () => {
    expect(parseVoiceCommand("meting diepte 72 centimeter")).toEqual({ type: "measurement", kind: "diepte", value: 72, unit: "cm", label: "Diepte" });
    expect(parseVoiceCommand("meting lengte 12,5 meter")).toMatchObject({ kind: "lengte", value: 12.5, unit: "m" });
    expect(parseVoiceCommand("meting aantal drie")).toMatchObject({ kind: "aantal", value: 3, unit: "st" });
  });

  it("returns unknown for other speech", () => {
    expect(parseVoiceCommand("het regent")).toEqual({ type: "unknown", text: "het regent" });
  });
});

import { matchTemplateByVoice, parseGlassesHomeCommand } from "@/lib/voice/commands";

describe("glasses home commands", () => {
  const templates = [
    { id: "a", name: "Tracéschouw" },
    { id: "b", name: "Stationsopleveringsschouw" },
    { id: "c", name: "Calamiteit-/storingsschouw" },
  ];
  it("matches templates by spoken name (accent-insensitive)", () => {
    expect(matchTemplateByVoice("nieuwe schouw trace", templates)?.id).toBe("a");
    expect(parseGlassesHomeCommand("nieuwe schouw calamiteit", templates)).toEqual({ type: "new", templateId: "c" });
  });
  it("opens inspections by number", () => {
    expect(parseGlassesHomeCommand("open schouw 2", templates)).toEqual({ type: "open", index: 1 });
    expect(parseGlassesHomeCommand("schouw een", templates)).toEqual({ type: "open", index: 0 });
  });
});
