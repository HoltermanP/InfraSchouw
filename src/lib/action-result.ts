import { ZodError } from "zod";
import { ForbiddenError, NotFoundError } from "@/db/scope";

export type ActionResult<T = null> = { ok: true; data: T; message?: string } | { ok: false; error: string };

/** Run a server-action body and convert expected errors into a result. */
export async function safeAction<T>(fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (err) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return { ok: false, error: first ? `${first.path.join(".") || "invoer"}: ${first.message}` : "Ongeldige invoer." };
    }
    if (err instanceof ForbiddenError || err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof Error && err.name === "UserError") return { ok: false, error: err.message };
    // Next.js redirect()/notFound() must propagate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error("[action] unexpected error", err);
    return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." };
  }
}

/** Error with a message that is safe to show to the user. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
