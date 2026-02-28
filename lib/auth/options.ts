import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { createAdminClient } from '@/lib/supabase/server'

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
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const supabase = createAdminClient()

        const { data: player, error } = await supabase
          .from('players')
          .select('id, email, username, password_hash, role')
          .eq('email', credentials.email)
          .single()

        if (error || !player) return null

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          player.password_hash
        )
        if (!passwordMatch) return null

        // Update last_seen_at
        await supabase
          .from('players')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', player.id)

        return {
          id: player.id,
          email: player.email,
          name: player.username,
          role: player.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as 'player' | 'admin'
      }
      return session
    },
  },
}
