import type { MetadataRoute } from 'next'

// Static robots.txt (output:'export' friendly).
export const dynamic = 'force-static'

const BASE = 'https://yardao.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private app areas + the raw landing mock served under /test/.
        // NOTE: /login and /forgot-password are intentionally NOT disallowed —
        // they carry a `noindex` meta tag, so crawlers must be allowed to fetch
        // them to see it. Disallowing would block that.
        disallow: [
          '/test/',
          '/dashboard',
          '/fleet',
          '/stock',
          '/service-bookings',
          '/deliveries-defleet',
          '/settings',
          '/profile',
          '/admin',
          '/reset-password-required',
          '/verify-email-required',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  }
}
