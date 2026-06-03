// src/app/layout.tsx - Enhanced with auto-logout functionality, Sonner toasts, Push Notifications + Keyboard Optimization + DYNAMIC SIDEBAR SPACING
import type { Metadata, Viewport } from 'next'
import { Geist, DM_Mono } from 'next/font/google'
import { ConditionalProviders } from '@/components/ConditionalProviders'
import { Toaster } from 'sonner'
import './globals.css'
import { SpeechEnabledGroqAssistant } from '@/components/common/SpeechEnabledGroqAssistant'
import { ZaoGuard } from '@/components/common/ZaoGuard'

// ─── Fonts ────────────────────────────────────────────────────────────────────
// Geist: clean, geometric, excellent at all weights on mobile and desktop
// DM Mono: used for reg plates, numbers, code — gives them a plate-like quality
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',        // show text immediately, swap in font when ready
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    template: '%s | Yardao',
    default: 'Yardao - Fleet Management System',
  },
  description: 'Professional fleet management and vehicle tracking system for modern businesses',
  generator: 'Next.js',
  keywords: [
    'fleet management',
    'vehicle tracking',
    'yardao',
    'fleet software',
    'vehicle management',
    'progressive web app',
    'nextjs',
    'pwa',
    'react',
    'typescript',
    'tailwind',
    'firebase',
    'authentication'
  ],
  authors: [
    { name: 'Yardao Team', url: 'https://yardao.com' }
  ],
  creator: 'Yardao',
  publisher: 'Yardao',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Yardao',
    startupImage: [
      {
        url: '/icons/apple-splash-1536-2048.jpg',
        media: '(device-width: 768px) and (device-height: 1024px)',
      },
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'Yardao',
    title: 'Yardao - Fleet Management System',
    description: 'Professional fleet management and vehicle tracking system for modern businesses',
    url: 'https://yardao.com',
    images: [
      {
        url: 'https://yardao.com/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Yardao Fleet Management System',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yardao - Fleet Management System',
    description: 'Professional fleet management and vehicle tracking system for modern businesses',
    images: ['https://yardao.com/og-image.png'],
    site: '@yardao',
    creator: '@yardao',
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
    canonical: 'https://yardao.com',
  },
  category: 'business',
  classification: 'Fleet Management Software',
}

// Next.js 14+: viewport and themeColor must live in their own `viewport`
// export, not inside `metadata` (moved here verbatim — no behaviour change).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA Configuration */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Yardao" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#025940" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        
        {/* Enhanced PWA tags for better Samsung Internet support */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Yardao" />
        <meta name="msapplication-tooltip" content="Yardao Fleet Management" />
        <meta name="msapplication-starturl" content="/" />
        
        {/* Business/SEO Meta Tags */}
        <meta name="business:contact_data:street_address" content="" />
        <meta name="business:contact_data:locality" content="" />
        <meta name="business:contact_data:region" content="" />
        <meta name="business:contact_data:postal_code" content="" />
        <meta name="business:contact_data:country_name" content="United Kingdom" />
        
        {/* Favicon and Basic Icons */}
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" href="/icons/apple-icon-180.png" />
        
        {/* Apple Splash Screens - All sizes */}
        {/* iPhone SE, 5s */}
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-640-1136.jpg" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1136-640.jpg" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        
        {/* iPhone 6, 6s, 7, 8 */}
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-750-1334.jpg" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1334-750.jpg" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        
        {/* iPhone 6+, 6s+, 7+, 8+ */}
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1242-2208.jpg" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2208-1242.jpg" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        
        {/* iPhone X, XS, 11 Pro */}
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1125-2436.jpg" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2436-1125.jpg" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        
        {/* Additional iPhone and iPad models */}
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-828-1792.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1792-828.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1242-2688.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2688-1242.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1170-2532.jpg" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2532-1170.jpg" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1284-2778.jpg" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2778-1284.jpg" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1179-2556.jpg" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2556-1179.jpg" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1290-2796.jpg" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2796-1290.jpg" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1206-2622.jpg" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2622-1206.jpg" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1320-2868.jpg" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2868-1320.jpg" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1536-2048.jpg" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2048-1536.jpg" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1620-2160.jpg" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2160-1620.jpg" media="(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1668-2224.jpg" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2224-1668.jpg" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1668-2388.jpg" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2388-1668.jpg" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2048-2732.jpg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2732-2048.jpg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        
        {/* Safari Pinned Tab */}
        <link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#025940" />
        
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* DNS prefetch for Firebase */}
        <link rel="dns-prefetch" href="https://firebaseapp.com" />
        <link rel="dns-prefetch" href="https://firestore.googleapis.com" />
        
        {/* Enhanced viewport meta for mobile safe areas */}
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
      </head>
      <body className={`${geist.variable} ${dmMono.variable} font-sans antialiased`} suppressHydrationWarning>
        {/* ✅ SINGLE CONDITIONAL WRAPPER - Handles auth vs dashboard page logic */}
        <ConditionalProviders>
          {children}
          {/* ✅ Zao AI assistant — only shown when user is signed in */}
          <ZaoGuard />
        </ConditionalProviders>
        
        {/* Sonner Toast Notifications - Dark Theme Optimized */}
        <Toaster 
          theme="dark"
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'linear-gradient(to bottom right, #030712, #1f2937)',
              border: '1px solid #374151',
              color: '#f3f4f6',
              fontSize: '14px',
              fontFamily: 'var(--font-sans)',
              borderRadius: '12px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
            },
            className: 'sonner-toast-dark',
            descriptionClassName: 'text-gray-400',
          }}
          richColors
          closeButton
          expand={false}
          visibleToasts={3}
        />
      </body>
    </html>
  )
}