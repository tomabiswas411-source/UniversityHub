import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Type errors now FAIL the build — src/ compiles clean and sandbox
     dirs are excluded in tsconfig, so a regression becomes visible at
     deploy time instead of shipping silently. */
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  /* Day 45 — long-lived immutable caching for versioned static assets;
     sw.js must stay no-cache so updates roll out immediately. */
  async headers() {
    return [
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/notification.mp3",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
    ];
  },
};

export default nextConfig;
