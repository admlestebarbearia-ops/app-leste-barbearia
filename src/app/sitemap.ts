import type { MetadataRoute } from 'next'

// O public/robots.txt anuncia https://lestebarbearia.agenciajn.com.br/sitemap.xml
// desde sempre, mas o arquivo nunca existiu — a URL respondia 404. Isso importa
// para a verificacao de marca do Google: a home precisa ser publicamente
// acessivel e rastreavel, e um sitemap quebrado e um sinal ruim gratuito.
//
// So entram paginas publicas. /agendar, /reservas, /perfil e /admin dependem de
// contexto do usuario e ficam de fora de proposito.

const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
).replace(/\/$/, '')

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    // /app e a landing publica (Application Homepage declarada no Google).
    { url: `${siteUrl}/app`, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/`, lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${siteUrl}/privacidade`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${siteUrl}/termos`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
  ]
}
