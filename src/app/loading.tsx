import Image from 'next/image'

export default function GlobalLoading() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
        <div className="relative flex min-h-44 items-center justify-center">
          <div className="absolute h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
          <Image
            src="/logo-barbearialeste.png"
            alt="Leste Barbearia"
            width={180}
            height={180}
            priority
            className="relative h-auto w-36 object-contain animate-logo-glow drop-shadow-[0_20px_45px_rgba(0,0,0,0.4)]"
          />
          <div className="pointer-events-none absolute h-40 w-40 rounded-full border border-primary/20 animate-loader-ring" />
        </div>

        <div className="flex flex-col gap-2 items-center w-full">
          <div className="h-2.5 w-36 rounded-full bg-white/8 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-primary/70 animate-loader-sheen" />
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Preparando sua experiência
          </p>
        </div>
      </div>
    </main>
  )
}