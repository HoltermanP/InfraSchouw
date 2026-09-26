import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Role } from "@/lib/domain";
import { roleAtLeast } from "@/lib/domain";
import { db, type DbOrTx } from "./client";

/**
 * Tenant context for every data access. Obtained from the authenticated
 * session (Clerk or demo), a device token (ingest) or a share-link token.
 */
export type OrgCtx = {
  orgId: string;
  userId: string | null;
  role: Role;
};

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Je hebt geen rechten voor deze actie.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Niet gevonden.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function assertRole(ctx: OrgCtx, minimum: Role, message?: string) {
  if (!roleAtLeast(ctx.role, minimum)) throw new ForbiddenError(message);
}

type OrgTable = PgTable & { orgId: PgColumn; id?: PgColumn };

/**
 * The central org filter. Every query on a tenant table goes through this so
 * data from another organisation can never be returned or modified.
 */
export function orgWhere<T extends OrgTable>(table: T, ctx: Pick<OrgCtx, "orgId">, ...conds: (SQL | undefined)[]): SQL {
  return and(eq(table.orgId, ctx.orgId), ...conds)!;
}

/** Scoped CRUD helpers. */
export function scoped(ctx: OrgCtx, conn: DbOrTx = db) {
  return {
    ctx,
    where<T extends OrgTable>(table: T, ...conds: (SQL | undefined)[]) {
      return orgWhere(table, ctx, ...conds);
    },
    async findById<T extends OrgTable & { id: PgColumn }>(table: T, id: string) {
      const rows = await conn
        .select()
        .from(table as PgTable)
        .where(orgWhere(table, ctx, eq(table.id, id)))
        .limit(1);
      return (rows[0] ?? null) as T["$inferSelect"] | null;
    },
    async getById<T extends OrgTable & { id: PgColumn }>(table: T, id: string, message?: string) {
      const row = await this.findById(table, id);
      if (!row) throw new NotFoundError(message);
      return row;
    },
    async list<T extends OrgTable>(table: T, ...conds: (SQL | undefined)[]) {
      return (await conn
        .select()
        .from(table as PgTable)
        .where(orgWhere(table, ctx, ...conds))) as T["$inferSelect"][];
    },
    async insert<T extends OrgTable>(table: T, values: Omit<T["$inferInsert"], "orgId"> | Omit<T["$inferInsert"], "orgId">[]) {
      const arr = (Array.isArray(values) ? values : [values]).map((v) => ({
        ...v,
        orgId: ctx.orgId,
        ...("createdBy" in (table as object) && ctx.userId && !(v as Record<string, unknown>).createdBy ? { createdBy: ctx.userId } : {}),
      }));
      if (arr.length === 0) return [] as T["$inferSelect"][];
      return (await conn
        .insert(table as PgTable)
        .values(arr as never)
        .returning()) as T["$inferSelect"][];
    },
    async update<T extends OrgTable & { id: PgColumn }>(table: T, id: string, values: Partial<T["$inferInsert"]>) {
      const { orgId: _ignored, ...safe } = values as Record<string, unknown>;
      void _ignored;
      const rows = (await conn
        .update(table as PgTable)
        .set(safe as never)
        .where(orgWhere(table, ctx, eq(table.id, id)))
        .returning()) as T["$inferSelect"][];
      if (rows.length === 0) throw new NotFoundError();
      return rows[0]!;
    },
    async updateWhere<T extends OrgTable>(table: T, values: Partial<T["$inferInsert"]>, ...conds: (SQL | undefined)[]) {
      const { orgId: _ignored, ...safe } = values as Record<string, unknown>;
      void _ignored;
      return (await conn
        .update(table as PgTable)
        .set(safe as never)
        .where(orgWhere(table, ctx, ...conds))
        .returning()) as T["$inferSelect"][];
    },
    async remove<T extends OrgTable & { id: PgColumn }>(table: T, id: string) {
      const rows = await conn
        .delete(table as PgTable)
        .where(orgWhere(table, ctx, eq(table.id, id)))
        .returning();
      if (rows.length === 0) throw new NotFoundError();
    },
    async removeWhere<T extends OrgTable>(table: T, ...conds: (SQL | undefined)[]) {
      return conn.delete(table as PgTable).where(orgWhere(table, ctx, ...conds));
    },
    /** Verify that all ids belong to this org (e.g. before linking). */
    async assertOwned<T extends OrgTable & { id: PgColumn }>(table: T, ids: string[]) {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return;
      const rows = await conn
        .select({ id: table.id })
        .from(table as PgTable)
        .where(orgWhere(table, ctx, inArray(table.id, unique)));
      if (rows.length !== unique.length) throw new NotFoundError("Een of meer gekoppelde items bestaan niet.");
    },
  };
}
export type Scoped = ReturnType<typeof scoped>;
