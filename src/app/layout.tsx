import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import PwaPrompt from "@/components/ui/pwa-prompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#161616',
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Leste Barbearia",
  description: "Agende seu horário na Leste Barbearia",
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Leste Barbearia",
    description: "Agende seu horário na Leste Barbearia",
    images: [{ url: "/logo_barber.png", alt: "Leste Barbearia" }],
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary",
    title: "Leste Barbearia",
    description: "Agende seu horário na Leste Barbearia",
    images: ["/logo_barber.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "192x192", type: "image/png" },
    ],
    // Android/Chrome: ícones fornecidos via site.webmanifest
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Captura beforeinstallprompt antes do React montar — evento dispara cedo demais para useEffect */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__pwaPrompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__pwaPrompt=e;});`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased overflow-x-hidden" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors theme="dark" />
          <PwaPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
