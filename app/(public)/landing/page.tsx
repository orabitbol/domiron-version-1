import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sword, Users, Trophy, Zap, Shield, Star, Crown } from 'lucide-react'

const FEATURES = [
  { icon: Sword,  title: 'קרבות בזמן אמת',  desc: 'לחם נגד שחקנים אחרים בכל רגע נתון בזמן אמת', color: 'text-game-red-bright',     bg: 'from-game-red/15 to-transparent border-game-red/25' },
  { icon: Users,  title: 'שבטים עוצמתיים',  desc: 'הצטרף לשבט, שתף אסטרטגיות ונצח יחד',          color: 'text-game-blue-bright',    bg: 'from-game-blue/15 to-transparent border-game-blue/25' },
  { icon: Trophy, title: 'תחרות עונתית',     desc: 'כל 90 יום עונה חדשה עם פרסים ייחודיים',       color: 'text-game-gold-bright',    bg: 'from-game-gold/12 to-transparent border-game-gold/25' },
  { icon: Zap,    title: 'כלכלה דינמית',     desc: 'נהל משאבים, סחר ובנה אימפריה כלכלית',         color: 'text-game-green-bright',   bg: 'from-game-green/15 to-transparent border-game-green/25' },
  { icon: Shield, title: 'עומק אסטרטגי',    desc: 'אינספור דרכי משחק — תקיפה, ריגול, הגנה',      color: 'text-game-purple-bright',  bg: 'from-game-purple/15 to-transparent border-game-purple/25' },
  { icon: Star,   title: 'משחק הוגן',        desc: 'ללא pay-to-win. הניצחון תלוי באסטרטגיה',      color: 'text-game-orange-bright',  bg: 'from-game-orange/15 to-transparent border-game-orange/25' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen" dir="rtl">

      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-game-border-gold/20 bg-game-surface/80 backdrop-blur-game shadow-[0_2px_16px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚔️</span>
          <span className="font-display text-game-xl text-game-gold-bright uppercase tracking-widest text-title-glow">Domiron</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rankings" className="text-game-sm text-game-text-secondary font-heading uppercase tracking-wide hover:text-game-text transition-colors">
            דירוג
          </Link>
          <Link
            href="/login"
            className={cn(
              'px-4 py-2 rounded-game font-heading text-game-sm uppercase tracking-wide',
              'text-game-text-secondary border border-game-border',
              'hover:border-game-border-gold hover:text-game-text hover:bg-game-gold/5',
              'transition-all duration-200'
            )}
          >
            כניסה
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(201,144,26,0.08)_0%,transparent_60%)] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className={cn(
              'size-24 rounded-game-xl rotate-12 flex items-center justify-center text-5xl',
              'bg-gradient-to-br from-game-gold/20 to-game-gold-dim/10',
              'border-2 border-game-gold/40 shadow-gold-glow',
              'animate-float'
            )}>
              ⚔️
            </div>
          </div>

          <h1 className="font-display text-game-6xl gold-gradient-text uppercase tracking-widest mb-4 leading-none text-title-glow">
            Domiron
          </h1>

          <p className="text-game-lg text-game-text-secondary font-body mb-10 max-w-xl mx-auto leading-relaxed">
            בנה אימפריה, לחם נגד מאות שחקנים, והפוך לאגדה של העונה
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className={cn(
                'px-8 py-3.5 rounded-game font-heading text-base uppercase tracking-wider',
                'bg-gradient-to-b from-game-gold-bright via-game-gold to-game-gold-dim text-game-bg font-bold',
                'border border-game-gold-dim',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.2),0_0_20px_rgba(201,144,26,0.4)]',
                'hover:shadow-gold-glow-lg hover:from-game-gold-bright hover:to-game-gold',
                'transition-all duration-200 active:scale-[0.97]',
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
                'shadow-[inset_0_1px_0_rgba(240,192,48,0.04)]',
                'hover:border-game-border-gold hover:text-game-text hover:bg-game-gold/5',
                'transition-all duration-200'
              )}
            >
              צפה בדירוג
            </Link>
          </div>
        </div>
      </section>

      {/* Live Stats */}
      <section className="py-10 px-6">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-4">
          {[
            { value: '1,234', label: 'שחקנים מחוברים', color: 'text-game-green-bright' },
            { value: '45,678', label: 'קרבות היום',      color: 'text-game-red-bright' },
            { value: '156',    label: 'שבטים פעילים',   color: 'text-game-blue-bright' },
          ].map(({ value, label, color }) => (
            <div key={label} className="panel-ornate p-5 text-center">
              <p className={cn('font-display text-game-3xl font-bold', color)}>{value}</p>
              <p className="text-game-xs text-game-text-muted font-body mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display text-game-2xl gold-gradient-text-static uppercase text-center tracking-wide mb-2 text-title-glow">
            למה Domiron?
          </h2>
          <div className="divider-ornate max-w-xs mx-auto mb-10" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
              <div key={title} className={cn(
                'rounded-game-lg border p-5 bg-gradient-to-b',
                'transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]',
                bg
              )}>
                <Icon className={cn('size-6 mb-3', color)} />
                <h3 className="font-heading text-game-sm text-game-text-white uppercase tracking-wide mb-1.5">{title}</h3>
                <p className="text-game-xs text-game-text-secondary font-body leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6">
        <div className={cn(
          'max-w-2xl mx-auto panel-ornate p-10 text-center',
          'bg-gradient-to-br from-game-purple/20 via-game-blue/10 to-transparent',
        )}>
          <h2 className="font-display text-game-3xl text-game-text-white uppercase tracking-wide mb-4 text-title-glow">
            מוכן לבנות את האימפריה שלך?
          </h2>
          <p className="text-game-sm text-game-text-secondary font-body mb-6">
            הצטרף לאלפי שחקנים כבר עכשיו — ללא תשלום
          </p>
          <Link
            href="/register"
            className={cn(
              'inline-flex items-center gap-2 px-8 py-3.5 rounded-game',
              'font-heading text-base uppercase tracking-wider font-bold',
              'bg-gradient-to-b from-game-gold-bright via-game-gold to-game-gold-dim text-game-bg',
              'border border-game-gold-dim',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_16px_rgba(201,144,26,0.3)]',
              'hover:shadow-gold-glow transition-all duration-200 active:scale-[0.97]'
            )}
          >
            <Crown className="size-5" /> צור חשבון
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-game-border-gold/20 px-6 py-6">
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
