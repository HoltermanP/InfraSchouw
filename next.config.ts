import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "@react-pdf/renderer", "exceljs", "pg", "ffmpeg-static"],
  // The ffmpeg binary is loaded at runtime (audio chunking / keyframes for imported video).
  outputFileTracingIncludes: {
    "/api/jobs/run": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/sync": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/ingest/glasses": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/import": ["./node_modules/ffmpeg-static/ffmpeg"],
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
