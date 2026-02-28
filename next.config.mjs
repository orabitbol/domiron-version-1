import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel Cron jobs are called by Vercel infrastructure
  // No extra config needed for App Router API routes
}

export default withNextIntl(nextConfig)
