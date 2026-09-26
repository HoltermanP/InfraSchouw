import "server-only";

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
