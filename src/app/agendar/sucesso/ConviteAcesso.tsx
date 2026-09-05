'use client'

/**
 * ConviteAcesso — convite mostrado DEPOIS do agendamento confirmado.
 *
 * Por que aqui e nao um modal: o botao "Ver minhas reservas" (PushGateButton)
 * ja pede a permissao de notificacao dentro do gesto do clique, que e o melhor
 * momento possivel. Um modal por cima da confirmacao competiria com a
 * informacao que o cliente veio ler e seria dispensado por reflexo.
 *
 * Este cartao cobre os DOIS buracos que sobravam:
 *
 *  1. iPhone sem o app instalado. Notificacao no iOS so funciona no PWA, entao
 *     os dois modais de push se calam nesse caso (corretamente) — e o usuario
 *     ficava sem nenhum caminho. O banner global de instalar existe, mas some
 *     para sempre depois de dispensado uma vez.
 *
 *  2. Visitante sem login. O argumento NAO e "acessar de outro aparelho": para
 *     quem vai cortar o cabelo hoje, reserva antiga nao vale nada e esse apelo
 *     nao convence ninguem. O beneficio real e concreto: showFreeMode em
 *     BookingForm.tsx e `!isAuthenticatedUser`, ou seja, quem entra com o
 *     Google NAO ve os campos de nome e telefone. Nao digita nada da proxima
 *     vez. E isso que vale dizer.
 *
 * Quando nenhum dos dois se aplica, nao renderiza nada.
 */

import { useEffect, useState } from 'react'
import { Bell, Share, PlusSquare } from 'lucide-react'
import { LoginButton } from '@/components/auth/LoginButton'

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return !!(
    (navigator as unknown as Record<string, unknown>).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

export function ConviteAcesso({ isGuest }: { isGuest: boolean }) {
  // Comeca escondido e so decide depois de montar: o servidor nao tem como
  // saber o aparelho, e renderizar diferente aqui causaria erro de hidratacao.
  const [precisaInstalar, setPrecisaInstalar] = useState(false)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    setPrecisaInstalar(isIos() && !isStandalone())
    setPronto(true)
  }, [])

  if (!pronto) return null
  if (!precisaInstalar && !isGuest) return null

  return (
    <div className="w-full rounded-xl border border-primary/25 bg-primary/[0.06] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Bell size={15} className="text-primary shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          {precisaInstalar ? 'Não perca sua vez' : 'Fica mais rápido'}
        </span>
      </div>

      {precisaInstalar && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-300 leading-relaxed">
            Instale o app e a barbearia te avisa quando estiver perto da sua vez.
            <span className="text-zinc-500"> No iPhone, o aviso só funciona com o app instalado.</span>
          </p>
          <div className="flex flex-col gap-1.5 bg-black/25 rounded-lg px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-[11px] text-zinc-300">
              <Share size={13} className="text-primary shrink-0" />
              1. Toque em <strong className="text-white">Compartilhar</strong> na barra do Safari
            </span>
            <span className="inline-flex items-center gap-2 text-[11px] text-zinc-300">
              <PlusSquare size={13} className="text-primary shrink-0" />
              2. Escolha <strong className="text-white">Adicionar à Tela de Início</strong>
            </span>
          </div>
        </div>
      )}

      {isGuest && (
        <div className="flex flex-col gap-2.5">
          {precisaInstalar && <div className="h-px bg-white/10" />}
          <p className="text-xs text-zinc-300 leading-relaxed">
            <strong className="text-white">Da próxima vez, não digite nada.</strong>{' '}
            Entrando com o Google, seu nome e telefone já vêm preenchidos — é só
            escolher o horário.
          </p>
          <LoginButton nextPath="/reservas" />
        </div>
      )}
    </div>
  )
}
