import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sword, Users, Trophy, Zap, Shield, Star } from 'lucide-react'

const FEATURES = [
  { icon: Sword,   title: 'קרבות בזמן אמת',  desc: 'לחם נגד שחקנים אחרים בכל רגע נתון בזמן אמת', color: 'text-game-red-bright',    bg: 'bg-game-red/10 border-game-red/20' },
  { icon: Users,   title: 'שבטים עוצמתיים',  desc: 'הצטרף לשבט, שתף אסטרטגיות ונצח יחד', color: 'text-game-blue-bright',  bg: 'bg-game-blue/10 border-game-blue/20' },
  { icon: Trophy,  title: 'תחרות עונתית',     desc: 'כל 90 יום עונה חדשה עם פרסים ייחודיים', color: 'text-game-gold-bright', bg: 'bg-game-gold/10 border-game-gold/20' },
  { icon: Zap,     title: 'כלכלה דינמית',     desc: 'נהל משאבים, סחר ובנה אימפריה כלכלית', color: 'text-game-green-bright', bg: 'bg-game-green/10 border-game-green/20' },
  { icon: Shield,  title: 'עומק אסטרטגי',    desc: 'אינספור דרכי משחק — תקיפה, ריגול, הגנה', color: 'text-game-purple-bright',bg: 'bg-game-purple/10 border-game-purple/20' },
  { icon: Star,    title: 'משחק הוגן',        desc: 'ללא pay-to-win. הניצחון תלוי באסטרטגיה', color: 'text-game-orange-bright',bg: 'bg-game-orange/10 border-game-orange/20' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-game-bg" dir="rtl">

      {/* ── Navigation ── */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-game-border bg-game-surface/80 backdrop-blur-game">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚔️</span>
          <span className="font-display text-game-xl text-game-gold-bright uppercase tracking-widest">Domiron</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rankings" className="text-game-sm text-game-text-secondary font-heading hover:text-game-text transition-colors">
            דירוג
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 rounded-game font-heading text-game-sm uppercase tracking-wide text-game-text-secondary border border-game-border hover:border-game-border-gold hover:text-game-text transition-all"
          >
            כניסה
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="text-center py-20 px-6 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-game-gold/3 via-transparent to-transparent pointer-events-none" />

        <div className="relative max-w-3xl mx-auto">
          {/* Animated sword icon */}
          <div className="flex justify-center mb-6">
            <div className={cn(
              'size-24 rounded-2xl rotate-12 flex items-center justify-center text-5xl',
              'bg-gradient-to-br from-game-gold/20 to-game-gold-dim/10',
              'border-2 border-game-gold/40 shadow-gold-glow',
              'animate-float'
            )}>
              ⚔️
            </div>
          </div>

          <h1 className={cn(
            'font-display text-game-6xl gold-gradient-text uppercase tracking-widest mb-4',
            'leading-none'
          )}>
            Domiron
          </h1>

          <p className="text-game-lg text-game-text-secondary font-body mb-8 max-w-xl mx-auto leading-relaxed">
            בנה אימפריה, לחם נגד מאות שחקנים, והפוך לאגדה של העונה
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className={cn(
                'px-8 py-3 rounded-game font-heading text-base uppercase tracking-wider',
                'bg-gradient-to-r from-game-gold to-game-gold-dim text-game-bg',
                'border border-game-gold shadow-gold-glow',
                'hover:from-game-gold-bright hover:to-game-gold transition-all duration-200',
                'animate-pulse-gold'
              )}
            >
              🎮 התחל לשחק — בחינם!
            </Link>
            <Link
              href="/rankings"
              className={cn(
                'px-6 py-3 rounded-game font-heading text-sm uppercase tracking-wider',
                'border border-game-border text-game-text-secondary',
                'hover:border-game-border-gold hover:text-game-text transition-all duration-200'
              )}
            >
              צפה בדירוג
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live Stats ── */}
      <section className="py-10 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-4">
          {[
            { value: '1,234', label: 'שחקנים מחוברים', color: 'text-game-green-bright' },
            { value: '45,678', label: 'קרבות היום',      color: 'text-game-red-bright' },
            { value: '156',    label: 'שבטים פעילים',   color: 'text-game-blue-bright' },
          ].map(({ value, label, color }) => (
            <div key={label} className={cn(
              'glass-panel p-5 text-center',
              'bg-game-surface/60'
            )}>
              <p className={cn('font-display text-game-3xl font-bold', color)}>{value}</p>
              <p className="text-game-xs text-game-text-muted font-body mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display text-game-2xl gold-gradient-text-static uppercase text-center tracking-wide mb-10">
            למה Domiron?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
              <div key={title} className={cn('rounded-game-xl border p-5 transition-all hover:scale-[1.01]', bg)}>
                <Icon className={cn('size-6 mb-3', color)} />
                <h3 className="font-heading text-game-sm text-game-text-white uppercase tracking-wide mb-1">{title}</h3>
                <p className="text-game-xs text-game-text-secondary font-body leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-16 px-6">
        <div className={cn(
          'max-w-2xl mx-auto rounded-game-xl p-10 text-center',
          'bg-gradient-to-br from-game-purple/30 via-game-blue/20 to-game-purple/10',
          'border border-game-purple/30'
        )}>
          <h2 className="font-display text-game-3xl text-game-text-white uppercase tracking-wide mb-4">
            מוכן לבנות את האימפריה שלך?
          </h2>
          <p className="text-game-sm text-game-text-secondary font-body mb-6">
            הצטרף לאלפי שחקנים כבר עכשיו — ללא תשלום
          </p>
          <Link
            href="/register"
            className={cn(
              'inline-flex items-center gap-2 px-8 py-3 rounded-game',
              'font-heading text-base uppercase tracking-wider',
              'bg-gradient-to-r from-game-gold to-game-gold-dim text-game-bg',
              'border border-game-gold shadow-gold-glow',
              'hover:from-game-gold-bright hover:to-game-gold transition-all'
            )}
          >
            <Crown /> צור חשבון
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-game-border px-6 py-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <p className="text-game-xs text-game-text-muted font-body">© 2025 Domiron. כל הזכויות שמורות.</p>
          <div className="flex gap-4 text-game-xs text-game-text-muted font-body">
            <Link href="#" className="hover:text-game-text transition-colors">תנאי שימוש</Link>
            <Link href="#" className="hover:text-game-text transition-colors">פרטיות</Link>
            <Link href="#" className="hover:text-game-text transition-colors">עזרה</Link>
          </div>
        </div>
      </footer>

    </div>
  )
}

function Crown({ className }: { className?: string }) {
  return <span className={className}>👑</span>
}
