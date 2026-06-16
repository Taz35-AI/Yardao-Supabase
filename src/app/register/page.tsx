// Server wrapper: SEO metadata for the "Request a demo" route (indexable —
// marketing page). The interactive form lives in ./RequestDemoClient.
import type { Metadata } from 'next'
import RequestDemoClient from './RequestDemoClient'

const title = 'Request a demo'
const description =
  'Book a personalised walkthrough of Yardao — real-time yard view, service, stock, invoicing and compliance for UK fleets, bodyshops and garages.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: 'https://yardao.com/register/' },
  openGraph: {
    title: `${title} | Yardao`,
    description,
    url: 'https://yardao.com/register/',
    type: 'website',
  },
  twitter: { title: `${title} | Yardao`, description },
}

export default function Page() {
  return <RequestDemoClient />
}
