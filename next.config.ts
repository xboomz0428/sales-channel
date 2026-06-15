import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx uses Node.js built-ins (crypto, buffer, fs) that Turbopack can't bundle
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
