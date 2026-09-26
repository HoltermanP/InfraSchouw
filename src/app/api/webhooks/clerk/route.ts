import { NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, users } from "@/db/schema";
import { ensureStandardTemplates } from "@/db/queries/templates";
import { mapClerkRole } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/api";

/**
 * Clerk → database sync (Svix-signed). Keeps organisations, users and
 * memberships in step with Clerk. Roles are only set on first sync; after
 * that the app's own role management is authoritative.
 */
export async function POST(req: Request) {
  if (!env.clerk.webhookSecret) return jsonError(404, "Webhook niet geconfigureerd.");
  let evt: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    evt = await verifyWebhook(req as never, { signingSecret: env.clerk.webhookSecret });
  } catch {
    return jsonError(400, "Ongeldige webhook-handtekening.");
  }
  switch (evt.type) {
    case "organization.created":
    case "organization.updated": {
      const d = evt.data;
      const [org] = await db
        .insert(organizations)
        .values({ clerkOrgId: d.id, name: d.name, slug: d.slug })
        .onConflictDoUpdate({ target: organizations.clerkOrgId, set: { name: d.name, slug: d.slug } })
        .returning();
      await ensureStandardTemplates(org!.id);
      break;
    }
    case "organization.deleted":
      if (evt.data.id) await db.delete(organizations).where(eq(organizations.clerkOrgId, evt.data.id));
      break;
    case "user.created":
    case "user.updated": {
      const d = evt.data;
      const email = d.email_addresses.find((e) => e.id === d.primary_email_address_id)?.email_address ?? d.email_addresses[0]?.email_address ?? `${d.id}@onbekend`;
      const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.username || email;
      await db
        .insert(users)
        .values({ clerkUserId: d.id, email, name, imageUrl: d.image_url })
        .onConflictDoUpdate({ target: users.clerkUserId, set: { email, name, imageUrl: d.image_url } });
      break;
    }
    case "user.deleted":
      if (evt.data.id) await db.delete(users).where(eq(users.clerkUserId, evt.data.id));
      break;
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const d = evt.data;
      const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, d.organization.id));
      const clerkUserId = d.public_user_data.user_id;
      let [user] = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId));
      if (!user) {
        [user] = await db
          .insert(users)
          .values({ clerkUserId, email: d.public_user_data.identifier, name: [d.public_user_data.first_name, d.public_user_data.last_name].filter(Boolean).join(" ") || d.public_user_data.identifier })
          .onConflictDoNothing()
          .returning();
      }
      if (org && user) {
        await db.insert(memberships).values({ orgId: org.id, userId: user.id, role: mapClerkRole(d.role) }).onConflictDoNothing();
      }
      break;
    }
    case "organizationMembership.deleted": {
      const d = evt.data;
      const [org] = await db.select().from(organizations).where(eq(organizations.clerkOrgId, d.organization.id));
      const [user] = await db.select().from(users).where(eq(users.clerkUserId, d.public_user_data.user_id));
      if (org && user) await db.delete(memberships).where(and(eq(memberships.orgId, org.id), eq(memberships.userId, user.id)));
      break;
    }
    default:
      break;
  }
  return NextResponse.json({ ok: true });
}
