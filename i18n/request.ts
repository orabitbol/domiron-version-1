import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export default getRequestConfig(async () => {
  const cookieStore = cookies()
  const locale = cookieStore.get('locale')?.value ?? process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'he'

  const validLocales = ['he', 'en']
  const resolvedLocale = validLocales.includes(locale) ? locale : 'he'

  return {
    locale: resolvedLocale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default,
  }
})
