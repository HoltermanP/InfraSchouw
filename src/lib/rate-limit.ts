import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Te veel verzoeken. Probeer het zo opnieuw.");
  }
}

type Bucket = "upload" | "ai" | "ingest" | "share" | "export";

const LIMITS: Record<Bucket, { tokens: number; windowSeconds: number }> = {
  upload: { tokens: 600, windowSeconds: 60 },
  ai: { tokens: 120, windowSeconds: 60 },
  ingest: { tokens: 240, windowSeconds: 60 },
  share: { tokens: 120, windowSeconds: 60 },
  export: { tokens: 30, windowSeconds: 60 },
};

let limiters: Partial<Record<Bucket, Ratelimit>> | null = null;

function upstashLimiter(bucket: Bucket): Ratelimit | null {
  if (!env.redis.enabled) return null;
  limiters ??= {};
  if (!limiters[bucket]) {
    const redis = new Redis({ url: env.redis.url!, token: env.redis.token! });
    const { tokens, windowSeconds } = LIMITS[bucket];
    limiters[bucket] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(tokens, `${windowSeconds} s`),
      prefix: `infraschouw:rl:${bucket}`,
      analytics: false,
    });
  }
  return limiters[bucket]!;
}

// In-memory fixed-window fallback (single instance; used locally/without Upstash).
const memory = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(bucket: Bucket, key: string): Promise<void> {
  const limiter = upstashLimiter(bucket);
  if (limiter) {
    const res = await limiter.limit(key);
    if (!res.success) throw new RateLimitError(Math.max(0, res.reset - Date.now()));
    return;
  }
  const { tokens, windowSeconds } = LIMITS[bucket];
  const now = Date.now();
  const id = `${bucket}:${key}`;
  const entry = memory.get(id);
  if (!entry || entry.resetAt <= now) {
    memory.set(id, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }
  entry.count += 1;
  if (entry.count > tokens) throw new RateLimitError(entry.resetAt - now);
}
