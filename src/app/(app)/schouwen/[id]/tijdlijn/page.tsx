import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, Mic, Video, StickyNote, Ruler, ScanLine, PenLine, MessageSquareQuote } from "lucide-react";
import { PageBody } from "@/components/layout/page-header";
import { CaptureMedia } from "@/components/inspections/inspection-map-view";
import { requireSession } from "@/lib/auth/session";
import { loadInspectionContext } from "@/lib/report/context";
import { captureDtos } from "@/lib/report/dto";
import { CAPTURE_TYPE_LABELS, type CaptureType } from "@/lib/domain";
import { fmtTime, fmtDate } from "@/lib/format";

export const metadata = { title: "Schouw — tijdlijn" };

const ICONS: Record<CaptureType, typeof Camera> = { photo: Camera, video: Video, audio: Mic, note: StickyNote, measurement: Ruler, scan: ScanLine, sketch: PenLine };

export default async function TimelinePage(props: PageProps<"/schouwen/[id]/tijdlijn">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  const caps = captureDtos(ctx);
  type Entry = { t: number; kind: "capture"; c: (typeof caps)[number] } | { t: number; kind: "segment"; text: string; captureIds: string[]; end: number };
  const entries: Entry[] = [
    ...caps.map((c) => ({ t: Date.parse(c.capturedAt), kind: "capture" as const, c })),
    ...ctx.segments.map((s) => ({ t: s.startAt.getTime(), end: s.endAt.getTime(), kind: "segment" as const, text: s.text, captureIds: s.captureIds })),
  ].sort((a, b) => a.t - b.t);
  const seqOf = new Map(caps.map((c) => [c.id, c.seq]));
  return (
    <PageBody>
      <p className="text-sm text-muted-foreground">
        {fmtDate(ctx.inspection.startedAt)} · {entries.length} items · gelopen afstand {ctx.track ? `${Math.round(ctx.track.lengthM)} m` : "onbekend"}
      </p>
      <ol className="relative flex flex-col gap-4 border-l pl-6" data-testid="timeline">
        {entries.map((e, i) => {
          if (e.kind === "segment") {
            return (
              <li key={`s-${i}`} className="relative">
                <span className="absolute top-1 -left-[31px] flex size-6 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                  <MessageSquareQuote className="size-3.5" />
                </span>
                <p className="text-xs text-muted-foreground">
                  {fmtTime(new Date(e.t), true)} – {fmtTime(new Date(e.end), true)} · Transcriptie
                  {e.captureIds.length ? ` · gekoppeld aan foto ${e.captureIds.map((cid) => seqOf.get(cid)).filter(Boolean).join(", ")}` : ""}
                </p>
                <p className="italic">“{e.text}”</p>
              </li>
            );
          }
          const Icon = ICONS[e.c.type];
          return (
            <li key={e.c.id} className="relative" id={`capture-${e.c.id}`}>
              <span className="absolute top-1 -left-[31px] flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-3.5" />
              </span>
              <p className="text-xs text-muted-foreground">
                {fmtTime(e.c.capturedAt, true)} · {CAPTURE_TYPE_LABELS[e.c.type]} {e.c.seq ? `(foto ${e.c.seq})` : ""}
                {e.c.shot ? ` · ${e.c.shot}` : ""}
                {e.c.lat !== null ? (
                  <>
                    {" · "}
                    <Link href={`/schouwen/${id}?capture=${e.c.id}`} className="text-primary hover:underline">
                      op kaart
                    </Link>
                  </>
                ) : null}
              </p>
              <div className="mt-1 max-w-md">
                <CaptureMedia c={e.c} />
              </div>
              {e.c.analysis ? <p className="mt-1 text-sm text-muted-foreground">{e.c.analysis.caption}</p> : null}
              {e.c.note ? <p className="mt-1 text-sm">{e.c.note}</p> : null}
            </li>
          );
        })}
      </ol>
    </PageBody>
  );
}
