import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/server'
import type { PlayerRole } from '@/types/game'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
    newUser: '/register',
    error: '/login',
  },
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const supabase = createAdminClient()

        const { data: player, error } = await supabase
          .from('players')
          .select('id, email, username, password_hash, role')
          .eq('email', credentials.email)
          .single()

        if (error || !player) return null

        // Google-only accounts have null password_hash — block credentials login
        if (!player.password_hash) return null

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          player.password_hash,
        )
        if (!passwordMatch) return null

        await supabase
          .from('players')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', player.id)

        return {
          id:    player.id,
          email: player.email,
          name:  player.username,
          role:  player.role as PlayerRole,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      // ── Credentials sign-in ──────────────────────────────────────────────
      if (user && account?.provider === 'credentials') {
        token.id         = user.id
        token.role       = user.role as PlayerRole
        token.needsSetup = false
      }

      // ── Google sign-in ───────────────────────────────────────────────────
      // Look up the player by email to determine if this is a new or
      // returning Google user. New users must complete their game profile.
      if (account?.provider === 'google' && user?.email) {
        const supabase = createAdminClient()

        const { data: player } = await supabase
          .from('players')
          .select('id, role')
          .eq('email', user.email)
          .maybeSingle()

        if (player) {
          // Returning Google user — full game profile exists
          token.id         = player.id
          token.role       = player.role as PlayerRole
          token.needsSetup = false

          await supabase
            .from('players')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', player.id)
        } else {
          // New Google user — no game profile yet
          // token.email is set automatically by NextAuth from user.email
          token.id         = ''
          token.role       = 'player' as PlayerRole
          token.needsSetup = true
        }
      }

      // ── Session update (client calls useSession().update()) ──────────────
      // Fires after profile completion to pick up the newly created player.
      if (trigger === 'update' && token.needsSetup && token.email) {
        const supabase = createAdminClient()

        const { data: player } = await supabase
          .from('players')
          .select('id, role')
          .eq('email', token.email as string)
          .maybeSingle()

        if (player) {
          token.id         = player.id
          token.role       = player.role as PlayerRole
          token.needsSetup = false
        }
      }

      return token
    },

    async session({ session, token }) {
      session.user.id         = (token.id         as string)     ?? ''
      session.user.role       = (token.role       as PlayerRole) ?? 'player'
      session.user.needsSetup = (token.needsSetup as boolean)    ?? false
      return session
    },
  },
}
