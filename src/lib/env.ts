import "server-only";

/**
 * Central access to environment configuration. Every optional integration
 * degrades gracefully when its variables are absent, so the app can run as a
 * local demo without any third-party account.
 */
function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

export const env = {
  get databaseUrl() {
    const url = read("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL ontbreekt. Zie .env.example.");
    return url;
  },
  get appUrl() {
    return (read("APP_URL") ?? (read("VERCEL_URL") ? `https://${read("VERCEL_URL")}` : "http://localhost:3000")).replace(/\/$/, "");
  },
  get demoMode() {
    return read("DEMO_MODE") === "true";
  },
  clerk: {
    get enabled() {
      return Boolean(read("CLERK_SECRET_KEY") && read("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"));
    },
    get webhookSecret() {
      return read("CLERK_WEBHOOK_SECRET");
    },
  },
  blob: {
    get token() {
      return read("BLOB_READ_WRITE_TOKEN");
    },
    get enabled() {
      return Boolean(read("BLOB_READ_WRITE_TOKEN"));
    },
  },
  redis: {
    get url() {
      return read("UPSTASH_REDIS_REST_URL");
    },
    get token() {
      return read("UPSTASH_REDIS_REST_TOKEN");
    },
    get enabled() {
      return Boolean(read("UPSTASH_REDIS_REST_URL") && read("UPSTASH_REDIS_REST_TOKEN"));
    },
  },
  qstash: {
    get token() {
      return read("QSTASH_TOKEN");
    },
    get currentSigningKey() {
      return read("QSTASH_CURRENT_SIGNING_KEY");
    },
    get nextSigningKey() {
      return read("QSTASH_NEXT_SIGNING_KEY");
    },
    get enabled() {
      return Boolean(read("QSTASH_TOKEN") && read("QSTASH_CURRENT_SIGNING_KEY") && read("QSTASH_NEXT_SIGNING_KEY"));
    },
  },
  openai: {
    get apiKey() {
      return read("OPENAI_API_KEY");
    },
    get enabled() {
      return Boolean(read("OPENAI_API_KEY"));
    },
    get baseUrl() {
      return read("OPENAI_BASE_URL");
    },
    get visionModel() {
      return read("OPENAI_MODEL_VISION") ?? "gpt-6-luna";
    },
    get reportModel() {
      return read("OPENAI_MODEL_REPORT") ?? "gpt-6-astra";
    },
    get transcribeModel() {
      return read("OPENAI_MODEL_TRANSCRIBE") ?? "gpt-4o-transcribe-diarize";
    },
  },
};
