import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { UserRound } from "lucide-react";
import { db } from "@/db/client";
import { memberships, organizations, users } from "@/db/schema";
import { authMode } from "@/lib/auth/session";
import { demoSignIn } from "@/lib/auth/demo-actions";
import { ROLE_LABELS } from "@/lib/domain";

export const metadata = { title: "Demo-login" };

export default async function DemoLoginPage(props: PageProps<"/demo-login">) {
  if (authMode() === "clerk") redirect("/sign-in");
  if (authMode() !== "demo") redirect("/configuratie");
  const { terug } = await props.searchParams;
  const rows = await db
    .select({ user: users, role: memberships.role, org: organizations })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .orderBy(asc(organizations.name), asc(memberships.role), asc(users.name));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 py-12">
      <div>
        <h1 className="text-2xl font-bold">Demo-omgeving</h1>
        <p className="mt-1 text-muted-foreground">
          Clerk is niet geconfigureerd; kies een demo-gebruiker om in te loggen. Elke rol laat andere mogelijkheden zien.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          Er zijn nog geen gebruikers. Voer <code className="font-mono">pnpm db:seed</code> uit om de demodata te laden.
        </p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={`${r.org.id}-${r.user.id}`}>
              <form action={demoSignIn}>
                <input type="hidden" name="userId" value={r.user.id} />
                <input type="hidden" name="orgId" value={r.org.id} />
                <input type="hidden" name="terug" value={typeof terug === "string" ? terug : "/dashboard"} />
                <button
                  type="submit"
                  className="flex w-full items-center gap-4 rounded-xl border p-4 text-left transition hover:border-primary hover:bg-muted/50"
                  data-testid={`demo-user-${r.role}`}
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <UserRound className="size-5" aria-hidden />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{r.user.name}</span>
                    <span className="block text-sm text-muted-foreground">
                      {ROLE_LABELS[r.role]} · {r.org.name}
                    </span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
