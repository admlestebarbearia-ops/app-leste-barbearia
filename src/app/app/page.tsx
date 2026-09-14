import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Oswald } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import type { BusinessConfig } from '@/lib/supabase/types'
import { PointerParallax } from './PointerParallax'
import { GoogleButton } from './GoogleButton'
import styles from './landing.module.css'

export const runtime = 'edge'

// ─────────────────────────────────────────────────────────────────────────────
// /app — LANDING PUBLICA OFICIAL DA LESTE BARBEARIA
//
// Esta pagina e a "Application Homepage" declarada na tela de consentimento
// OAuth do Google e, ao mesmo tempo, a pagina de marca da barbearia (destino de
// trafego pago local).
//
// REGRAS QUE ESTA PAGINA PRECISA RESPEITAR:
//
//  1. A rota `/` NAO muda, e nenhum componente dela e tocado. O botao do Google
//     daqui e o ./GoogleButton, isolado — nao o LoginButton compartilhado.
//  2. Nada de dado operacional do painel: nao le `services`, nao mostra preco.
//     Os nomes cadastrados sao operacionais ("Corte e luzes aparti") e nao
//     servem como peca de marketing — o conteudo de servico e texto no codigo.
//  3. Nada de HORARIO FIXO. O barbeiro muda a agenda o tempo todo; publicar
//     "Seg 10:30-19:00" seria informacao que envelhece sozinha. A landing diz
//     que o atendimento e com hora marcada e manda consultar a agenda real.
//  4. Nada de dado privado: nao le `appointments`, `profiles`, `payment_intents`
//     nem segredos. Le 4 campos de contato de `business_config`.
//  5. Nao redireciona, nao exige login, nao e uma segunda tela de login. CTA
//     comercial e "Agendar agora"; a conta Google e secundaria e contextual.
//
// Requisitos do Google atendidos (documentacao consultada em 14/09/2026):
// publica sem login · descreve a funcionalidade · explica por que os dados sao
// pedidos · linka privacidade e termos do mesmo dominio · identifica a marca.
//
// Movimento: ver landing.module.css. Tudo por transform/opacity, entrada por
// `animation-timeline: view()` (sem JS, para nao servir pagina invisivel a
// rastreador sem JS), e desligado por prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

const display = Oswald({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Leste Barbearia — Agendamento online de corte, barba e tratamentos',
  description:
    'A Leste Barbearia tem aplicativo próprio de agendamento: escolha o profissional, veja os horários livres em tempo real e confirme em menos de um minuto.',
  alternates: { canonical: '/app' },
  openGraph: {
    title: 'Leste Barbearia — Agende pelo aplicativo',
    description:
      'Corte, barba e tratamentos com hora marcada. Agende pelo aplicativo da Leste Barbearia.',
    url: '/app',
    type: 'website',
  },
}

// Paleta local: off-white, vermelho e azul do poste — tirados do proprio logo.
// Nao usa --primary do app (azul chapado) porque a landing pede um contraste
// mais cinematografico.
const INK = '#0C0C0D'
const INK_SOFT = '#141416'
const PAPER = '#F4F1EC'
const MUTED = '#8C8B90'
const DIM = '#9D9BA0'
const BLUE = '#2A6CB8'

const HOME_CONFIG_COLUMNS = 'logo_url, address, whatsapp_number, instagram_url'

type LandingConfig = Pick<
  BusinessConfig,
  'logo_url' | 'address' | 'whatsapp_number' | 'instagram_url'
>

function whatsappLink(raw: string | null): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  if (d.length < 10) return null
  return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}`
}

// Os titulos NAO repetem o H2 ("Cabelo · Barba · Tratamentos"): repetir as tres
// palavras logo abaixo do titulo grande fazia a secao parecer preenchimento.
const ESPECIALIDADES = [
  {
    n: '01',
    titulo: 'Corte e acabamento',
    texto: 'Tesoura ou máquina, acabamento na navalha e finalização feita pra durar a semana inteira.',
  },
  {
    n: '02',
    titulo: 'Barba e contorno',
    texto: 'Toalha quente, desenho no contorno e o cuidado que separa barba feita de barba aparada.',
  },
  {
    n: '03',
    titulo: 'Sobrancelha e química',
    texto: 'Relaxamento, luzes e demais tratamentos — combinados no balcão, no seu tempo.',
  },
]

const RECURSOS = [
  {
    titulo: 'Escolha quem vai te atender',
    texto: 'A agenda que aparece é sempre a do profissional que você selecionou.',
  },
  {
    titulo: 'Horários reais, na hora',
    texto: 'Você vê o que está livre de verdade, atualizado no momento em que abre.',
  },
  {
    titulo: 'Confirmação imediata',
    texto: 'Ao confirmar, o horário já entra na agenda da barbearia e fica reservado no seu nome.',
  },
  {
    titulo: 'Acompanhe e cancele',
    texto: 'Seus agendamentos ficam guardados no app, com cancelamento dentro do prazo da casa.',
  },
]

export default async function LandingPage() {
  const supabase = await createClient()

  const { data: config } = await supabase
    .from('business_config')
    .select(HOME_CONFIG_COLUMNS)
    .single()

  const cfg = config as LandingConfig | null
  const wa = whatsappLink(cfg?.whatsapp_number ?? null)
  const logo = cfg?.logo_url ?? '/logo-barbearialeste.png'

  return (
    <div
      className={`${styles.root} ${display.variable} min-h-screen w-full overflow-x-hidden`}
      style={{ backgroundColor: INK, color: PAPER }}
    >
      {/* ══════════════════════════ NAV ══════════════════════════ */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{ borderColor: 'rgba(244,241,236,0.08)', backgroundColor: 'rgba(12,12,13,0.72)' }}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          {/* O brasao nao entra aqui: a 32px ele vira borrao. Na barra fica o
              logotipo escrito + um pedaco do poste, girando. */}
          <Link href="/app" className={`${styles.underline} flex items-center gap-3`}>
            <span className={`${styles.pole} ${styles.poleV} h-5 w-1.5 rounded-full`} aria-hidden />
            <span
              className="text-[13px] uppercase"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.24em', fontWeight: 500 }}
            >
              Leste Barbearia
            </span>
          </Link>
          <Link
            href="/"
            className={`${styles.lift} rounded-full px-5 py-2 text-[12px] uppercase`}
            style={{
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.16em',
              backgroundColor: PAPER,
              color: INK,
              fontWeight: 500,
            }}
          >
            Agendar
          </Link>
        </div>
      </header>

      {/* ══════════════════════════ HERO ══════════════════════════ */}
      {/* Desktop: split real — a foto e retrato, então ganha coluna própria em
          vez de ser esmagada em full-bleed. Mobile: foto ao fundo com scrim. */}
      <section className="relative lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="absolute inset-0 overflow-hidden lg:relative lg:order-2 lg:inset-auto lg:h-full">
          <PointerParallax className={`${styles.parallax} absolute inset-0`}>
            <Image
              src="/fundo.jpg"
              alt="Salão da Leste Barbearia"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 48vw"
              className={`${styles.breathe} object-cover object-[55%_center]`}
            />
          </PointerParallax>
          <div
            className="absolute inset-0 lg:hidden"
            style={{
              background:
                'linear-gradient(180deg, rgba(12,12,13,0.86) 0%, rgba(12,12,13,0.62) 30%, rgba(12,12,13,0.90) 62%, rgba(12,12,13,0.98) 100%)',
            }}
          />
          <div
            className="absolute inset-0 hidden lg:block"
            style={{
              background: `linear-gradient(90deg, ${INK} 0%, rgba(12,12,13,0.45) 26%, rgba(12,12,13,0) 62%)`,
            }}
          />
        </div>

        <div className="relative lg:order-1 lg:flex lg:items-center">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 top-1/3 hidden h-96 w-96 rounded-full lg:block"
            style={{ background: 'radial-gradient(circle, rgba(214,158,74,0.14) 0%, rgba(214,158,74,0) 68%)' }}
          />

          {/* Poste vertical de verdade, encostado na margem — só onde há espaço */}
          <div className="pointer-events-none absolute left-10 top-1/2 hidden -translate-y-1/2 xl:block" aria-hidden>
            <BarberPole height={240} width={16} />
          </div>

          <div className="relative mx-auto w-full max-w-xl px-5 pb-14 pt-14 sm:px-8 lg:py-24 lg:pl-12 lg:pr-10 xl:pl-32">
            <Image
              src={logo}
              alt="Leste Barbearia"
              width={220}
              height={220}
              priority
              className="mb-8 h-24 w-24 object-contain drop-shadow-[0_16px_40px_rgba(0,0,0,0.7)] sm:h-28 sm:w-28"
            />

            <p
              className="mb-5 text-[11px] uppercase"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.42em', color: MUTED }}
            >
              São Paulo · Zona Leste
            </p>

            <h1
              className="text-[2.6rem] uppercase leading-[0.94] sm:text-6xl lg:text-[4.1rem]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '0.005em' }}
            >
              Barbearia
              {/* Segunda linha menor e em uma linha só: "BARBEARIA" domina e a
                  qualificação fica subordinada. No mesmo corpo do título, ela
                  quebrava em duas linhas e a hierarquia sumia. */}
              <span
                className="mt-2 block text-[0.5em] leading-none"
                style={{ fontWeight: 300, color: '#C9C6C1', letterSpacing: '0.05em' }}
              >
                com hora marcada
              </span>
            </h1>

            <div className={`${styles.pole} ${styles.poleH} mt-8 h-1 w-32 rounded-full`} aria-hidden />

            <p
              className="mt-7 max-w-md text-[15px] leading-relaxed sm:text-base lg:text-[17px]"
              style={{ color: '#D6D3CE' }}
            >
              A <strong style={{ color: PAPER, fontWeight: 600 }}>Leste Barbearia</strong> tem aplicativo
              próprio de agendamento. Você escolhe o serviço, o profissional e o horário, confirma em menos
              de um minuto e acompanha tudo pelo celular — sem ligação e sem fila de espera.
            </p>

            <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <Link
                href="/"
                className={`${styles.lift} inline-flex h-12 w-full items-center justify-center rounded-full px-9 text-[13px] uppercase sm:w-auto`}
                style={{
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '0.18em',
                  fontWeight: 500,
                  backgroundColor: PAPER,
                  color: INK,
                  boxShadow: '0 14px 34px rgba(0,0,0,0.55)',
                }}
              >
                Agendar agora
              </Link>
              <a href="#aplicativo" className={`${styles.underline} text-[13px]`} style={{ color: MUTED }}>
                Como funciona o app
              </a>
            </div>

            <p className="mt-6 text-[12px]" style={{ color: '#6F6E73' }}>
              Confirmação na hora · Cancelamento pelo próprio app
            </p>
          </div>
        </div>
      </section>

      {/* faixa do poste atravessando a página */}
      <div className={`${styles.pole} ${styles.poleH} h-1 w-full`} aria-hidden />

      {/* ══════════════════════ ESPECIALIDADES ══════════════════════ */}
      <section id="especialidades" className="scroll-mt-16 mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className={styles.reveal}>
          <Rotulo>Especialidades</Rotulo>
          <h2
            className="mt-4 max-w-2xl text-3xl uppercase leading-[1.05] sm:text-[2.6rem]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
          >
            Cabelo <span style={{ color: MUTED }}>·</span> Barba <span style={{ color: MUTED }}>·</span>{' '}
            Tratamentos
          </h2>
        </div>

        {/* Mobile: trilho horizontal com snap — cartões em vez de lista.
            Desktop (≥640px): vira grade de 3 colunas. Ver .rail no CSS. */}
        <div className={`${styles.rail} ${styles.revealStagger} mt-12`}>
          {ESPECIALIDADES.map((e) => (
            <article
              key={e.n}
              tabIndex={0}
              className={`${styles.card} ${styles.specCard} relative flex min-h-56 flex-col justify-between p-6 sm:min-h-0 sm:p-7`}
            >
              <span
                className={`${styles.cardNum} text-[2.6rem] leading-none`}
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, color: MUTED, opacity: 0.55 }}
              >
                {e.n}
              </span>
              <div className="mt-6">
                <h3
                  className="text-lg uppercase"
                  style={{ fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '0.05em' }}
                >
                  {e.titulo}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed" style={{ color: DIM }}>
                  {e.texto}
                </p>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-8 text-sm sm:hidden" style={{ color: '#6F6E73' }}>
          Arraste para o lado →
        </p>
        <p className="mt-10 hidden text-sm sm:block" style={{ color: '#6F6E73' }}>
          A lista completa de serviços, com duração e valores, aparece na hora de agendar.
        </p>
      </section>

      {/* ═══════════════════════ O APLICATIVO ═══════════════════════ */}
      <section id="aplicativo" className="scroll-mt-16" style={{ backgroundColor: INK_SOFT }}>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <div className={styles.reveal}>
            <Rotulo>O aplicativo</Rotulo>
            <h2
              className="mt-4 text-3xl uppercase leading-[1.05] sm:text-[2.6rem]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
            >
              A agenda da Leste
              <span className="block" style={{ color: MUTED, fontWeight: 300 }}>
                no seu bolso
              </span>
            </h2>

            <ul className="mt-10 flex flex-col">
              {RECURSOS.map((r, i) => (
                <li
                  key={r.titulo}
                  className="flex gap-5 py-5"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(244,241,236,0.08)' }}
                >
                  <span
                    className="pt-0.5 text-sm tabular-nums"
                    style={{ fontFamily: 'var(--font-display)', color: BLUE, letterSpacing: '0.14em' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold">{r.titulo}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed" style={{ color: DIM }}>
                      {r.texto}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <Link
              href="/"
              className={`${styles.lift} mt-9 inline-flex h-12 items-center justify-center rounded-full px-9 text-[13px] uppercase`}
              style={{
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.18em',
                fontWeight: 500,
                backgroundColor: PAPER,
                color: INK,
              }}
            >
              Agendar meu horário
            </Link>
          </div>

          {/* Mock do app — desenhado em CSS, sem nenhum dado real do banco */}
          <div className={`${styles.deviceWrap} relative flex justify-center lg:justify-end`}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 m-auto h-72 w-72 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(42,108,184,0.2) 0%, rgba(42,108,184,0) 70%)' }}
            />
            <div
              className={`${styles.device} relative w-[268px] rounded-[2.2rem] p-2.5 sm:w-[300px]`}
              style={{
                backgroundColor: '#1C1C1F',
                border: '1px solid rgba(244,241,236,0.10)',
                boxShadow: '0 44px 90px rgba(0,0,0,0.62), 0 0 0 1px rgba(244,241,236,0.04)',
              }}
            >
              <div className="rounded-[1.75rem] px-5 pb-6 pt-5" style={{ backgroundColor: INK }}>
                <div
                  className="mx-auto mb-5 h-1 w-10 rounded-full"
                  style={{ backgroundColor: 'rgba(244,241,236,0.18)' }}
                />

                <div className={styles.deviceRow}>
                  <p className="text-[10px] uppercase" style={{ letterSpacing: '0.24em', color: MUTED }}>
                    Escolha o horário
                  </p>
                  <p className="mt-1 text-[15px] font-semibold">Sexta, 19 de setembro</p>
                </div>

                <div className={`${styles.deviceRow} mt-4 flex gap-2`}>
                  {['17', '18', '19', '20', '21'].map((d, i) => (
                    <div
                      key={d}
                      className="flex h-12 flex-1 flex-col items-center justify-center rounded-xl text-[11px]"
                      style={
                        i === 2
                          ? { backgroundColor: PAPER, color: INK, fontWeight: 600 }
                          : { backgroundColor: 'rgba(244,241,236,0.06)', color: DIM }
                      }
                    >
                      <span className="text-[9px] opacity-70">{['Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i]}</span>
                      <span>{d}</span>
                    </div>
                  ))}
                </div>

                <div className={`${styles.deviceRow} mt-4 grid grid-cols-3 gap-2`}>
                  {['09:30', '10:00', '10:30', '14:00', '14:30', '15:00'].map((h, i) => (
                    <div
                      key={h}
                      className={`rounded-lg py-2 text-center text-[11px] ${i === 4 ? styles.slotOn : ''}`}
                      style={
                        i === 4
                          ? { backgroundColor: BLUE, color: '#FFFFFF', fontWeight: 600 }
                          : i === 1
                          ? {
                              backgroundColor: 'rgba(244,241,236,0.04)',
                              color: '#55545A',
                              textDecoration: 'line-through',
                            }
                          : { backgroundColor: 'rgba(244,241,236,0.07)', color: '#C9C6C1' }
                      }
                    >
                      {h}
                    </div>
                  ))}
                </div>

                <div
                  className={`${styles.deviceRow} mt-5 rounded-xl px-4 py-3`}
                  style={{
                    backgroundColor: 'rgba(244,241,236,0.05)',
                    border: '1px solid rgba(244,241,236,0.08)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold">Corte + Barba</span>
                    <span
                      className={`${styles.badgePulse} rounded-full px-2 py-0.5 text-[9px] uppercase`}
                      style={{
                        backgroundColor: 'rgba(42,108,184,0.22)',
                        color: '#8FB6E4',
                        letterSpacing: '0.1em',
                      }}
                    >
                      Confirmado
                    </span>
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: MUTED }}>
                    Sexta, 19/09 · 14:30
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════ CONTA GOOGLE ═══════════════════════ */}
      <section id="conta-google" className="scroll-mt-16 mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
        <div className={`${styles.reveal} text-center`}>
          <Rotulo center>Entrar com a conta Google</Rotulo>
          <h2
            className="mx-auto mt-4 max-w-lg text-2xl uppercase leading-[1.12] sm:text-[2rem]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
          >
            Opcional — e só para guardar os seus agendamentos
          </h2>
        </div>

        <div
          className={`${styles.reveal} mt-10 rounded-2xl p-7 sm:p-9`}
          style={{
            border: '1px solid rgba(244,241,236,0.10)',
            backgroundColor: 'rgba(244,241,236,0.025)',
          }}
        >
          <div className="grid gap-7 sm:grid-cols-2">
            <div>
              <h3
                className="text-[13px] uppercase"
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.16em' }}
              >
                O que recebemos
              </h3>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm" style={{ color: '#C9C6C1' }}>
                <li>Seu nome</li>
                <li>Seu endereço de e-mail</li>
                <li>Sua foto de perfil</li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: DIM }}>
                Usados apenas para identificar você no aplicativo e manter o seu histórico de
                agendamentos ligado à sua conta, em qualquer aparelho.
              </p>
            </div>
            <div>
              <h3
                className="text-[13px] uppercase"
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.16em' }}
              >
                O que não acessamos
              </h3>
              <ul className="mt-3 flex flex-col gap-1.5 text-sm" style={{ color: '#C9C6C1' }}>
                <li>E-mails, contatos e agenda</li>
                <li>Arquivos, fotos e documentos</li>
                <li>Qualquer outro dado da sua conta Google</li>
              </ul>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: DIM }}>
                Esses dados não são vendidos, não alimentam publicidade e não são compartilhados para
                marketing. Você pode pedir a exclusão a qualquer momento.
              </p>
            </div>
          </div>

          <div
            className="mt-7 flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderTop: '1px solid rgba(244,241,236,0.09)' }}
          >
            <p className="text-sm" style={{ color: DIM }}>
              Dá para agendar sem conta, informando nome e WhatsApp.
            </p>
            <GoogleButton nextPath="/agendar" />
          </div>
        </div>

        <p className="mt-6 text-center text-[13px]" style={{ color: '#6F6E73' }}>
          Detalhes na{' '}
          <Link href="/privacidade" className={styles.underline}>
            Política de Privacidade
          </Link>{' '}
          e nos{' '}
          <Link href="/termos" className={styles.underline}>
            Termos de Uso
          </Link>
          .
        </p>
      </section>

      {/* ═══════════════════════════ VISITE ═══════════════════════════ */}
      <section id="visite" className="scroll-mt-16" style={{ backgroundColor: INK_SOFT }}>
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <div className={styles.reveal}>
            <Rotulo>Visite a Leste</Rotulo>
            {cfg?.address && (
              <p
                className="mt-5 max-w-sm text-2xl uppercase leading-[1.2]"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
              >
                {cfg.address}
              </p>
            )}
            <div className="mt-7 flex flex-wrap gap-3">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.lift} rounded-full px-6 py-2.5 text-[12px] uppercase`}
                  style={{
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.16em',
                    border: '1px solid rgba(244,241,236,0.22)',
                    color: PAPER,
                  }}
                >
                  WhatsApp
                </a>
              )}
              {cfg?.instagram_url && (
                <a
                  href={cfg.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.lift} rounded-full px-6 py-2.5 text-[12px] uppercase`}
                  style={{
                    fontFamily: 'var(--font-display)',
                    letterSpacing: '0.16em',
                    border: '1px solid rgba(244,241,236,0.22)',
                    color: PAPER,
                  }}
                >
                  Instagram
                </a>
              )}
            </div>
          </div>

          {/* Sem tabela de horários: a agenda da casa muda o tempo todo e
              publicar "Seg 10:30-19:00" seria informação que envelhece sozinha.
              Isto aqui é verdadeiro em qualquer dia. */}
          <div className={styles.reveal}>
            <Rotulo>Atendimento</Rotulo>
            <p
              className="mt-5 text-2xl uppercase leading-[1.15]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
            >
              Atendimento com
              <span className="block" style={{ fontWeight: 300, color: MUTED }}>
                hora marcada
              </span>
            </p>
            <p className="mt-5 max-w-sm text-sm leading-relaxed" style={{ color: DIM }}>
              A disponibilidade é atualizada direto na agenda da barbearia. Abra o aplicativo para ver
              os horários livres de hoje e dos próximos dias — é sempre o que está valendo.
            </p>
            <Link
              href="/"
              className={`${styles.lift} mt-7 inline-flex h-12 items-center justify-center rounded-full px-8 text-[13px] uppercase`}
              style={{
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.18em',
                fontWeight: 500,
                border: '1px solid rgba(244,241,236,0.3)',
                color: PAPER,
              }}
            >
              Ver horários disponíveis
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════ CTA FINAL ════════════════════════ */}
      <section id="agendar" className="scroll-mt-16 relative overflow-hidden">
        <Image src="/fundo.jpg" alt="" fill sizes="100vw" className="object-cover object-center opacity-25" />
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(12,12,13,0.74)' }} />
        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-5 py-24 text-center sm:px-8 sm:py-28">
          <BarberPole height={96} width={18} />
          <h2
            className="mt-9 text-3xl uppercase leading-[1.05] sm:text-[2.9rem]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
          >
            Seu próximo corte
            <span className="block" style={{ fontWeight: 300, color: '#C9C6C1' }}>
              começa aqui
            </span>
          </h2>
          <Link
            href="/"
            className={`${styles.lift} mt-9 inline-flex h-13 items-center justify-center rounded-full px-10 text-[13px] uppercase`}
            style={{
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.18em',
              fontWeight: 500,
              backgroundColor: PAPER,
              color: INK,
              boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
            }}
          >
            Agendar agora
          </Link>
        </div>
      </section>

      {/* ═════════════════════════ RODAPÉ ═════════════════════════ */}
      <footer style={{ borderTop: '1px solid rgba(244,241,236,0.08)' }}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-4">
            <Image src={logo} alt="" width={64} height={64} className="h-10 w-10 object-contain" />
            <div>
              <p
                className="text-[13px] uppercase"
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.22em' }}
              >
                Leste Barbearia
              </p>
              <p className="mt-0.5 text-[12px]" style={{ color: '#6F6E73' }}>
                Aplicativo oficial de agendamento
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13px]" style={{ color: DIM }}>
            <Link href="/privacidade" className={styles.underline}>
              Política de Privacidade
            </Link>
            <Link href="/termos" className={styles.underline}>
              Termos de Uso
            </Link>
            <Link href="/" className={styles.underline}>
              Agendar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/** Poste de barbeiro estilizado: listras girando + vidro + brilho percorrendo. */
function BarberPole({ height, width }: { height: number; width: number }) {
  return (
    <div className="relative flex flex-col items-center" aria-hidden>
      <span
        className="rounded-full"
        style={{
          width: width + 6,
          height: 5,
          background: 'linear-gradient(180deg, #E8E5E0 0%, #8A8781 100%)',
        }}
      />
      <div
        className={`${styles.pole} ${styles.poleV} ${styles.poleGlass} my-1.5`}
        style={{
          width,
          height,
          borderRadius: width / 2,
          boxShadow: '0 0 26px rgba(217,52,43,0.22), 0 0 26px rgba(42,108,184,0.18)',
        }}
      >
        <span className={styles.poleSheen} />
      </div>
      <span
        className="rounded-full"
        style={{
          width: width + 6,
          height: 5,
          background: 'linear-gradient(180deg, #E8E5E0 0%, #8A8781 100%)',
        }}
      />
    </div>
  )
}

function Rotulo({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
      <span className={`${styles.pole} ${styles.poleH} h-[3px] w-7 rounded-full`} aria-hidden />
      <span
        className="text-[11px] uppercase"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.34em', color: MUTED }}
      >
        {children}
      </span>
    </div>
  )
}
