import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export type MockCalls = { responses: { format: string; input: string }[]; transcriptions: number };

function responseBody(model: string, payload: unknown) {
  return {
    id: `resp_${Math.random().toString(36).slice(2)}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [{ type: "message", id: "msg_1", status: "completed", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(payload), annotations: [] }] }],
    usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    parallel_tool_calls: true,
    tool_choice: "auto",
    tools: [],
    text: { format: { type: "text" } },
  };
}

/** MSW server that imitates the OpenAI Responses + transcription APIs. */
export function createOpenAiMock(opts: { invalidCaptureId?: string } = {}) {
  const calls: MockCalls = { responses: [], transcriptions: 0 };
  const server = setupServer(
    http.post("https://api.openai.com/v1/responses", async ({ request }) => {
      const body = (await request.json()) as { model: string; text?: { format?: { name?: string } }; input: unknown };
      const format = body.text?.format?.name ?? "";
      const input = JSON.stringify(body.input);
      calls.responses.push({ format, input });
      const ids = [...new Set([...input.matchAll(/Foto capture_id=([0-9a-f-]{36})/g)].map((m) => m[1]!))];
      if (format === "capture_analysis") {
        return HttpResponse.json(
          responseBody(body.model, {
            caption: "Kabelsleuf met duimstok",
            description: "Open sleuf met MS-kabel op circa 70 cm diepte.",
            tags: ["sleuf", "kabel"],
            detected_objects: ["duimstok", "kabel"],
            possible_findings: [{ category: "kwaliteit", description: "Diepte lijkt onder norm", priority: "midden", confidence: 0.6 }],
            ocr_text: null,
            nameplate: null,
            station_component: null,
            privacy_flags: { persons_recognizable: false, license_plates_visible: false, notes: null },
          }),
        );
      }
      if (format === "transcript_extraction") {
        return HttpResponse.json(
          responseBody(body.model, {
            findings: [{ title: "Kabel te ondiep", description: "MS-kabel ligt op 65 cm", category: "kwaliteit", priority: "hoog", segment_index: 0 }],
            measurements: [{ label: "Diepte MS-kabel", kind: "diepte", value: 65, unit: "cm", segment_index: 0 }],
            actions: [{ description: "Kabel dieper leggen", owner_suggestion: "Aannemer", due_suggestion: null }],
            corrected_segments: [],
          }),
        );
      }
      if (format === "report_draft") {
        const [a, b] = ids;
        return HttpResponse.json(
          responseBody(body.model, {
            title: "Testverslag",
            summary: "Samenvatting van de test.",
            key_points: [{ title: "Kabel te ondiep", description: "Dieper leggen", priority: "hoog", category: "kwaliteit", finding_ids: ["0"], capture_ids: [a] }],
            sections: [
              { key: "bevindingen", title: "Bevindingen", blocks: [{ type: "paragraph", text: "De kabel ligt te ondiep." }, { type: "photo", capture_id: a, caption: "Sleuf" }, { type: "finding_ref", finding_index: 0 }, { type: "photo_grid", capture_ids: [b, opts.invalidCaptureId ?? "00000000-0000-4000-8000-000000000000"], caption: null }] },
            ],
            findings: [{ id: null, title: "Kabel te ondiep", description: "MS-kabel op 65 cm", location: null, priority: "hoog", category: "kwaliteit", capture_ids: [a, "11111111-1111-4111-8111-111111111111"], recommendation: "Dieper leggen tot 80 cm" }],
            actions: [{ description: "Herstel diepte", owner_suggestion: "Aannemer", due_suggestion: "2026-10-01", finding_ids: ["0"] }],
            station: null,
            quantities: null,
            open_questions: ["Is de diepte gemeten vanaf maaiveld?"],
          }),
        );
      }
      if (format === "section_draft") {
        return HttpResponse.json(responseBody(body.model, { key: "bevindingen", title: "Bevindingen", blocks: [{ type: "paragraph", text: "Herschreven sectie." }], open_questions: [] }));
      }
      return HttpResponse.json({ error: { message: `onbekend formaat ${format}` } }, { status: 400 });
    }),
    http.post("https://api.openai.com/v1/audio/transcriptions", async () => {
      calls.transcriptions++;
      return HttpResponse.json({
        task: "transcribe",
        duration: 20,
        text: "De MS-kabel ligt hier op vijfenzestig centimeter. Dat is te ondiep.",
        segments: [
          { type: "transcript.text.segment", id: "s1", start: 0, end: 8, text: "De MS-kabel ligt hier op vijfenzestig centimeter.", speaker: "A" },
          { type: "transcript.text.segment", id: "s2", start: 8, end: 20, text: "Dat is te ondiep.", speaker: "A" },
        ],
        usage: { type: "tokens", input_tokens: 200, output_tokens: 40, total_tokens: 240 },
      });
    }),
  );
  return { server, calls };
}
