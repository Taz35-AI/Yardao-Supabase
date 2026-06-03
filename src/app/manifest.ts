// src/app/manifest.ts - Updated with all new icons from your screenshot

import type { MetadataRoute } from 'next'

// Add this to make it compatible with static export
export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yard-Status',
    short_name: 'YardStatus',
    description: 'A modern Progressive Web App built with Next.js, featuring authentication and a professional design',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#025940',
    orientation: 'portrait-primary',
    scope: '/',
    categories: ['productivity', 'business', 'utilities'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      // Apple Touch Icon (main)
      {
        src: '/icons/apple-icon-180.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any'
      },
      
      // Apple Splash Screen Icons (all sizes from your screenshot)
      {
        src: '/icons/apple-splash-640-1136.png',
        sizes: '640x1136',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-750-1334.png',
        sizes: '750x1334',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-828-1792.png',
        sizes: '828x1792',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1125-2436.png',
        sizes: '1125x2436',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1136-640.png',
        sizes: '1136x640',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1170-2532.png',
        sizes: '1170x2532',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1179-2556.png',
        sizes: '1179x2556',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1206-2622.png',
        sizes: '1206x2622',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1242-2208.png',
        sizes: '1242x2208',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1248-2688.png',
        sizes: '1248x2688',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1284-2778.png',
        sizes: '1284x2778',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1290-2796.png',
        sizes: '1290x2796',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1320-2868.png',
        sizes: '1320x2868',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1334-750.png',
        sizes: '1334x750',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1536-2048.png',
        sizes: '1536x2048',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1620-2160.png',
        sizes: '1620x2160',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1668-2224.png',
        sizes: '1668x2224',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1668-2388.png',
        sizes: '1668x2388',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-1792-828.png',
        sizes: '1792x828',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2048-1536.png',
        sizes: '2048x1536',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2048-2732.png',
        sizes: '2048x2732',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2160-1620.png',
        sizes: '2160x1620',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2208-1242.png',
        sizes: '2208x1242',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2224-1668.png',
        sizes: '2224x1668',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2388-1668.png',
        sizes: '2388x1668',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2436-1125.png',
        sizes: '2436x1125',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2532-1170.png',
        sizes: '2532x1170',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2556-1179.png',
        sizes: '2556x1179',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2622-1206.png',
        sizes: '2622x1206',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2688-1248.png',
        sizes: '2688x1248',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2732-2048.png',
        sizes: '2732x2048',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2778-1284.png',
        sizes: '2778x1284',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2796-1290.png',
        sizes: '2796x1290',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/apple-splash-2868-1320.png',
        sizes: '2868x1320',
        type: 'image/png',
        purpose: 'any'
      },
      
      // Regular app icon
      {
        src: '/icons/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      
      // Maskable icons (for Android adaptive icons)
      {
        src: '/icons/manifest-icon-192.maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icons/manifest-icon-512.maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }
    ],
    screenshots: [
      {
        src: '/screenshots/mobile-home.png',
        type: 'image/png',
        sizes: '390x844',
        form_factor: 'narrow',
        label: 'Mobile Home Screen'
      },
      {
        src: '/screenshots/desktop-dashboard.png',
        type: 'image/png',
        sizes: '1920x1080',
        form_factor: 'wide',
        label: 'Desktop Dashboard'
      }
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'Go to Dashboard',
        url: '/dashboard',
        icons: [
          {
            src: '/icons/icon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    ]
  }
}