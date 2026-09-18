import type { Metadata } from "next";
import { Inter, Syne, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted via next/font — no render-blocking Google Fonts request.
// The CSS variables feed --font-sans / --font-mono / font-heading tokens.
// Weights are trimmed to what the codebase actually uses (audited via grep:
// 400/500/600/700/800 for Inter, 700/800 for Syne headings) — every unused
// weight is a separate woff2 the browser downloads for nothing.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});
const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-syne",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});
import ThemeProvider from "@/components/Theme/ThemeProvider";
import { AuthProvider } from "@/lib/auth";
import { OrganizationJsonLd, WebsiteJsonLd, SoftwareApplicationJsonLd } from "@/components/SEO/JsonLd";
import { X_HANDLE } from "@/lib/social";

export const metadata: Metadata = {
  metadataBase: new URL('https://quantaura.tech'),
  title: {
    default: "QuantAura | AI-Powered Crypto Intelligence",
    template: "%s | QuantAura",
  },
  description: "AI-driven cryptocurrency trading signals powered by ensemble deep learning models (LSTM, XGBoost, Transformer, KAN) with real-time market analysis.",
  keywords: ["crypto", "trading", "AI", "signals", "LSTM", "XGBoost", "Transformer", "Bitcoin", "Ethereum", "cryptocurrency", "machine learning", "predictions"],
  authors: [{ name: "QuantAura" }],
  creator: "QuantAura",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://quantaura.tech",
    siteName: "QuantAura",
    title: "QuantAura | AI-Powered Crypto Intelligence",
    description: "AI-driven cryptocurrency trading signals powered by ensemble deep learning models with real-time market analysis.",
  },
  twitter: {
    card: "summary_large_image",
    // Attributes every shared quantaura.tech link back to the X account, so a
    // link posted by anyone carries the "@quantaura_ml" byline on the card.
    site: X_HANDLE,
    creator: X_HANDLE,
    title: "QuantAura | AI-Powered Crypto Intelligence",
    description: "AI-driven cryptocurrency trading signals powered by ensemble deep learning models with real-time market analysis.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: "https://quantaura.tech",
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/favicon-192x192.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning
      className={`${inter.variable} ${syne.variable} ${jetbrainsMono.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0b10" />
        {/* Stamp the saved theme before first paint — prevents both the wrong-
            theme flash and the blank-screen mount gate it used to require */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('quantaura-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.setAttribute('data-theme',t)}catch(e){}`,
          }}
        />
        <OrganizationJsonLd />
        <WebsiteJsonLd />
        <SoftwareApplicationJsonLd />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

