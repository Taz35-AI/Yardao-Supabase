// next.config.ts - FINAL WORKING VERSION WITHOUT WARNINGS
import type { NextConfig } from 'next'

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  
  // Enhanced Workbox configuration for Samsung Internet compatibility
  workboxOptions: {
    disableDevLogs: true,
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
    
    // Enhanced runtime caching for better offline experience
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
          },
        },
      },
      {
        // NetworkFirst (not StaleWhileRevalidate) so a fresh deploy is picked up
        // immediately when online; cache is only used as an offline fallback.
        urlPattern: /\.(?:js|css)$/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'static-resources',
          networkTimeoutSeconds: 4,
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
          },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
        },
      },
      // API caching strategy
      {
        urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'firebase-data',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24, // 1 day
          },
          networkTimeoutSeconds: 3,
        },
      },
    ],
  },

  // Fallback configuration
  fallbacks: {
    document: '/offline',
  },
  
  // Additional PWA options for better Samsung Internet support
  reloadOnOnline: true,
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  pwa: {
    disable: process.env.NODE_ENV === 'development',
    register: true,
    scope: '/',
  },
})

const nextConfig: NextConfig = {
  // 🔥 CRITICAL: Static export configuration for Firebase Hosting / Vercel.
  output: 'export',
  trailingSlash: true,
  // Dev uses the default `.next` (next dev on Next 15 mishandles a custom
  // distDir — it corrupts the RSC client manifest). The export build still goes
  // to `out` (NODE_ENV=production), so the deploy is unchanged.
  distDir: process.env.NODE_ENV === 'development' ? '.next' : 'out',
  
  // General Next.js configuration
  reactStrictMode: true,
  // REMOVED: swcMinify - deprecated in Next.js 15 (SWC is now default)
  experimental: {
    // REMOVED: optimizeCss - this was causing the 'critters' error
    esmExternals: true,
  },
  
  images: {
    unoptimized: true, // Required for static export
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    domains: [
      'localhost',
      // Add your production domain here
    ],
  },
  
  compress: true,
  poweredByHeader: false,
  
  // REMOVED: headers() function - not compatible with static export
  // Headers are now configured in firebase.json
  
  // TypeScript and ESLint configuration
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  
  // Simplified Webpack configuration
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Handle module resolution for static export
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }

    // PWA-specific webpack optimizations
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          // Separate PWA-specific chunks
          pwa: {
            name: 'pwa',
            test: /[\\/]node_modules[\\/](@ducanh2912\/next-pwa|workbox-)/,
            chunks: 'all',
            priority: 30,
            reuseExistingChunk: true,
          },
        },
      }
    }

    return config
  },
  
  // REMOVED: rewrites() function - not compatible with static export
  // The manifest.json to manifest.webmanifest rewrite is handled by the browser/service worker
  
  // Environment variables for PWA debugging
  env: {
    NEXT_PWA_DEBUG: process.env.NODE_ENV === 'development' ? 'true' : 'false',
    PWA_VERSION: '1.0.0',
    BUILD_TIME: new Date().toISOString(),
  },
}

export default withPWA(nextConfig)