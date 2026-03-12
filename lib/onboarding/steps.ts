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
    title: 'Welcome to Domiron',
    body:  'You are the commander of a growing army competing in a 90-day season. The goal: reach the top of the rankings when the season ends. This quick tour will walk you through the key parts of the game — skip any time.',
  },
  {
    id:    'base',
    route: '/base',
    title: 'Your Command Center',
    body:  'The Base is your headquarters. Check your army size, available population, power rating, and active status effects at a glance. Everything you need to assess your standing is here.',
  },
  {
    id:    'mine',
    route: '/mine',
    title: 'Mines & Resources',
    body:  'Assign slaves to mines to produce Gold, Iron, Wood, and Food every tick (every 30 minutes). Resources fund all game actions — training units, upgrading buildings, and equipping your forces. Mine early, mine often.',
  },
  {
    id:    'develop',
    route: '/develop',
    title: 'City Development',
    body:  'Upgrade your city\'s infrastructure to boost resource output and grow your population. Each level multiplies your production. A higher city tier unlocks larger armies and bigger bonuses.',
  },
  {
    id:    'training',
    route: '/training',
    title: 'Train Your Forces',
    body:  'Turn free population into Soldiers, Cavalry, Spies, Scouts, or Slaves. Train Slaves first to fuel your mines, then build a fighting force. Your army composition determines how you attack, defend, and gather intel.',
  },
  {
    id:    'attack',
    route: '/attack',
    title: 'Raid & Conquer',
    body:  'Attack players in your city to steal their gold and climb the rankings. Each attack costs turns, which refill over time. Win battles by outclassing your target in combat power — choose your targets wisely.',
  },
  {
    id:    'bank',
    route: '/bank',
    title: 'The Treasury',
    body:  'Unprotected gold can be stolen in raids. Deposit gold into your bank to keep it safe and earn passive interest every tick. Upgrade your interest level for higher returns. Always bank gold before logging off.',
  },
  {
    id:    'tribe',
    route: '/tribe',
    title: 'Join a Clan',
    body:  'Team up with other players in a tribe. Contribute mana from your hero, cast powerful group spells, and climb the city rankings together. A strong tribe provides protection and coordination that solo play cannot.',
  },
  {
    id:    'rankings',
    route: '/rankings',
    title: 'The Leaderboard',
    body:  'Rankings track every player by total combat power — updated each tick. Watch your position climb as your army grows. At season end, the top commanders claim permanent glory.',
  },
  {
    id:    'finish',
    route: null,
    title: 'Ready to Command',
    body:  'That\'s the tour. Start mining, train your forces, join a tribe, and claim your place at the top. You can replay this tour or read the full game reference in the Guide page — accessible any time from the sidebar.',
  },
]
