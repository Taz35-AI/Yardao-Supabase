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
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/favicon-96x96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: '/favicon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'Go to Dashboard',
        url: '/dashboard',
        icons: [
          { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png' },
        ],
      },
    ],
  }
}
