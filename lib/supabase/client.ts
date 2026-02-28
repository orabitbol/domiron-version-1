import { createBrowserClient } from '@supabase/ssr'

// Browser-side Supabase client (used in Client Components)
// Never has service role access — uses anon key only
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
