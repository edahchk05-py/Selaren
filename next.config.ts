import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["bcryptjs"],
  // Meta/ngrok HTTPS host may hit the App Router during webhook or UI checks.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.100.199",
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.io",
  ],
};

export default nextConfig;
