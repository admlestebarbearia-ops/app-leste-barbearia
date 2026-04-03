'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function DomainModal() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
      >
        Quero um dominio proprio
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 bg-card border border-border rounded-2xl p-6 mx-4 max-w-sm w-full flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold text-foreground">Dominio proprio</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Voce pode ter seu proprio dominio — como{' '}
                <span className="text-foreground font-medium">lestebarbearia.com.br</span> — por
                aproximadamente{' '}
                <span className="text-foreground font-medium">R&#36;100 por ano</span>.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Entre em contato com a Agencia JN pelo WhatsApp para solicitar. O processo e rapido
                e seu site continua funcionando normalmente durante a transicao.
              </p>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              <Button
                className="w-full h-10"
                onClick={() => {
                  window.open('https://wa.me/5511940825120', '_blank', 'noopener,noreferrer')
                }}
              >
                Falar com a Agencia JN
              </Button>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="w-full h-10"
              >
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
