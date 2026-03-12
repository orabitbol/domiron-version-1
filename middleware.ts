/**
 * Middleware — Admin route protection
 *
 * Only matches /admin/:path*
 * - /admin/login is allowed through unconditionally
 * - All other /admin/* routes require a valid JWT with role === 'admin'
 * - API routes (/api/*) are NOT touched — they guard themselves
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let the admin login page through unconditionally
  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  // No token or not an admin — redirect to admin login
  if (!token || token.role !== 'admin') {
    const loginUrl = new URL('/admin/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
