// src/app/manifest.ts
// Next.js App Router web manifest (auto-served at /manifest.webmanifest and
// auto-linked in <head>). Uses the icon set in public/ root.

import type { MetadataRoute } from 'next'

// Required for static export.
export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yardao',
    short_name: 'Yardao',
    description: 'Yardao — fleet & yard management',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#012619',
    orientation: 'portrait-primary',
    scope: '/',
    categories: ['productivity', 'business', 'utilities'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { src: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'Go to Dashboard',
        url: '/dashboard',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
        ],
      },
    ],
  }
}
