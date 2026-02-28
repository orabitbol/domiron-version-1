import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Providers } from '@/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Domiron — Real-time Strategy Game',
  description: 'A real-time browser-based multiplayer strategy game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = cookies()
  const locale = cookieStore.get('locale')?.value ?? process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'he'
  const validLocales = ['he', 'en']
  const resolvedLocale = validLocales.includes(locale) ? locale : 'he'
  const dir = resolvedLocale === 'he' ? 'rtl' : 'ltr'

  return (
    <html lang={resolvedLocale} dir={dir}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
