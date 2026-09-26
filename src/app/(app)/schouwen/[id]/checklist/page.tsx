import { notFound } from "next/navigation";
import { PageBody } from "@/components/layout/page-header";
import { ChecklistEditor } from "@/components/inspections/checklist-editor";
import { requireSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/domain";
import { loadInspectionContext } from "@/lib/report/context";
import { captureUrl } from "@/lib/media-url";

export const metadata = { title: "Schouw — checklist" };

export default async function ChecklistPage(props: PageProps<"/schouwen/[id]/checklist">) {
  const { id } = await props.params;
  const session = await requireSession();
  const ctx = await loadInspectionContext(session.org.id, id);
  if (!ctx) notFound();
  const seq = new Map(ctx.captures.map((c) => [c.id, c.seq]));
  const skippedShots = ctx.inspection.skipped.filter((s) => s.kind === "shot");
  return (
    <PageBody>
      <ChecklistEditor
        inspectionId={id}
        canEdit={roleAtLeast(session.role, "schouwer")}
        rows={ctx.template.checklist.map((item) => {
          const a = ctx.answers.find((x) => x.itemId === item.id);
          const skip = ctx.inspection.skipped.find((s) => s.kind === "checklist" && s.refId === item.id);
          return {
            itemId: item.id,
            question: item.question,
            answerType: item.answerType,
            options: item.options,
            required: item.required,
            photoRequired: item.photoRequired,
            value: a?.value ?? null,
            note: a?.note ?? null,
            skippedReason: a?.skippedReason ?? skip?.reason ?? null,
            photos: (a?.captureIds ?? []).map((cid) => ({ id: cid, seq: seq.get(cid) ?? null, thumb: captureUrl(cid, "thumb") })),
          };
        })}
      />
      {skippedShots.length ? (
        <section>
          <h2 className="mb-2 font-semibold">Bewust overgeslagen foto&apos;s</h2>
          <ul className="list-disc pl-5 text-sm">
            {skippedShots.map((s) => (
              <li key={s.refId}>
                {ctx.template.shots.find((x) => x.id === s.refId)?.title ?? "Shot"} — {s.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </PageBody>
  );
}
