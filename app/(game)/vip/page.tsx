import { cn } from '@/lib/utils'
import { Gem, Shield, Crown, Sparkles, Lock } from 'lucide-react'

const PACKAGES = [
  { name: 'מתחיל', diamonds: 100,  price: 4.99,  bonus: null,   popular: false },
  { name: 'לוחם',  diamonds: 300,  price: 12.99, bonus: '+10%', popular: false },
  { name: 'אביר',  diamonds: 700,  price: 24.99, bonus: '+20%', popular: true  },
  { name: 'מלך',   diamonds: 1500, price: 49.99, bonus: '+30%', popular: false },
  { name: 'אימפרטור', diamonds: 4000, price: 99.99, bonus: '+50%', popular: false },
]

export default function VipPage() {
  return (
    <div className="space-y-8">

      {/* Header */}
      <div className={cn(
        'relative overflow-hidden rounded-game-xl p-6',
        'bg-gradient-to-br from-pink-950/60 via-purple-950/50 to-game-bg',
        'border border-pink-800/30'
      )}>
        {/* Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 via-purple-500/5 to-transparent pointer-events-none" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="animate-[spin_6s_linear_infinite] p-3 rounded-full bg-pink-900/30 border border-pink-500/30">
              <Gem className="size-8 text-pink-400" />
            </div>
            <div>
              <h1 className="font-display text-game-3xl text-pink-300 uppercase tracking-wide">💎 חנות יהלומים</h1>
              <p className="text-game-sm text-game-text-secondary font-body mt-1">
                שדרג את האימפריה שלך עם יהלומים פרימיום
              </p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-game-xs text-game-text-muted font-body">היהלומים שלך</p>
            <p className="font-display text-game-5xl text-pink-300">💎 0</p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Crown,    title: 'לחשים בלעדיים', desc: 'גישה לכישורי גיבור ייחודיים שאי אפשר להשיג אחרת', color: 'text-game-gold-bright', bg: 'bg-game-gold/8 border-game-gold/20' },
          { icon: Shield,   title: 'הגנות מתקדמות', desc: 'מגינים וציוד הגנה מיוחד לשחקני VIP בלבד',          color: 'text-game-blue-bright', bg: 'bg-game-blue/8 border-game-blue/20' },
          { icon: Sparkles, title: 'בונוסים מיוחדים', desc: 'ייצור מוגבר, תורות נוספות ועוד יתרונות שוטפים',  color: 'text-game-purple-bright', bg: 'bg-game-purple/8 border-game-purple/20' },
        ].map(({ icon: Icon, title, desc, color, bg }) => (
          <div key={title} className={cn('rounded-game-xl border p-4', bg)}>
            <Icon className={cn('size-6 mb-3', color)} />
            <h3 className="font-heading text-game-sm text-game-text-white mb-1">{title}</h3>
            <p className="text-game-xs text-game-text-secondary font-body leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* Packages */}
      <div>
        <h2 className="font-display text-game-xl text-game-text-white uppercase tracking-wide text-center mb-4">
          חבילות יהלומים
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.name}
              className={cn(
                'relative rounded-game-xl border p-5 text-center flex flex-col gap-3',
                'transition-all duration-200 hover:scale-[1.02]',
                pkg.popular
                  ? 'bg-gradient-to-b from-game-gold/15 to-game-gold/5 border-game-gold/50 shadow-gold-glow-sm'
                  : 'card-game hover:border-pink-800/40'
              )}
            >
              {pkg.popular && (
                <div className="absolute -top-3 inset-x-0 flex justify-center">
                  <span className="chip bg-game-gold text-game-bg text-[10px] font-bold px-3">
                    ⭐ הפופולרי ביותר
                  </span>
                </div>
              )}
              <div className="text-4xl">💎</div>
              <div>
                <p className="font-display text-game-sm text-game-text-secondary uppercase tracking-wider">{pkg.name}</p>
                <p className="font-display text-game-4xl text-pink-300 my-1">{pkg.diamonds}</p>
                {pkg.bonus && (
                  <p className="text-game-xs text-game-green-bright font-body">
                    + בונוס {pkg.bonus}
                  </p>
                )}
              </div>
              <p className="font-heading text-game-lg text-game-text-white font-bold">${pkg.price}</p>
              <button
                className={cn(
                  'w-full py-2 px-4 rounded-game font-heading text-game-sm uppercase tracking-wide',
                  'transition-all duration-150',
                  pkg.popular
                    ? 'bg-game-gold text-game-bg hover:bg-game-gold-bright'
                    : 'bg-pink-900/40 border border-pink-700/40 text-pink-300 hover:bg-pink-900/60'
                )}
                disabled
              >
                רכוש עכשיו
              </button>
              <p className="text-game-xs text-game-text-muted font-body">
                ${(pkg.price / pkg.diamonds).toFixed(3)} ליהלום
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* What you can do */}
      <div>
        <h2 className="font-heading text-game-base text-game-text-secondary uppercase tracking-wider mb-3">מה ניתן לרכוש</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'לחשי גיבור',      range: '50-200 💎', icon: '🧙' },
            { label: 'הגנות פרימיום',   range: '100-500 💎', icon: '🛡️' },
            { label: 'בונוסי ייצור',    range: '25-150 💎', icon: '⚡' },
            { label: 'תורות נוספות',    range: '10-100 💎', icon: '🔄' },
          ].map(({ label, range, icon }) => (
            <div key={label} className="card-game p-3 text-center">
              <div className="text-2xl mb-2">{icon}</div>
              <p className="font-heading text-game-xs text-game-text-white">{label}</p>
              <p className="text-game-xs text-pink-400 font-body mt-0.5">{range}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Security */}
      <div className="card-game p-4 flex flex-wrap items-center gap-4">
        <Lock className="size-5 text-game-green-bright shrink-0" />
        <div className="flex-1">
          <p className="font-heading text-game-sm text-game-text-white">תשלום מאובטח</p>
          <p className="text-game-xs text-game-text-muted font-body">כל העסקאות מוצפנות ומאובטחות</p>
        </div>
        <div className="flex gap-3 text-game-text-muted text-game-sm">
          {['Visa', 'Mastercard', 'PayPal', 'Apple Pay'].map(m => (
            <span key={m} className="px-2 py-0.5 rounded bg-game-elevated border border-game-border text-game-xs font-body">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Coming soon note */}
      <div className="text-center text-game-xs text-game-text-muted font-body py-2">
        🔧 מערכת התשלומים בפיתוח — בקרוב!
      </div>

    </div>
  )
}
