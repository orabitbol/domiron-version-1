'use client'

/**
 * /guide — Permanent Game Reference
 *
 * A structured, always-accessible guide to Domiron's mechanics.
 * Complements the first-time tour (OnboardingTour) — this page is for
 * players who want to look up specifics after finishing the walkthrough.
 *
 * Includes a "Replay Tour" button that re-opens the interactive tour via
 * OnboardingContext.
 */

import React, { useState } from 'react'
import { useOnboarding } from '@/components/onboarding/OnboardingProvider'

// ── Section helpers ───────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="flex items-center gap-3 mb-3">
        <h2
          className="font-heading uppercase tracking-wider"
          style={{ fontSize: 15, color: 'rgba(240,192,48,0.95)' }}
        >
          {title}
        </h2>
        <div
          className="flex-1"
          style={{ height: 1, background: 'linear-gradient(to right, rgba(201,144,26,0.4), transparent)' }}
        />
      </div>
      <div className="space-y-2 text-sm" style={{ color: 'rgba(220,200,160,0.85)', lineHeight: '1.65' }}>
        {children}
      </div>
    </section>
  )
}

function Dl({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-y-1.5">
      {rows.map(([term, def]) => (
        <div key={term} className="grid grid-cols-[140px_1fr] gap-x-3 items-start">
          <dt
            className="font-heading uppercase tracking-wide shrink-0"
            style={{ fontSize: 11, color: 'rgba(201,144,26,0.7)', paddingTop: 2 }}
          >
            {term}
          </dt>
          <dd style={{ color: 'rgba(220,200,160,0.85)' }}>{def}</dd>
        </div>
      ))}
    </dl>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
      style={{ background: 'rgba(201,144,26,0.06)', border: '1px solid rgba(201,144,26,0.18)' }}
    >
      <span style={{ color: 'rgba(240,192,48,0.7)', marginTop: 1, flexShrink: 0 }}>⚑</span>
      <span style={{ color: 'rgba(220,200,160,0.85)', fontSize: 13 }}>{children}</span>
    </div>
  )
}

// ── TOC ───────────────────────────────────────────────────────────────────────

const TOC_ITEMS = [
  { id: 'overview',    label: 'Game Overview'       },
  { id: 'resources',   label: 'Resources'           },
  { id: 'army',        label: 'Army Units'          },
  { id: 'combat',      label: 'Combat'              },
  { id: 'develop',     label: 'City Development'    },
  { id: 'hero',        label: 'Hero System'         },
  { id: 'bank',        label: 'Bank'                },
  { id: 'tribe',       label: 'Tribe System'        },
  { id: 'rankings',    label: 'Rankings'            },
  { id: 'tips',        label: 'Tips for New Players'},
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuidePage() {
  const { restart } = useOnboarding()
  const [tourStarted, setTourStarted] = useState(false)

  function handleRestartTour() {
    setTourStarted(true)
    restart()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8" dir="ltr">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="font-heading uppercase tracking-widest"
            style={{ fontSize: 22, color: 'rgba(240,192,48,0.95)' }}
          >
            Game Guide
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(180,160,120,0.7)' }}>
            Complete reference for Domiron mechanics. Use the Tour for an interactive walkthrough.
          </p>
        </div>
        <button
          onClick={handleRestartTour}
          disabled={tourStarted}
          className="shrink-0 px-4 py-2 rounded-lg text-xs font-heading uppercase tracking-wider transition-all"
          style={{
            background:    'rgba(201,144,26,0.12)',
            border:        '1px solid rgba(201,144,26,0.35)',
            color:         tourStarted ? 'rgba(201,144,26,0.4)' : 'rgba(240,192,48,0.85)',
            cursor:        tourStarted ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (!tourStarted) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,144,26,0.2)' }}
          onMouseLeave={e => { if (!tourStarted) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,144,26,0.12)' }}
        >
          {tourStarted ? 'Tour started ↗' : '↺ Replay Tour'}
        </button>
      </div>

      {/* Table of contents */}
      <nav
        className="p-4 rounded-xl"
        style={{ background: 'rgba(26,21,16,0.8)', border: '1px solid rgba(201,144,26,0.2)' }}
      >
        <p
          className="text-xs font-heading uppercase tracking-widest mb-3"
          style={{ color: 'rgba(201,144,26,0.55)' }}
        >
          Contents
        </p>
        <ol className="grid grid-cols-2 gap-x-6 gap-y-1">
          {TOC_ITEMS.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-sm transition-colors"
                style={{ color: 'rgba(201,144,26,0.65)' }}
                onMouseEnter={e => ((e.target as HTMLElement).style.color = 'rgba(240,192,48,0.95)')}
                onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(201,144,26,0.65)')}
              >
                {i + 1}. {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── Sections ────────────────────────────────────────────────────── */}

      <Section id="overview" title="Game Overview">
        <p>
          Domiron is a browser-based strategy game played in 90-day <strong style={{ color: 'rgba(240,192,48,0.85)' }}>seasons</strong>.
          During a season, thousands of players build armies, raid each other, and compete for the top rankings.
          At season end, the highest-ranked players claim permanent recognition in the Hall of Fame.
        </p>
        <Dl rows={[
          ['Season length', '90 days'],
          ['Tick interval', 'Every 30 minutes — resources produced, turns refilled, interest paid, rankings updated'],
          ['Turns', 'Consumed by attacks and certain actions. Refill each tick up to the cap.'],
          ['Cities', '5 cities. You are placed in one city at registration and compete within it for city rank.'],
          ['Power',  'Your combat power (soldiers + cavalry + training + weapons) determines your global and city rank.'],
        ]} />
      </Section>

      <Section id="resources" title="Resources">
        <p>
          Four resources power the game: <strong style={{ color: 'rgba(240,192,48,0.85)' }}>Gold, Iron, Wood,</strong> and <strong style={{ color: 'rgba(240,192,48,0.85)' }}>Food</strong>.
          They are produced each tick by slaves assigned to your mines and consumed by training, development upgrades, and shop purchases.
        </p>
        <Dl rows={[
          ['Gold',       'Primary currency. Used to train all units and buy from the shop. Can be deposited in the bank for protection.'],
          ['Iron',       'Used to train cavalry and buy equipment from the shop.'],
          ['Wood',       'Used for certain development upgrades and shop items.'],
          ['Food',       'Consumed each tick for upkeep. Attacks also cost food.'],
          ['Production', 'Amount per tick = (slaves assigned to that resource × per-slave rate × development level multiplier).'],
          ['Protection', 'Resources in your stockpile can be raided. Deposit gold in the bank to protect it.'],
        ]} />
        <Tip>Assign slaves to mines as soon as possible. Even 10 slaves produce meaningful income over a full day of ticks.</Tip>
      </Section>

      <Section id="army" title="Army Units">
        <p>
          Population is the root resource for your army. Every unit trained reduces your
          <strong style={{ color: 'rgba(240,192,48,0.85)' }}> free population</strong>.
          Grow population through city development upgrades.
        </p>
        <Dl rows={[
          ['Soldiers',        'Core attack and defense unit. Costs 1 free population + gold to train.'],
          ['Cavalry',         'High-impact attack unit. Costs 5 free population + gold + iron. More power per unit than soldiers.'],
          ['Spies',           'Used to gather intel on other players. Higher spy count = better missions.'],
          ['Scouts',          'Reveal enemy army composition before attacking. Reduces battle uncertainty.'],
          ['Slaves',          'Assigned to mines to produce resources each tick. The only way to create slaves is to train them (1 free population, 0 gold). Slaves are never created from combat.'],
          ['Free Population', 'Untrained population. Acts as a reserve — train it into any unit type.'],
        ]} />
        <Tip>Train Slaves first to ramp up resource production. Then shift free population into combat units as your income grows.</Tip>
      </Section>

      <Section id="combat" title="Combat">
        <p>
          Attacks happen within your <strong style={{ color: 'rgba(240,192,48,0.85)' }}>city</strong> — you can only attack players in the same city.
          Combat is resolved instantly based on power ratings.
        </p>
        <Dl rows={[
          ['Attack cost',      'Turns (consumed on attack). Also costs food for upkeep.'],
          ['Attacker wins if', 'Your ECP (Effective Combat Power) exceeds the defender\'s ECP.'],
          ['ECP formula',      '(Unit Power × hero bonus × race bonus) + clan bonus, then multiplied by active tribe spells.'],
          ['Loot on win',      'A percentage of the defender\'s unbanked gold, iron, wood, and food.'],
          ['Shields',          'Defenders can have a Resource Shield (blocks loot) or Soldier Shield (blocks unit losses).'],
          ['Kill cooldown',    'If you recently killed a defender\'s units, their losses are blocked for 6 hours (anti-stack protection).'],
          ['New player guard', 'Players within 24h of joining cannot be attacked or looted.'],
        ]} />
        <Tip>Use Scouts before attacking to see your target&apos;s army. Attack players whose defense power is lower than your attack power for safe victories.</Tip>
      </Section>

      <Section id="develop" title="City Development">
        <p>
          Development upgrades are permanent and compound. Each level multiplies resource output and population growth.
          Higher city tiers (promoted by meeting power + resource thresholds) unlock bigger armies.
        </p>
        <Dl rows={[
          ['Gold / Iron / Wood / Food',  'Upgrading each increases the per-slave production rate for that resource.'],
          ['Population',  'Increases free population gained per tick. More population = larger armies.'],
          ['Fortification', 'Adds a passive defense bonus to your city, reducing incoming attack damage.'],
        ]} />
      </Section>

      <Section id="hero" title="Hero System">
        <p>
          Every player has a personal hero that gains XP from battles and ticks.
          Higher hero levels unlock spell points to spend on permanent combat bonuses.
        </p>
        <Dl rows={[
          ['XP',            'Gained from attacks (win or loss) and passively each tick.'],
          ['Spell points',  'Awarded at level-up milestones. Spend them on spells that permanently boost combat stats.'],
          ['Mana',          'Regenerated each tick (mana_per_tick). Used to activate temporary shield abilities and to contribute to your tribe.'],
          ['Shields',       'Hero abilities like Resource Shield and Soldier Shield cost mana and last for a set duration.'],
        ]} />
        <Tip>Level your hero — even early spell bonuses (5–10%) compound significantly at scale.</Tip>
      </Section>

      <Section id="bank" title="Bank">
        <p>
          Unprotected gold can be looted in attacks. The bank protects your savings and grows them passively.
        </p>
        <Dl rows={[
          ['Deposit',         'Move gold from your stockpile into the bank. Banked gold is not lootable.'],
          ['Interest',        'Banked gold earns interest each tick. Rate depends on your interest level.'],
          ['Interest upgrade','Spend gold to permanently increase your interest rate (up to level cap).'],
          ['Daily limit',     'Deposits are capped per day to prevent abuse. The limit resets at midnight.'],
        ]} />
        <Tip>Bank your gold before logging off for the night — even a single unprotected raid can wipe hours of income.</Tip>
      </Section>

      <Section id="tribe" title="Tribe System">
        <p>
          Tribes let players cooperate for shared bonuses and collective power. Each city can have multiple tribes.
        </p>
        <Dl rows={[
          ['Joining',     'Search for an existing tribe or create your own (costs gold).'],
          ['Roles',       'Leader (1), Deputy (up to 3), Member. Leaders and Deputies can manage the tribe.'],
          ['Mana',        'Members contribute hero mana to the tribe treasury. Tribe mana funds group spells.'],
          ['Spells',      'Tribe spells (War Cry, Tribe Shield, Production Blessing, etc.) apply city-wide buffs to all members.'],
          ['Tax',         'The tribe collects a gold tax from members daily (automated). Gold goes to the leader.'],
          ['Level',       'Tribe level (1–5) is upgraded by spending tribe mana. Higher levels grant stronger spell effects.'],
        ]} />
        <Tip>A high-level tribe with active spell casting provides a substantial combat advantage that solo players cannot replicate.</Tip>
      </Section>

      <Section id="rankings" title="Rankings">
        <p>
          Rankings update every tick based on total combat power. Two separate leaderboards exist simultaneously.
        </p>
        <Dl rows={[
          ['City rank',   'Your rank among all players in your city. Used for tribe competition and local dominance.'],
          ['Global rank', 'Your rank across all players in the entire season. The ultimate measure of progress.'],
          ['Power total', 'Sum of attack, defense, spy, and scout power. Determined by units, training levels, and weapons.'],
          ['Season end',  'Rankings at season end determine Hall of Fame placement for that season.'],
        ]} />
      </Section>

      <Section id="tips" title="Tips for New Players">
        <div className="space-y-2">
          <Tip>Train Slaves first. They are the engine of your economy. Without resource income, everything else stalls.</Tip>
          <Tip>Upgrade your mines and population development before training combat units. Infrastructure compounds; raw unit counts do not.</Tip>
          <Tip>Join a tribe as soon as you can. Tribe spells apply to all members — you benefit from others&apos; mana contributions.</Tip>
          <Tip>Bank gold before logging off. Even small deposits every session protect income from overnight raids.</Tip>
          <Tip>Scout before attacking. Attacking a defender with much higher defense power will cost you soldiers with no gain.</Tip>
          <Tip>Watch the kill cooldown. After killing a defender&apos;s units, their losses are blocked for 6 hours. Spread your attacks across multiple targets.</Tip>
          <Tip>Upgrade your hero. Early spell bonuses (attack/defense %) stack with everything else and are permanent.</Tip>
        </div>
      </Section>

    </div>
  )
}
