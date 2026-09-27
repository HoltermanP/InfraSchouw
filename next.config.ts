import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const FFMPEG_BIN = "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "@react-pdf/renderer", "exceljs", "pg", "ffmpeg-static"],
  // The ffmpeg binary is loaded at runtime (audio chunking / keyframes for imported video).
  // Point at pnpm's real package directory: including files through the node_modules/ffmpeg-static
  // symlink makes Vercel reject the function ("files in symlinked directories").
  outputFileTracingIncludes: {
    "/api/jobs/run": [FFMPEG_BIN],
    "/api/sync": [FFMPEG_BIN],
    "/api/ingest/glasses": [FFMPEG_BIN],
    "/api/import": [FFMPEG_BIN],
  },
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
    authInterrupts: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
