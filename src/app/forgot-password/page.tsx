// Server wrapper: SEO metadata for the forgot-password route (noindex — utility).
// The interactive form lives in ./ForgotPasswordClient (a client component).
import type { Metadata } from 'next'
import ForgotPasswordClient from './ForgotPasswordClient'

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Reset the password for your Yardao account.',
  alternates: { canonical: 'https://yardao.com/forgot-password/' },
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
}

export default function Page() {
  return <ForgotPasswordClient />
}
