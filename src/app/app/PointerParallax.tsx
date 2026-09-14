'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// ────────────────────────────────────────────────────────────────────────────
// Parallax de ponteiro do hero — EXCLUSIVO da landing /app.
//
// Escreve duas CSS custom properties (--px, --py, de -1 a 1) no wrapper. Quem
// decide o quanto isso desloca e o CSS (landing.module.css), nao o JS: assim o
// componente nao sabe nada de layout e o efeito morre sozinho quando o usuario
// pede reducao de movimento.
//
// Desliga em tres casos:
//   · aparelho sem ponteiro fino (celular/tablet) — nao existe hover ali;
//   · prefers-reduced-motion: reduce;
//   · aba em segundo plano (o rAF nem chega a rodar).
//
// Custo: um listener passivo + um requestAnimationFrame coalescido. Nao
// dispara layout nem paint, so composite.
// ────────────────────────────────────────────────────────────────────────────

export function PointerParallax({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window.matchMedia !== 'function') return

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!finePointer.matches || reduced.matches) return

    let frame = 0

    const onMove = (event: PointerEvent) => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const x = (event.clientX / window.innerWidth - 0.5) * 2
        const y = (event.clientY / window.innerHeight - 0.5) * 2
        el.style.setProperty('--px', x.toFixed(3))
        el.style.setProperty('--py', y.toFixed(3))
      })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
