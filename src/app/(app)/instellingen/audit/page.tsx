import { and, desc, eq, ilike } from "drizzle-orm";
import { PageBody } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Audit-log" };

export default async function AuditPage(props: PageProps<"/instellingen/audit">) {
  const session = await requireSession("admin");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  const rows = await db
    .select({ a: auditLog, user: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(eq(auditLog.orgId, session.org.id), q ? ilike(auditLog.summary, `%${q}%`) : undefined, type ? eq(auditLog.entityType, type) : undefined))
    .orderBy(desc(auditLog.createdAt))
    .limit(300);
  return (
    <PageBody>
      <form className="flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Zoek in omschrijving" className="max-w-xs" aria-label="Zoeken" />
        <Input name="type" defaultValue={type} placeholder="objecttype (bijv. report)" className="max-w-xs" aria-label="Objecttype" />
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="px-2 py-1 text-left">Tijd</th>
              <th className="px-2 py-1 text-left">Wie</th>
              <th className="px-2 py-1 text-left">Actie</th>
              <th className="px-2 py-1 text-left">Object</th>
              <th className="px-2 py-1 text-left">Omschrijving</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, user }) => (
              <tr key={a.id} className="border-t align-top">
                <td className="px-2 py-1 whitespace-nowrap">{fmtDateTime(a.createdAt)}</td>
                <td className="px-2 py-1">{user ?? "Systeem/AI"}</td>
                <td className="px-2 py-1 font-mono text-xs">{a.action}</td>
                <td className="px-2 py-1 text-xs">{a.entityType}</td>
                <td className="px-2 py-1">
                  {a.summary}
                  {a.diff && Object.keys(a.diff).length ? (
                    <details className="text-xs text-muted-foreground">
                      <summary>details</summary>
                      <pre className="max-w-xl overflow-auto">{JSON.stringify(a.diff, null, 2)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageBody>
  );
}
