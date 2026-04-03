import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vvpiuprztpvqvlscjkow.supabase.co',
      },
    ],
  },
};

export default nextConfig;
