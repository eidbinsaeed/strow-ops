import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict typed routes (catches stale links at compile time)
  typedRoutes: true,
  // Image config — allow Drive thumbnails when wired up
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "drive.google.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
