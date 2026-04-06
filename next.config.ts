import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Força transpilação de pacotes modernos para garantir compatibilidade
  // com iOS 15 (Safari 15), Android Chrome antigo e outros browsers.
  transpilePackages: ['@base-ui/react', 'lucide-react'],
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
