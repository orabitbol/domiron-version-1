import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required in Next.js 14.x to activate instrumentation.ts (register() hook).
  // In Next.js 15+ this flag is no longer needed (hook is unconditionally active).
  experimental: {
    instrumentationHook: true,
  },
}

export default withNextIntl(nextConfig)
