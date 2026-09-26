import { and, eq, isNull } from "drizzle-orm";
import { AppNav } from "@/components/layout/app-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { db } from "@/db/client";
import { captures } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const inbox = await db.$count(captures, and(eq(captures.orgId, session.org.id), isNull(captures.inspectionId)));
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AppNav
        role={session.role}
        inboxCount={inbox}
        orgName={session.org.name}
        userSlot={<UserMenu mode={session.mode} name={session.user.name} role={session.role} />}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {env.demoMode ? (
          <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900 print:hidden">
            Demo-omgeving — gegevens zijn fictief.{!env.openai.enabled && " AI-stappen worden overgeslagen (geen OpenAI-sleutel)."}
          </div>
        ) : !env.openai.enabled ? (
          <div className="bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground print:hidden">
            AI is niet geconfigureerd: AI-stappen worden overgeslagen.
          </div>
        ) : null}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
