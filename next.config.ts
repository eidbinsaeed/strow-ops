import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    // Closing/expense submissions ship the receipt photo as base64 in a hidden
    // form field, which can easily exceed the default 1 MB Server Actions limit.
    // Bump to 10 MB - covers a high-resolution phone photo, still bounded.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
