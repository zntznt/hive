import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // photo uploads (avatar, banner, payment proofs) travel through server
      // actions as FormData; raw phone screenshots can easily pass 1 MB
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
