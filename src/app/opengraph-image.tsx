import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Leste Barbearia — Agende seu horário'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lestebarbearia.agenciajn.com.br'

  const logoUrl = `${siteUrl}/logo-barbearialeste.png`

  return new ImageResponse(
    (
      <div
        style={{
          background: '#111111',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Barra superior — cores da bandeira / poste de barbearia */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: 'linear-gradient(90deg, #C0392B 0%, #8e1a12 35%, #1a5fa8 65%, #2E86C1 100%)',
            display: 'flex',
          }}
        />

        {/* Brilho radial suave ao fundo */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 700,
            height: 700,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          width={320}
          height={320}
          style={{ objectFit: 'contain' }}
          alt=""
        />

        {/* Tagline */}
        <div
          style={{
            color: '#777777',
            fontSize: 26,
            marginTop: 12,
            letterSpacing: 8,
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          Agende seu horário
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            color: '#3a3a3a',
            fontSize: 18,
            letterSpacing: 1,
            display: 'flex',
          }}
        >
          lestebarbearia.agenciajn.com.br
        </div>

        {/* Barra inferior */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: 'linear-gradient(90deg, #C0392B 0%, #8e1a12 35%, #1a5fa8 65%, #2E86C1 100%)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
