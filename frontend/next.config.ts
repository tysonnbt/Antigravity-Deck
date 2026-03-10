import type { NextConfig } from "next";

// Backend port: 3500 for local dev, 9807 when launched by start-tunnel.js
const BE_PORT = process.env.BACKEND_PORT || '3500';
const BE_HOST = `http://localhost:${BE_PORT}`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false, // hide the floating Next.js "N" logo

  // Allow long-running backend responses (e.g. workspace create waits up to 30s for LS detection)
  experimental: {
    proxyTimeout: 60_000, // 60s proxy timeout (default is ~30s)
  },

  // Keep backend connections alive for efficiency
  httpAgentOptions: {
    keepAlive: true,
  },

  // Proxy /api/* and /ws/* to Express backend — works on any OS, no CORS ever
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BE_HOST}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
