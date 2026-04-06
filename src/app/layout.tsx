import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    // 192×192 < 300px → WhatsApp exibe como ícone pequeno (estilo app), não thumbnail gigante
    images: [{ url: "/android-chrome-192x192.png", width: 192, height: 192, alt: "Leste Barbearia" }],
    type: "website",
    locale: "pt_BR",
  },
  twitter: {
    card: "summary",
    title: "Leste Barbearia",
    description: "Agende seu horário na Leste Barbearia",
    images: ["/android-chrome-192x192.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased overflow-x-hidden" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}
