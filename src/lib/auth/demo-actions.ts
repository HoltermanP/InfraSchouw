"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { authMode, DEMO_ORG_COOKIE, DEMO_USER_COOKIE } from "./session";

function safeReturnPath(value: FormDataEntryValue | null): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

export async function demoSignIn(formData: FormData) {
  if (authMode() !== "demo") throw new Error("Demo-login is niet actief.");
  const userId = String(formData.get("userId") ?? "");
  const orgId = String(formData.get("orgId") ?? "");
  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)))
    .limit(1);
  if (!membership) throw new Error("Onbekende demo-gebruiker.");
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };
  jar.set(DEMO_USER_COOKIE, userId, opts);
  jar.set(DEMO_ORG_COOKIE, orgId, opts);
  redirect(safeReturnPath(formData.get("terug")));
}

export async function demoSignOut() {
  const jar = await cookies();
  jar.delete(DEMO_USER_COOKIE);
  jar.delete(DEMO_ORG_COOKIE);
  redirect("/demo-login");
}
