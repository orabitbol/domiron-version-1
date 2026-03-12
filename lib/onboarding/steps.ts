/**
 * lib/onboarding/steps.ts
 *
 * Central definition of every step in the first-time player tour.
 * Each step has a target route (or null = stay on current page) plus
 * the copy shown in the floating tour panel.
 *
 * Changing step order here is the ONLY thing needed to reorder the tour.
 */

export interface OnboardingStep {
  /** Unique identifier — used as React key and for logging. */
  id:    string
  /**
   * Route the player is navigated to when this step becomes active.
   * null = stay on whatever page they are currently on.
   */
  route: string | null
  /** Panel heading — short, uppercase, game-voice. */
  title: string
  /** Panel body — 2-3 sentences max, practical and specific. */
  body:  string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id:    'welcome',
    route: null,
    title: 'ברוך הבא לדומירון',
    body:  'אתה מפקד על צבא גדל בתחרות עונה בת 90 יום. המטרה: הגע לראש הדירוגים כשהעונה תסתיים. הסיור הקצר הזה ידריך אותך בחלקים המרכזיים של המשחק — דלג בכל עת.',
  },
  {
    id:    'base',
    route: '/base',
    title: 'מרכז הפיקוד שלך',
    body:  'הבסיס הוא המטה שלך. בדוק את גודל הצבא, האוכלוסייה הזמינה, דירוג הכוח ואפקטים פעילים בזריזות. כל מה שצריך להעריך את מצבך נמצא כאן.',
  },
  {
    id:    'mine',
    route: '/mine',
    title: 'מכרות ומשאבים',
    body:  'הקצה עבדים למכרות כדי לייצר זהב, ברזל, עץ ומזון בכל טיק (כל 30 דקות). משאבים מממנים את כל פעולות המשחק — אימון יחידות, שדרוג מבנים וציוד הכוחות. כרה מוקדם, כרה לעתים קרובות.',
  },
  {
    id:    'develop',
    route: '/develop',
    title: 'פיתוח עיר',
    body:  'שדרג את תשתית העיר שלך כדי לגביר תפוקת משאבים ולגדל את האוכלוסייה. כל רמה מכפילה את הייצור. עיר ברמה גבוהה פותחת צבאות גדולים ובונוסים גדולים יותר.',
  },
  {
    id:    'training',
    route: '/training',
    title: 'אמן את הכוחות שלך',
    body:  'הפוך אוכלוסייה חופשית לחיילים, פרשים, מרגלים, סיירים או עבדים. אמן עבדים תחילה להנעת המכרות, ואז בנה כוח לחימה. הרכב הצבא קובע כיצד תתקוף, תגן ותאסוף מידע.',
  },
  {
    id:    'attack',
    route: '/attack',
    title: 'תקוף וכבוש',
    body:  'תקוף שחקנים בעירך כדי לגנוב את זהבם ולטפס בדירוגים. כל תקיפה עולה תורות, שמתחדשים עם הזמן. נצח בקרבות על ידי עליונות בכוח הקרב — בחר מטרות בחוכמה.',
  },
  {
    id:    'bank',
    route: '/bank',
    title: 'האוצר',
    body:  'זהב לא מוגן יכול להיגנב בפשיטות. הפקד זהב בבנק שלך כדי לשמור עליו בטוח ולהרוויח ריבית פסיבית בכל טיק. שדרג את רמת הריבית לתשואות גבוהות יותר. תמיד הפקד זהב לפני התנתקות.',
  },
  {
    id:    'tribe',
    route: '/tribe',
    title: 'הצטרף לשבט',
    body:  'התחבר עם שחקנים אחרים בשבט. תרום מאנה מהגיבור שלך, השלך כישופי קבוצה עוצמתיים, וטפס בדירוגי העיר יחד. שבט חזק מספק הגנה ותיאום שמשחק בודד אינו יכול.',
  },
  {
    id:    'rankings',
    route: '/rankings',
    title: 'לוח הדירוגים',
    body:  'הדירוגים עוקבים אחר כל שחקן לפי כוח קרב כולל — מתעדכן בכל טיק. צפה בדירוגך עולה עם גדילת הצבא. בסוף העונה, המפקדים המובילים זוכים בתהילה נצחית.',
  },
  {
    id:    'finish',
    route: null,
    title: 'מוכן לפיקוד',
    body:  'זהו הסיור. התחל לכרות, אמן את הכוחות שלך, הצטרף לשבט ותבע את מקומך בראש. תוכל לשחזר את הסיור הזה או לקרוא את מדריך המשחק המלא בדף המדריך — נגיש בכל עת מסרגל הצד.',
  },
]
