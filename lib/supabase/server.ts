import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Server-side Supabase client (used in Server Components + API Routes)
// For regular DB reads — uses anon key + RLS
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — cookies can't be mutated
          }
        },
      },
    }
  )
}

// Admin Supabase client — uses service role key
// ONLY for API Routes that need to bypass RLS (e.g. tick, register)
//
// global.fetch passes cache:'no-store' on every request so Next.js 14's
// aggressive fetch cache never returns stale DB values from this client.
export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, init?: RequestInit) =>
          fetch(url, { ...init, cache: 'no-store' }),
      },
      cookies: {
        getAll() { return [] },
        setAll() {},
      },
    }
  )
}
