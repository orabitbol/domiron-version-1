/**
 * /guide — Public Game Reference
 *
 * Accessible to everyone: guests, logged-out users, and authenticated players.
 * Auth users receive the full game shell (GameLayout via community layout).
 * Guests receive the minimal public shell (also via community layout).
 *
 * Server component — all content is static.
 * GuideRestartButton (client component) handles the tour restart for auth users.
 */

import React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { GuideRestartButton } from '@/components/guide/GuideRestartButton'

// ── TOC entries ───────────────────────────────────────────────────────────────

const TOC = [
  { id: 'overview',   label: 'מהו דומירון?'      },
  { id: 'goal',       label: 'מטרת המשחק'        },
  { id: 'loop',       label: 'לולאת המשחק'       },
  { id: 'resources',  label: 'משאבים'            },
  { id: 'population', label: 'אוכלוסייה ועבדים'  },
  { id: 'mines',      label: 'מכרות וייצור'      },
  { id: 'training',   label: 'אימון כוחות'       },
  { id: 'combat',     label: 'מערכת הקרב'        },
  { id: 'spy',        label: 'ריגול'             },
  { id: 'bank',       label: 'הבנק'              },
  { id: 'develop',    label: 'פיתוח עיר'         },
  { id: 'hero',       label: 'הגיבור'            },
  { id: 'tribe',      label: 'שבטים'             },
  { id: 'rankings',   label: 'דירוגים'           },
  { id: 'tips',       label: 'טיפים למתחילים'   },
] as const

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xl leading-none">{icon}</span>
        <h2 className="font-heading text-game-base text-game-gold-bright uppercase tracking-wide text-title-glow">
          {title}
        </h2>
      </div>
      <div className="divider-gold" />
    </div>
  )
}

function Gold({ children }: { children: React.ReactNode }) {
  return (
    <strong className="text-game-gold font-semibold">{children}</strong>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn(
      'flex items-start gap-2.5 mt-3 px-3.5 py-2.5 rounded-game',
      'border border-game-gold/20 bg-game-gold/5',
    )}>
      <span className="text-game-gold-bright text-xs mt-0.5 shrink-0 font-bold">⚑</span>
      <p className="text-game-xs text-game-text-secondary font-body leading-relaxed">{children}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-game-border/50 last:border-0">
      <dt className="shrink-0 w-28 font-heading text-game-xs text-game-gold/70 uppercase tracking-wide pt-0.5">
        {label}
      </dt>
      <dd className="text-game-sm text-game-text-secondary font-body leading-relaxed flex-1">
        {children}
      </dd>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  return (
    <div dir="rtl">

      {/* ── Page hero ─────────────────────────────────────────────────────── */}
      <div className="relative mb-8 overflow-hidden">
        {/* Ambient glow behind title */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(201,144,26,0.07) 0%, transparent 70%)',
          }}
        />

        <div className="relative text-center py-8 px-4">
          <div className="flex justify-center mb-4">
            <div className={cn(
              'size-16 rounded-game-xl flex items-center justify-center text-3xl',
              'bg-gradient-to-br from-game-gold/18 to-game-gold-dim/8',
              'border border-game-gold/35 shadow-[0_0_24px_rgba(201,144,26,0.2)]',
            )}>
              📜
            </div>
          </div>

          <h1 className="font-display text-game-4xl gold-gradient-text-static uppercase tracking-widest mb-2 text-title-glow">
            מדריך המשחק
          </h1>
          <p className="text-game-sm text-game-text-secondary font-body max-w-lg mx-auto leading-relaxed mb-6">
            כל מה שצריך לדעת כדי לבנות אימפריה, להביס יריבים, ולהגיע לראש הדירוג
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className={cn(
                'inline-flex items-center gap-2 px-6 py-2.5 rounded-game',
                'font-heading text-game-sm uppercase tracking-wider font-bold',
                'bg-gradient-to-b from-game-gold-bright via-game-gold to-game-gold-dim text-game-bg',
                'border border-game-gold-dim',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_16px_rgba(201,144,26,0.3)]',
                'hover:shadow-gold-glow transition-all duration-200 active:scale-[0.97]',
              )}
            >
              🎮 התחל לשחק
            </Link>
            {/* GuideRestartButton is null for guests, shows for auth users */}
            <GuideRestartButton />
          </div>
        </div>
      </div>

      {/* ── Table of contents ─────────────────────────────────────────────── */}
      <nav className="mb-8">
        <div className={cn(
          'panel-ornate px-4 py-3',
        )}>
          <p className="text-game-xs font-heading uppercase tracking-widest text-game-gold/55 mb-2.5">
            תוכן עניינים
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TOC.map((item, i) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-game transition-all duration-150',
                  'font-body text-game-xs border border-game-border',
                  'text-game-text-secondary hover:text-game-text hover:border-game-border-gold hover:bg-game-gold/8',
                )}
              >
                <span className="text-game-gold/40 font-heading text-[10px]">{i + 1}.</span>
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Sections ──────────────────────────────────────────────────────── */}
      <div className="space-y-5">

        {/* 1 — מהו דומירון? */}
        <section id="overview" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="⚔️" title="מהו דומירון?" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            דומירון הוא משחק אסטרטגיה מבוסס דפדפן המתנהל בזמן אמת נגד מאות שחקנים אחרים.
            המשחק מחולק ל<Gold>עונות של 90 יום</Gold> — בכל עונה אתה מתחיל מאפס, בונה אימפריה, ומתחרה מי יגיע לדירוג הגבוה ביותר עד סוף העונה.
          </p>
          <p className="text-game-sm text-game-text-secondary font-body leading-relaxed">
            אין pay-to-win. הניצחון תלוי אך ורק ב<Gold>אסטרטגיה, עקביות, ושיתוף פעולה</Gold> עם שחקנים אחרים.
          </p>
        </section>

        {/* 2 — מטרת המשחק */}
        <section id="goal" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="👑" title="מטרת המשחק" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            המטרה היא להגיע ל<Gold>דירוג הגבוה ביותר</Gold> כשתסתיים העונה.
            הדירוג נקבע לפי <Gold>עוצמת הלחימה הכוללת</Gold> שלך — סכום כוח ההתקפה, ההגנה, הריגול, והסיור שלך.
          </p>
          <dl className="space-y-0">
            <Row label="דירוג עיר">מיקומך בין שחקני עירך (מתוך 5 ערים)</Row>
            <Row label="דירוג גלובלי">מיקומך בין כלל השחקנים בעונה</Row>
            <Row label="מוקדש לתהילה">השחקנים הטובים ביותר בסוף עונה נכנסים ל-Hall of Fame לנצח</Row>
          </dl>
        </section>

        {/* 3 — לולאת המשחק */}
        <section id="loop" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🔄" title="לולאת המשחק" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            המשחק מתקדם ב<Gold>טיקים</Gold> — כל 30 דקות מתבצעת עדכון אוטומטי של כל שחקני העונה.
          </p>
          <dl className="space-y-0">
            <Row label="טיק (30 דקות)">משאבים מיוצרים, תורות מתמלאות, ריבית משולמת, דירוגים מתעדכנים</Row>
            <Row label="תורות (Turns)">נצרכות בתקיפות. מתמלאות בכל טיק עד לתקרה. ניהול תורות נכון הוא מפתח</Row>
            <Row label="עונה (90 יום)">כל שחקן מתחיל מאפס. הדירוג שנבנה לאורך 90 יום קובע את הניצחון</Row>
          </dl>
          <Tip>משחק קבוע בכל יום — גם 15 דקות — שווה הרבה יותר ממרתון פעם בשבוע. הטיקים עובדים בשבילך כל הזמן.</Tip>
        </section>

        {/* 4 — משאבים */}
        <section id="resources" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="💰" title="משאבים" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-4">
            ארבעה משאבים מניעים את כל פעולות המשחק. כולם מיוצרים על ידי עבדים במכרות בכל טיק.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
            {[
              { emoji: '🪙', name: 'זהב',   color: 'text-game-gold-bright',   desc: 'מטבע ראשי — לאימון, לקנייה, ולהפקדה בבנק' },
              { emoji: '⚙️', name: 'ברזל',  color: 'text-res-iron',            desc: 'לאימון פרשים ולציוד קרב' },
              { emoji: '🌲', name: 'עץ',    color: 'text-res-wood',            desc: 'לשדרוגי פיתוח ולפריטים בחנות' },
              { emoji: '🌾', name: 'מזון',  color: 'text-res-food',            desc: 'אחזקה שוטפת של הצבא בכל טיק' },
            ].map(({ emoji, name, color, desc }) => (
              <div key={name} className="card-gold p-3 text-center">
                <div className="text-2xl mb-1">{emoji}</div>
                <p className={cn('font-heading text-game-sm uppercase tracking-wide', color)}>{name}</p>
                <p className="text-game-xs text-game-text-muted font-body mt-1 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <Tip>משאבים שאינם בבנק חשופים לבזיזה. לפני שאתה מתנתק — הפקד זהב בבנק.</Tip>
        </section>

        {/* 5 — אוכלוסייה ועבדים */}
        <section id="population" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="👥" title="אוכלוסייה ועבדים" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            <Gold>אוכלוסייה חופשית</Gold> היא מאגר השחקן לגיוס — ממנה מאמנים את כל סוגי היחידות.
            גידול האוכלוסייה תלוי ברמת פיתוח העיר שלך.
          </p>
          <dl className="space-y-0">
            <Row label="אוכלוסייה חופשית">מאגר הגיוס. כל יחידה שמאמנים מפחיתה מהמאגר</Row>
            <Row label="עבדים">האמצעי היחיד לייצור משאבים. מאומנים ב-0 זהב + אוכלוסייה חופשית</Row>
            <Row label="פרשים">עולים 5 אוכלוסייה — עוצמתיים במיוחד בהתקפה</Row>
          </dl>
          <Tip>תאמן עבדים ראשון. בלי ייצור משאבים — הכל עוצר. הצבא יבוא אחר כך.</Tip>
        </section>

        {/* 6 — מכרות וייצור */}
        <section id="mines" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="⛏️" title="מכרות וייצור" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            בעמוד <Gold>המכרות</Gold> מקצים עבדים לייצור כל סוג משאב.
            הכמות המיוצרת בכל טיק = <Gold>מספר העבדים × קצב ייצור × מכפיל רמת פיתוח</Gold>.
          </p>
          <dl className="space-y-0">
            <Row label="הקצאה">גרור את מספר העבדים לכל מכרה. השמירה נשלחת לשרת</Row>
            <Row label="קצב ייצור">עולה עם שדרוג פיתוח העיר (Gold/Iron/Wood/Food Level)</Row>
            <Row label="איזון">השקע יותר עבדים במשאב שנגמר לך הכי מהר</Row>
          </dl>
        </section>

        {/* 7 — אימון כוחות */}
        <section id="training" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🛡️" title="אימון כוחות" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-4">
            ממירים אוכלוסייה חופשית ליחידות לחימה. כל יחידה תורמת לעוצמת הדירוג שלך.
          </p>
          <div className="space-y-0">
            {[
              { name: 'חיילים',  cost: '1 אוכלוסייה + זהב',           role: 'יחידת הלחימה הבסיסית. תקיפה והגנה' },
              { name: 'פרשים',   cost: '5 אוכלוסייה + זהב + ברזל',   role: 'כוח הלחימה הגבוה ביותר. יקרים אך חזקים' },
              { name: 'מרגלים',  cost: '1 אוכלוסייה + זהב',           role: 'ריגול על שחקנים אחרים לפני תקיפה' },
              { name: 'סיירים',  cost: '1 אוכלוסייה + זהב',           role: 'חושפים מידע על כוח האויב לפני קרב' },
              { name: 'עבדים',   cost: '1 אוכלוסייה (ללא זהב)',       role: 'מוקצים למכרות לייצור משאבים בכל טיק' },
            ].map(({ name, cost, role }) => (
              <Row key={name} label={name}>
                <span>{role}</span>
                <span className="block text-game-xs text-game-gold/55 mt-0.5">{cost}</span>
              </Row>
            ))}
          </div>
          <Tip>מיומנויות אימון (Training Levels) משדרגות את עוצמת יחידותיך לצמיתות — משתלם להשקיע בהן.</Tip>
        </section>

        {/* 8 — מערכת הקרב */}
        <section id="combat" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="⚔️" title="מערכת הקרב" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            תוקפים שחקנים <Gold>באותה עיר</Gold> בלבד. הקרב מוכרע מיידית על בסיס עוצמת הלחימה.
            מנצח מי שיש לו <Gold>ECP (Effective Combat Power)</Gold> גבוה יותר.
          </p>
          <dl className="space-y-0">
            <Row label="עלות תקיפה">תורות + מזון לאחזקה</Row>
            <Row label="ניצחון">בוזזים אחוז מהזהב, ברזל, עץ, ומזון שלא בבנק</Row>
            <Row label="הפסד">אין בזיזה, הפסד חיילים</Row>
            <Row label="מגן משאבים">מגן פעיל מונע בזיזה לחלוטין</Row>
            <Row label="מגן חיילים">מגן פעיל מונע איבוד יחידות מצד המגן</Row>
            <Row label="הגנת שחקן חדש">שחקנים בתוך 24 שעות מהרשמה מוגנים מפני תקיפות</Row>
          </dl>
          <Tip>השתמש בסיירים לפני תקיפה — הם חושפים את הכוח האמיתי של היריב ומורידים את הסיכון.</Tip>
        </section>

        {/* 9 — ריגול */}
        <section id="spy" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🕵️" title="ריגול" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            שלח <Gold>מרגלים</Gold> לאסוף מידע על יריבים לפני תקיפה.
            משימת ריגול מצליחה חושפת: צבא, משאבים, בנק, וציוד.
          </p>
          <dl className="space-y-0">
            <Row label="הצלחה">תלויה במספר המרגלים שלך מול רמת הריגול של המגן</Row>
            <Row label="תפיסה">מרגל שנתפס נאבד לצמיתות</Row>
            <Row label="שימוש">השתמש בריגול לפני כל תקיפה גדולה</Row>
          </dl>
        </section>

        {/* 10 — הבנק */}
        <section id="bank" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🏦" title="הבנק" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            <Gold>הגנה על הזהב</Gold> שלך היא אחד הדברים החשובים במשחק.
            הפקדת זהב בבנק הופכת אותו לבלתי ניתן לגניבה — ומרוויח ריבית בכל טיק.
          </p>
          <dl className="space-y-0">
            <Row label="הפקדה">מזהב ברשותך לחשבון הבנק. מוגן לחלוטין</Row>
            <Row label="ריבית">ריבית אוטומטית בכל טיק על יתרת הבנק</Row>
            <Row label="שדרוג">שדרג את רמת הריבית לתשואה גבוהה יותר — השקעה לטווח ארוך</Row>
            <Row label="מגבלה יומית">מספר ההפקדות ביום מוגבל. תכנן בהתאם</Row>
          </dl>
          <Tip>הרגל: לפני כל יציאה מהמשחק, הפקד את הזהב שלך. פשרה אחת יכולה לעלות שעות של ייצור.</Tip>
        </section>

        {/* 11 — פיתוח עיר */}
        <section id="develop" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🏗️" title="פיתוח עיר" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            שישה מבנים שניתן לשדרג, כל אחד מגביר היבט אחר של האימפריה שלך.
            השדרוגים <Gold>מצטברים ולצמיתות</Gold>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { name: 'מכרה זהב',          effect: 'מגביר ייצור זהב לכל עבד מכרה' },
              { name: 'מכרה ברזל',         effect: 'מגביר ייצור ברזל לכל עבד מכרה' },
              { name: 'מכרה עץ',           effect: 'מגביר ייצור עץ לכל עבד מכרה' },
              { name: 'מכרה מזון',         effect: 'מגביר ייצור מזון לכל עבד מכרה' },
              { name: 'מרכז אוכלוסייה',   effect: 'מגדיל גידול אוכלוסייה חופשית בכל טיק' },
              { name: 'ביצורים',           effect: 'מוסיף בונוס הגנה סטטי לעיר' },
            ].map(({ name, effect }) => (
              <div key={name} className="flex items-start gap-2.5 py-1.5 px-2 rounded-game bg-game-elevated/30">
                <span className="text-game-gold/60 mt-0.5">▸</span>
                <div>
                  <span className="font-heading text-game-xs text-game-text-white uppercase tracking-wide">{name} </span>
                  <span className="text-game-xs text-game-text-secondary font-body">— {effect}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 12 — הגיבור */}
        <section id="hero" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🌟" title="הגיבור שלך" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            לכל שחקן גיבור אישי שצובר ניסיון ומשתדרג לאורך העונה.
            ככל שהגיבור חזק יותר — כך הצבא שלך חזק יותר.
          </p>
          <dl className="space-y-0">
            <Row label="נקודות קסם (EXP)">מצטברות מקרבות ומטיקים. קידום לרמה הבאה</Row>
            <Row label="נקודות לחש">מוענקות בקידום רמה. מוציאים אותן על כישורים</Row>
            <Row label="כישורים">בונוסים קבועים: +% התקפה, +% הגנה, ועוד</Row>
            <Row label="מאנה">מתחדשת בכל טיק. משמשת להפעלת מגינים ולתרומה לשבט</Row>
          </dl>
          <Tip>השקע נקודות לחש בבונוסים שמתאימים לסגנון המשחק שלך — התקפה לרייד-פלייסטייל, הגנה למי שמעדיף לבנות לאט.</Tip>
        </section>

        {/* 13 — שבטים */}
        <section id="tribe" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🤝" title="מערכת השבטים" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            שבטים הם ציר שיתוף הפעולה המרכזי במשחק.
            שחקן יחיד לעולם לא יוכל להתחרות בשבט מאורגן ופעיל.
          </p>
          <dl className="space-y-0">
            <Row label="הצטרפות">חפש שבט קיים או צור חדש. עלות יצירה: זהב</Row>
            <Row label="תפקידים">מנהיג (1) · סגנות (עד 3) · חבר</Row>
            <Row label="מאנה שבטית">כל חבר תורם מאנה אישית לקופת השבט</Row>
            <Row label="לחשים קבוצתיים">מאנה שבטית מממנת לחשים שמשפיעים על כל חברי השבט</Row>
            <Row label="מס יומי">מס זהב יומי אוטומטי מכל חבר — עובר למנהיג</Row>
            <Row label="רמת שבט">שדרוג רמה (1-5) במאנה שבטית — מגביר עוצמת לחשים</Row>
          </dl>
          <Tip>הצטרף לשבט ברגע שניתן. הלחשים הקבוצתיים (מגן, קרב, ייצור) חזקים מאוד ומקנים יתרון שלא ניתן להשיג בלעדיהם.</Tip>
        </section>

        {/* 14 — דירוגים */}
        <section id="rankings" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="🏆" title="דירוגים ותהילה" />
          <p className="text-game-sm text-game-text font-body leading-relaxed mb-3">
            הדירוג מתעדכן בכל טיק ומשקף את <Gold>עוצמת הלחימה הכוללת</Gold> שלך.
          </p>
          <dl className="space-y-0">
            <Row label="עוצמת לחימה">סכום כוח התקיפה, ההגנה, הריגול, והסיור</Row>
            <Row label="דירוג עיר">מיקומך בין שחקני אחת מ-5 הערים</Row>
            <Row label="דירוג גלובלי">מיקומך בין כל שחקני העונה</Row>
            <Row label="Hall of Fame">מיקומי TOP בסוף עונה — זיכרון לנצח</Row>
          </dl>
        </section>

        {/* 15 — טיפים למתחילים */}
        <section id="tips" className="panel-ornate p-5 scroll-mt-6">
          <SectionHeader icon="💡" title="טיפים למתחילים" />
          <div className="space-y-2.5">
            {[
              { n: '01', tip: 'אמן עבדים ראשון. בלי משאבים — הכל עוצר. מספר גדול של עבדים הוא הפעולה הראשונה שכדאי לעשות.' },
              { n: '02', tip: 'שדרג מכרות ואוכלוסייה לפני שאתה בונה צבא. תשתיות מצטברות לאורך כל העונה.' },
              { n: '03', tip: 'הצטרף לשבט בהקדם. הלחשים הקבוצתיים מספקים יתרון שלא ניתן להשיג לבד.' },
              { n: '04', tip: 'הפקד זהב בבנק לפני שאתה מתנתק. גניבה אחת עלולה לאחר אותך שעות.' },
              { n: '05', tip: 'לפני תקיפה — שלח סיירים. יש הבדל בין לנצח בקלות לאבד חיילים ללא תועלת.' },
              { n: '06', tip: 'שמור על כולמת ה-kill cooldown: אחרי שהרגת יחידות מאויב, יש להמתין 6 שעות לפני תקיפה מחדש.' },
              { n: '07', tip: 'שדרג את הגיבור. בונוסי כישורים (5-10%) שווים הרבה יותר ככל שהצבא שלך גדל.' },
            ].map(({ n, tip }) => (
              <div
                key={n}
                className="flex items-start gap-3 px-3.5 py-2.5 rounded-game border border-game-border/50 bg-game-elevated/20"
              >
                <span
                  className="shrink-0 font-heading text-game-xs text-game-gold/40 mt-0.5 w-5 text-end"
                  aria-hidden="true"
                >
                  {n}
                </span>
                <p className="text-game-sm text-game-text-secondary font-body leading-relaxed">{tip}</p>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <div className={cn(
        'mt-8 panel-ornate p-8 text-center',
        'bg-gradient-to-br from-game-purple/12 via-game-gold/5 to-transparent',
      )}>
        <div className="text-3xl mb-4">⚔️</div>
        <h2 className="font-display text-game-3xl gold-gradient-text-static uppercase tracking-wide mb-3 text-title-glow">
          מוכן להתחיל?
        </h2>
        <p className="text-game-sm text-game-text-secondary font-body mb-6 max-w-sm mx-auto leading-relaxed">
          צור חשבון חינם, תאמן עבדים, ותתחיל לבנות את האימפריה שלך
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register"
            className={cn(
              'inline-flex items-center gap-2 px-8 py-3 rounded-game',
              'font-heading text-game-base uppercase tracking-wider font-bold',
              'bg-gradient-to-b from-game-gold-bright via-game-gold to-game-gold-dim text-game-bg',
              'border border-game-gold-dim',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_20px_rgba(201,144,26,0.35)]',
              'hover:shadow-gold-glow transition-all duration-200 active:scale-[0.97]',
            )}
          >
            🎮 הצטרף לעונה — חינם!
          </Link>
          <Link
            href="/rankings"
            className={cn(
              'inline-flex items-center gap-1.5 px-6 py-3 rounded-game',
              'font-heading text-game-sm uppercase tracking-wider',
              'border border-game-border text-game-text-secondary',
              'hover:border-game-border-gold hover:text-game-text hover:bg-game-gold/5',
              'transition-all duration-200',
            )}
          >
            צפה בדירוגים →
          </Link>
        </div>
      </div>

    </div>
  )
}
