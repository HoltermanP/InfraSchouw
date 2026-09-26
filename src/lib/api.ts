import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError, NotFoundError } from "@/db/scope";
import { getSession, type ActiveSession } from "@/lib/auth/session";
import { roleAtLeast, type Role } from "@/lib/domain";
import { RateLimitError } from "@/lib/rate-limit";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function toErrorResponse(err: unknown) {
  if (err instanceof ApiError) return jsonError(err.status, err.message, err.code ? { code: err.code } : undefined);
  if (err instanceof ForbiddenError) return jsonError(403, err.message);
  if (err instanceof NotFoundError) return jsonError(404, err.message);
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { error: err.message },
      { status: 429, headers: { "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)) } },
    );
  }
  if (err instanceof ZodError) {
    return jsonError(400, "Ongeldige invoer.", { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  console.error("[api] unexpected error", err);
  return jsonError(500, "Er ging iets mis op de server.");
}

type Handler<C> = (req: Request, session: ActiveSession, context: C) => Promise<Response>;

/** Wrap an authenticated API route handler (session + optional role). */
export function withSession<C = unknown>(handler: Handler<C>, minRole?: Role) {
  return async (req: Request, context: C) => {
    try {
      const session = await getSession();
      if (session.status !== "ok") return jsonError(401, "Niet ingelogd.");
      if (minRole && !roleAtLeast(session.role, minRole)) return jsonError(403, "Je hebt geen rechten voor deze actie.");
      return await handler(req, session, context);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** Wrap a public API handler with uniform error handling. */
export function withErrors<C = unknown>(handler: (req: Request, context: C) => Promise<Response>) {
  return async (req: Request, context: C) => {
    try {
      return await handler(req, context);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
