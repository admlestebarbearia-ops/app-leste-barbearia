import Image from 'next/image'

export default function GlobalLoading() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-[2rem] bg-primary/15 blur-2xl scale-125" />
          <div className="relative w-28 h-28 rounded-[2rem] border border-white/10 bg-card/80 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,0.45)] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_45%,rgba(11,65,150,0.18))]" />
            <Image
              src="/logo-barbearialeste.png"
              alt="Leste Barbearia"
              width={88}
              height={88}
              priority
              className="relative object-contain animate-logo-glow"
            />
          </div>
          <div className="absolute -inset-4 rounded-[2.5rem] border border-primary/20 animate-loader-ring" />
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