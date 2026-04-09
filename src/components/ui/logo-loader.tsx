import Image from 'next/image'

export default function LogoLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background">
      <Image
        src="/logo-barbearialeste.png"
        alt="Leste Barbearia"
        width={140}
        height={140}
        priority
        className="h-auto w-28 object-contain"
      />
      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}
