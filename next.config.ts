import type { NextConfig } from "next";

// ─── Cabeçalhos de segurança ───────────────────────────────────────────────
// Aplicados a todas as rotas. Escolha deliberada: NÃO restringimos `script-src`
// nem `default-src` aqui, porque o app carrega o SDK do Mercado Pago e tem dois
// scripts inline (PWA + service worker) — uma CSP estrita de script quebraria o
// pagamento e a instalação do PWA. Isso exige nonce e é uma mudança testada à
// parte (ver docs/PLANEJAMENTO-SAAS.md, seção de segurança).
//
// O que entra aqui é o conjunto que fecha as brechas SEM risco de quebra:
//   - frame-ancestors: bloqueia clickjacking contra login/admin
//   - nosniff: impede o browser de "adivinhar" tipo de conteúdo (defesa XSS)
//   - Referrer-Policy: não vaza a URL completa para terceiros
//   - Permissions-Policy: desliga câmera/microfone/geolocalização (app não usa)
//   - HSTS com includeSubDomains: força HTTPS em todos os subdomínios
//   - object-src 'none' / base-uri 'self': travam vetores de injeção clássicos
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://auth.mercadopago.com.br",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Força transpilação de pacotes modernos para garantir compatibilidade
  // com iOS 15 (Safari 15), Android Chrome antigo e outros browsers.
  transpilePackages: ['@base-ui/react', 'lucide-react'],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
