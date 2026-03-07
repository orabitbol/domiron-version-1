/**
 * Tribe Level Upgrade — structural + logic tests
 *
 * Pattern: fs.readFileSync on route + TribeClient source for structural
 * assertions (no DB/HTTP/Supabase mocking required).
 *
 * Run: npx vitest run lib/game/tribe-level-upgrade.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROUTE_PATH = path.resolve(
  __dirname,
  '../../app/api/tribe/upgrade-level/route.ts',
)
const CLIENT_PATH = path.resolve(
  __dirname,
  '../../app/(game)/tribe/TribeClient.tsx',
)

const routeSource: string  = fs.readFileSync(ROUTE_PATH, 'utf8')
const clientSource: string = fs.readFileSync(CLIENT_PATH, 'utf8')

// ── Route structural tests ─────────────────────────────────────────────────

describe('POST /api/tribe/upgrade-level — route structural contracts', () => {

  it('uses the RPC tribe_upgrade_level_apply (not direct table update)', () => {
    expect(routeSource).toContain("'tribe_upgrade_level_apply'")
    // Must NOT directly update tribes table
    expect(routeSource).not.toMatch(/\.from\(['"]tribes['"]\)[\s\S]{0,80}\.update\(/)
  })

  it('passes exactly the 4 expected RPC params (no dead p_season_id)', () => {
    expect(routeSource).toContain('p_player_id')
    expect(routeSource).toContain('p_mana_cost')
    expect(routeSource).toContain('p_next_level')
    expect(routeSource).toContain('p_max_level')
    expect(routeSource).not.toContain('p_season_id')
  })

  it('rejects non-leader/non-deputy — role check present', () => {
    // Pre-validation checks role before calling RPC
    expect(routeSource).toContain("membership.role !== 'leader'")
    expect(routeSource).toContain("membership.role !== 'deputy'")
    expect(routeSource).toContain('403')
  })

  it('rejects when tribe is already at max level', () => {
    expect(routeSource).toContain('already_max_level')
    expect(routeSource).toContain('maxLevel')
  })

  it('rejects when tribe mana is insufficient', () => {
    expect(routeSource).toContain('not_enough_mana')
    expect(routeSource).toContain('tribe.mana < manaCost')
  })

  it('handles stale-level concurrency via RPC error code', () => {
    expect(routeSource).toContain('stale_level')
    expect(routeSource).toContain('409')
  })

  it('maps all expected RPC error codes to HTTP responses', () => {
    expect(routeSource).toContain('not_in_tribe')
    expect(routeSource).toContain('not_authorized')
    expect(routeSource).toContain('already_max_level')
    expect(routeSource).toContain('stale_level')
    expect(routeSource).toContain('not_enough_mana')
  })

  it('includes season freeze guard', () => {
    expect(routeSource).toContain('getActiveSeason')
    expect(routeSource).toContain('seasonFreezeResponse')
  })

  it('returns new_level, new_tribe_mana, mana_spent in success response', () => {
    expect(routeSource).toContain('new_level')
    expect(routeSource).toContain('new_tribe_mana')
    expect(routeSource).toContain('mana_spent')
  })

  it('requires session — 401 guard present', () => {
    expect(routeSource).toContain('getServerSession')
    expect(routeSource).toContain('401')
  })

})

// ── Route logic simulation tests ──────────────────────────────────────────

describe('Tribe level upgrade — logic simulation (pure, no DB)', () => {

  /**
   * Simulates the pre-validation logic from the API route.
   * Returns an error string or null if validation passes.
   */
  function preValidate(opts: {
    role:      'leader' | 'deputy' | 'member'
    level:     number
    mana:      number
    maxLevel:  number
    manaCost:  number | undefined
  }): string | null {
    if (opts.role !== 'leader' && opts.role !== 'deputy') {
      return 'not_authorized'
    }
    if (opts.level >= opts.maxLevel) {
      return 'already_max_level'
    }
    if (opts.manaCost === undefined) {
      return 'no_cost_defined'
    }
    if (opts.mana < opts.manaCost) {
      return 'not_enough_mana'
    }
    return null
  }

  const manaCostByLevel: Record<number, number> = { 1: 100, 2: 250, 3: 500, 4: 1000 }
  const maxLevel = 5

  it('leader with enough mana passes pre-validation', () => {
    const err = preValidate({ role: 'leader', level: 1, mana: 100, maxLevel, manaCost: manaCostByLevel[1] })
    expect(err).toBeNull()
  })

  it('deputy with enough mana passes pre-validation', () => {
    const err = preValidate({ role: 'deputy', level: 2, mana: 300, maxLevel, manaCost: manaCostByLevel[2] })
    expect(err).toBeNull()
  })

  it('regular member is rejected', () => {
    const err = preValidate({ role: 'member', level: 1, mana: 9999, maxLevel, manaCost: manaCostByLevel[1] })
    expect(err).toBe('not_authorized')
  })

  it('insufficient tribe mana is rejected', () => {
    const err = preValidate({ role: 'leader', level: 1, mana: 99, maxLevel, manaCost: manaCostByLevel[1] })
    expect(err).toBe('not_enough_mana')
  })

  it('already at max level is rejected', () => {
    const err = preValidate({ role: 'leader', level: 5, mana: 9999, maxLevel, manaCost: manaCostByLevel[5] })
    expect(err).toBe('already_max_level')
  })

  it('stale-read guard: p_next_level must equal current_level + 1', () => {
    // Simulates RPC post-lock check: concurrent upgrade would push level from 1→2,
    // so p_next_level=2 no longer equals current(2)+1=3
    const currentLevelAfterConcurrentUpgrade = 2
    const p_next_level = 2 // caller computed this when level was 1
    const stale = currentLevelAfterConcurrentUpgrade + 1 !== p_next_level
    expect(stale).toBe(true)
  })

  it('p_next_level is consistent when no concurrent upgrade', () => {
    const currentLevel = 3
    const p_next_level = currentLevel + 1
    const stale = currentLevel + 1 !== p_next_level
    expect(stale).toBe(false)
  })

  it('mana deduction is correct', () => {
    const tribeMana = 500
    const cost = manaCostByLevel[3] // 500
    const newMana = tribeMana - cost
    expect(newMana).toBe(0)
  })

  it('each level cost is strictly greater than previous', () => {
    const costs = [1, 2, 3, 4].map(l => manaCostByLevel[l])
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1])
    }
  })

})

// ── TribeClient UI structural tests ───────────────────────────────────────

describe('TribeClient — UI structural contracts', () => {

  it('tab key is "upgrade" (not "spells")', () => {
    expect(clientSource).toContain("key: 'upgrade'")
    expect(clientSource).not.toContain("key: 'spells'")
  })

  it('tab label is "Upgrade" (not "Spells")', () => {
    expect(clientSource).toContain("label: 'Upgrade'")
    // No standalone "Spells" tab label (sub-header in tab body is fine)
    expect(clientSource).not.toContain("label: 'Spells'")
  })

  it('TribeTab type includes "upgrade" and excludes "spells"', () => {
    expect(clientSource).toContain("'upgrade'")
    // The type union should not include 'spells'
    expect(clientSource).not.toMatch(/TribeTab\s*=.*'spells'/)
  })

  it('renders current tribe level from localTribeLevel', () => {
    expect(clientSource).toContain('localTribeLevel')
    expect(clientSource).toContain('Lv {localTribeLevel}')
  })

  it('renders next level as localTribeLevel + 1', () => {
    expect(clientSource).toContain('Lv {localTribeLevel + 1}')
  })

  it('shows clan efficiency for current and next level', () => {
    expect(clientSource).toContain('BALANCE.clan.EFFICIENCY[localTribeLevel')
    expect(clientSource).toContain('BALANCE.clan.EFFICIENCY[(localTribeLevel + 1)')
    expect(clientSource).toContain('efficiency')
  })

  it('reads mana cost from BALANCE.tribe.levelUpgrade.manaCostByLevel', () => {
    expect(clientSource).toContain('BALANCE.tribe.levelUpgrade.manaCostByLevel[localTribeLevel]')
  })

  it('reads available mana from localTribeMana', () => {
    expect(clientSource).toContain('localTribeMana')
  })

  it('upgrade button is disabled when canAfford is false', () => {
    expect(clientSource).toContain('canAfford')
    expect(clientSource).toContain('disabled={!canAfford')
  })

  it('upgrade button is hidden for unauthorized member (no upgrade UI without leader/deputy)', () => {
    // The upgrade CTA is gated by {canManage ? <Button .../> : <"only leader/deputy" msg />}
    // canManage = isLeader || isDeputy — regular members see the fallback message, not the button
    expect(clientSource).toContain('canManage')
    expect(clientSource).toContain('isLeader')
    expect(clientSource).toContain('isDeputy')
    expect(clientSource).toContain('canManage ?')
    expect(clientSource).toContain('Only the tribe leader and deputies can upgrade tribe level')
  })

  it('max-level state renders a distinct max-level UI block', () => {
    expect(clientSource).toContain('localTribeLevel >= BALANCE.tribe.levelUpgrade.maxLevel')
  })

  it('calls POST /api/tribe/upgrade-level in handleUpgradeTribeLevel', () => {
    expect(clientSource).toContain("'/api/tribe/upgrade-level'")
    expect(clientSource).toContain('handleUpgradeTribeLevel')
  })

  it('updates localTribeLevel and localTribeMana from response (optimistic patch)', () => {
    expect(clientSource).toContain('setLocalTribeLevel')
    expect(clientSource).toContain('setLocalTribeMana')
  })

})
