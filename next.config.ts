import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only packages (one is a native module); keep them out of the bundler.
  serverExternalPackages: ["pdf-lib", "better-sqlite3"],
};

export default nextConfig;
