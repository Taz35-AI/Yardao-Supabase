// Server wrapper: SEO metadata for the login route (noindex — utility page).
// The interactive form lives in ./LoginClient (a client component).
import type { Metadata } from 'next'
import LoginClient from './LoginClient'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Yardao account.',
  alternates: { canonical: 'https://yardao.com/login/' },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function Page() {
  return <LoginClient />
}
