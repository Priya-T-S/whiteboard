import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client"],
  // Pin the workspace root so Turbopack ignores lockfiles further up the tree.
  turbopack: { root: __dirname },
};

export default nextConfig;
