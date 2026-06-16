import type { MetadataRoute } from 'next'

// Static sitemap (output:'export' friendly). Only public, indexable pages.
// Auth utility pages (/login, /forgot-password) are noindex and omitted.
export const dynamic = 'force-static'

const BASE = 'https://yardao.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/register/`, changeFrequency: 'monthly', priority: 0.8 },
  ]
}
