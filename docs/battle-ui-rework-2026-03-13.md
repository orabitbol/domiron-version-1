# Battle UI Rework — 2026-03-13

## Summary

Full redesign of the battle report modal and the pre-attack dialog. No combat formulas were changed.
Focus: cinematic feel, emotional clarity, explicit power math, and immersive game identity.

---

## Part 1 — Battle Report Redesign

### Old layout (7 sections, flat)
1. Outcome banner (text + ratio badge)
2. Power comparison 2-col (ECP + PP + clan note)
3. Cost | Gains 2-col (turns/food left, resources gained)
4. Casualties 2-col (your soldiers / enemy soldiers)
5. Modifiers list (if any)
6. Close button

**Problems**: casualties were buried below power and cost. Captives were a footnote inside the gains panel. Power breakdown was opaque ("PP 19,634 / Clan +1,051" — no explanation of the gap to Final ECP). No visual hierarchy distinguishing the most important information.

### New layout (8 sections, cinematic)

**Section 1 — Outcome Banner**
- Full-width gradient panel: amber/gold for WIN, deep red for LOSS
- Decorative top-edge glow line (amber or red)
- `Trophy` icon flanking "VICTORY", `Skull` icon flanking "DEFEAT"
- Army name vs army name subtitle
- Power ratio badge below

**Section 2 — Casualties** ← *first data section, most prominent*
- 2-col grid with large `font-display text-game-3xl` numbers
- Left card: Your Losses — red background tint when > 0, muted when 0
- Right card: Enemy Casualties — green background tint when > 0, muted when 0
- Both show "− N soldiers" with color coding (red / green / muted)
- Visual weight makes this the heart of the report

**Section 3 — Captives** ← *separate section, only shown when > 0*
- Full-width amber/bronze panel
- `Link2` chain icon
- Shows count with `font-display text-game-2xl` amber number
- Labeled "Captives Enslaved" + "Slaves" subtitle
- Previously: a small footnote inside the gains card

**Section 4 — Spoils of War** ← *only shown when hasLoot*
- Gold/amber accented panel with `Trophy` icon
- Non-zero resources shown in 2-col grid with color-coded values
- Anti-farm decay warning inline when active (×0.70 etc)
- When attacker won but gained nothing: shows clean "Nothing gained" panel

**Section 5 — Power Breakdown** ← *now explains the full equation*
- 2-col grid: Your Attack | Enemy Defense
- Each side uses the new `PowerSide` component (see below)
- Moved below casualties/spoils — context, not the headline

**Section 6 — Cost Paid**
- Compact single-row: "5 Turns · 12,000 Food"

**Section 7 — Modifiers**
- Unchanged behavior, now has `Info` icon header
- Only rendered when `report.reasons.length > 0`

**Section 8 — Close button**

---

## Part 2 — Power Breakdown: Now Fully Explicit

### Old behavior
The report showed:
```
Your Attack
Final ECP: 22,648
PP: 19,634
+1,051 Clan
×Tribe
```
The gap between PP (19,634), the clan line, and Final ECP (22,648) was unexplained.
"×Tribe" was a label with no number. Hero bonus and race bonus were invisible.

### New `PowerSide` component

Shows the complete equation step by step:

```
Base Power        19,634
Hero  +15%        ×1.15       ← purple, only shown if heroBonus > 0
Race  +10%        ×1.10       ← cyan, only shown if raceBonus > 0
Clan Bonus        +1,051      ← blue, only shown if clanBonus > 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Base ECP          25,123      ← shown as "Final ECP" if no tribe multiplier
Tribe Spell ×1.25 ×1.25       ← amber, only shown if tribeMult > 1.001
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Final ECP         31,403      ← gold-highlighted for the winning side
```

Each source is shown only when it is non-zero:
- **Hero bonus**: purple — temporary, from active hero effects
- **Race bonus**: cyan — permanent, from chosen race (orc +10% attack, dwarf +15% defense, etc.)
- **Clan bonus**: blue — additive, from tribe total power × efficiency rate, capped at 20% of your PP
- **Tribe spell**: amber — multiplicative, applied last (war_cry ×1.25, tribe_shield ×1.15)

If a player has no bonuses at all: only "Base Power" and "Final ECP" are shown (they are the same number).

### Exact formula displayed (player-facing)

```
Final ECP = floor(
  floor(
    (Base PP × (1 + Hero%) × (1 + Race%)) + Clan Bonus
  ) × Tribe Multiplier
)
```

This matches the engine exactly (`calculateECP` + tribe multiplier in `resolveCombat`).
The displayed `Base ECP` is always `report.attacker.base_ecp_attack` (direct from engine).
The displayed `Final ECP` is always `report.attacker.ecp_attack` (direct from engine).
No approximations or reconstructions — both values come straight from the combat resolver.

---

## Part 3 — Pre-Attack Dialog Redesign

### Old design
- Simple target panel: name + rank + soldiers
- Arrow buttons (◀ ▶) + range slider for turns
- Small cost card
- Bullet-point win/loss lists
- Minimal visual identity

### New design

**Target identity panel**
- Army name in `font-display text-game-xl` — much larger
- Rank badge: amber pill `#N` (only when rank is set)
- Tribe name inline when present
- Soldier count with `Shield` icon
- Shield/protection status badges shown inline when active:
  - Gold: Resource Shield Active
  - Blue: Soldier Shield Active
  - Green: New Player Protection
  - Orange: Kill Cooldown

**Tab selector** — redesigned
- Attack tab: crimson gradient background when active + `Sword` icon
- Spy tab: purple gradient background when active + `Eye` icon
- More visual contrast between active and inactive tabs

**Turn selector** — replaced (Phase 3 revision)
- Phase 2 had a 5×2 `TurnChip` grid (1–10) — reverted because it was visually heavy and worse on mobile
- Phase 3 final: single `[−] N turns [+]` stepper inline with cost below, all in one card
- Compact `StepBtn` component (gold variant for attack, purple for spy) — 40×40 touch target
- Inline cost shows food per turn: `Food Cost (500 per turn)`

**Cost card**
- Now shows "food per turn" in parentheses next to the total cost
- Example: "Food Cost (500 per turn) → 1,500 total"
- Easier to understand the scaling

**Risk / Reward blocks**
- Now have icons: `CheckCircle` for Victory, `Skull` for Defeat
- Same content as before but more visual weight

**Validation errors**
- Now include `AlertCircle` icon for visual urgency

**Spy tab**
- `+` / `−` buttons replace chevron icons (more readable at small sizes)
- Same logic, same validation

---

## Part 4 — New Backend Fields Added

Six new fields were added to the `BattleReport` type to support the power breakdown display:

| Field | Source in route | Purpose |
|---|---|---|
| `attacker.hero_bonus_attack` | `clampBonus(attHero.totalAttackBonus)` | Hero multiplier applied (0–0.50) |
| `attacker.race_bonus_attack` | `getAttackerRaceBonus(attPlayer.race)` | Race attack bonus |
| `attacker.tribe_mult_attack` | `attTribeCombatMult` | Tribe spell multiplier (1.0 = none) |
| `defender.hero_bonus_defense` | `clampBonus(defHero.totalDefenseBonus)` | Hero defense multiplier |
| `defender.race_bonus_defense` | `getDefenderRaceBonus(defPlayer.race)` | Race defense bonus |
| `defender.tribe_mult_defense` | `defTribeCombatMult` | Tribe spell multiplier for defender |

All six values were already computed in `app/api/attack/route.ts` — they were just not included in the response. No new computation, no DB queries, no performance impact.

The `DialogTarget` interface in `AttackDialog.tsx` was extended with:
- `gold` — for potential future display
- `resource_shield_active`, `soldier_shield_active`, `is_protected`, `kill_cooldown_active` — used to show status badges in the dialog

These are already present in the `Target` type in `AttackClient.tsx` and are already passed when `setDialogTarget(target)` is called. No API changes needed for this.

---

## Part 5 — i18n Keys Added

### `messages/en.json` — `attack` section
```
casualties, captives_enslaved, spoils_of_war, power_breakdown,
base_pp, hero_bonus_label, race_bonus_label, tribe_spell_label,
final_ecp, base_ecp_label, cost_paid, none_gained
```

### `messages/en.json` — `dialog` section
```
battle_duration, food_per_turn, total_cost
```

### `messages/he.json` — same keys in Hebrew
All keys added with correct RTL-compatible Hebrew translations.

---

## Part 6 — Formulas Not Broken

**No combat constants changed in this pass.**

The engine files touched:
- `lib/game/combat.ts` — NOT modified
- `config/balance.config.ts` — NOT modified
- `app/api/attack/route.ts` — only added 6 fields to the `battleReport` object; all combat computation unchanged

**Test `lib/game/mutation-patterns.test.ts`** had a hardcoded `BattleReport` fixture that needed the 3 new attacker fields and 3 new defender fields added (all set to zero/1 defaults matching "no bonuses" state). This is a struct update, not a logic change.

---

## Phase 3 — Battle Report Hierarchy & Visual Redesign

### Section order changed (Phase 3)

The section order was restructured so the player understands **why** the outcome happened before seeing **what** it was:

1. **Power Breakdown** ← first: explains the fight before the verdict
2. **Outcome Banner** ← second: victory/defeat with full context
3. **Spoils of War** ← resource gains as flex-wrap chips
4. **Captives** ← dramatic full-width amber panel
5. **Casualties** ← unified split-panel card
6. **Cost + Modifiers** ← compact merged footer

### Aggressive visual redesign

**Spoils of War — resource chips**
- Each non-zero resource gets its own `flex-1 min-w-[68px]` chip with colored border + bg
- Large `text-game-xl` `+N` number centered in each chip with resource-specific color
- Resource label below in `text-game-xs text-game-text-muted`
- Feels like a reward screen, not a data table

**Captives — dramatic amber panel**
- `border-2 border-amber-700/50` with `bg-gradient-to-br from-amber-950/50`
- Top glow line: `h-0.5 bg-gradient-to-r via-amber-500/70`
- Centered layout: `Link2` icon flanking the label, large `text-game-4xl` number below
- Only rendered when `captives > 0`

**Casualties — unified split card**
- Single `rounded-game-lg border` card, `grid grid-cols-2`
- `border-e border-game-border/50` Tailwind logical divider (RTL-safe)
- Left half: `bg-red-950/20` when losses > 0 (your soldiers)
- Right half: `bg-green-950/20` when losses > 0 (enemy soldiers)
- `font-display text-game-3xl` numbers — clear zero display instead of `−0`

**Cost + Modifiers — merged footer**
- Single card with `divide-y` between cost row and modifiers list
- Reduces visual clutter at bottom of report

### Pre-attack dialog — turn selector revision

- Phase 2 `TurnChip` 5×2 grid reverted (too heavy, worse on mobile)
- New: single `StepBtn` component with `[−] N turns [+]` inline stepper + glide slider (see Phase 4)
- All cost info in one card below the stepper
- Modal title: `t('attack.title')` for attack tab, `t('dialog.tab_spy')` for spy tab (no longer says "פעולה")

---

## Phase 4 — Food Loot Fix + Glide Slider (2026-03-14)

### Fix 1 — Food loot always shown

**Root cause**: The `lootChips` array used `t(\`resources.${key}\`)` — a dynamic template literal key.
In next-intl's strict TypeScript mode the dynamic key resolves correctly at runtime, but to eliminate
any runtime ambiguity and ensure type safety, the labels are now pre-computed in a static map:

```typescript
const lootLabels = {
  gold: t('resources.gold'),
  iron: t('resources.iron'),
  wood: t('resources.wood'),
  food: t('resources.food'),   // ← explicit — no dynamic key
}
```

Each chip renders `lootLabels[key]` — fully typed, no template literal inference.
`food` was already present in `lootChips` and `hasLoot`; the map ensures it renders correctly
whenever `report.gained.loot.food > 0`.

### Fix 2 — Glide slider for turn selection

Added a native `<input type="range">` between the stepper row and the cost section:

- **min**: 1 — **max**: `min(MAX_TURNS, playerTurns)` — value bound to `turns` state
- `onChange` calls `clampTurns()` — same path as the `+`/`−` buttons, no new state
- Styled with Tailwind arbitrary variants (`[&::-webkit-slider-thumb]`, `[&::-moz-range-thumb]`)
  - Thumb: 16×16 amber circle with `box-shadow: 0 0 6px rgba(251,191,36,0.5)` glow
  - Track fill: inline `style` background gradient (amber-900/60 → transparent) — updates live
  - Min/max labels: tiny muted numbers below the slider
- Zero-division guard: `pct = maxSlider <= 1 ? 100 : ((turns - 1) / (maxSlider - 1)) * 100`
- Buttons remain primary UX; slider is a secondary drag enhancement — feels premium, not noisy
- Fully mobile-friendly (native touch drag on iOS/Android)

---

## Phase 5 — Correction Pass: Compact Modal + Food Fix + No Ratio Badge (2026-03-14)

This pass corrected specific issues from prior redesign attempts.

### What was wrong

- Modal too tall — required scrolling on most screens
- Ratio badge (`יחס כוח ×15.03`) was still in the hero/outcome banner — not wanted there
- Section order was still wrong (Power before Outcome)
- Loot/captives/casualties still felt too "stat-card" / report-like
- Food loot still not rendering (root cause traced and fixed definitively)
- Captives section too tall (full-width dramatic panel adding unnecessary height)

### Food loot — definitive fix

Previous approach used a label map which was correct, but the issue persisted because:
- `loot.food` access is now guarded with `?? 0` — protects against `undefined`/`null`
- Filter: `lootItems.filter(x => x.amount > 0)` — food appears whenever `loot.food > 0`
- `hasLoot` replaced by `lootItems.length > 0` — derived from the same filtered array, single source of truth
- All 4 resources use static `t('resources.gold')` etc. calls — no dynamic keys

```typescript
const lootItems = [
  { key: 'gold', label: t('resources.gold'), amount: loot.gold ?? 0, cls: 'text-res-gold' },
  { key: 'iron', label: t('resources.iron'), amount: loot.iron ?? 0, cls: 'text-res-iron' },
  { key: 'wood', label: t('resources.wood'), amount: loot.wood ?? 0, cls: 'text-res-wood' },
  { key: 'food', label: t('resources.food'), amount: loot.food ?? 0, cls: 'text-res-food' },
].filter(x => x.amount > 0)
```

### Section order (corrected)

1. **Outcome hero** — VICTORY/DEFEAT banner, army names, NO ratio badge
2. **Power breakdown** — compact 2-col grid, calmer visual weight
3. **Spoils of War** — all 4 resources inline, rewarding feel
4. **Captives** — compact horizontal row (not tall centered panel)
5. **Casualties** — unified split card, tighter padding
6. **Footer** — cost + modifiers merged

### Ratio badge removed

Removed from the hero outcome section entirely. The `יחס כוח ×N.NN` badge was deleted.
Power ratio context belongs in the power breakdown section, not the emotional victory/defeat banner.

### Modal compaction

| Element | Before | After |
|---|---|---|
| Outer spacing | `space-y-3` | `space-y-2` |
| Hero padding | `py-5` | `py-3.5` |
| Casualties padding | `py-4` | `py-2.5` |
| Captives | Full-width centered tall panel | Compact horizontal `flex items-center` row |
| PowerSide | `p-3 space-y-1.5` | `p-2 space-y-0.5` (compact mode) |
| Footer rows | `py-2.5` | `py-2` |

### Redesign details

**Spoils of War**: Inline horizontal items — `+N Label` pairs with resource colors. Compact amber strip with top glow line. All 4 resources explicit.

**Captives**: Single-row `flex items-center` with `Link2` icon + label on left, large `text-game-2xl` number on right. Top accent line. Compact but visually distinct.

**Casualties**: Same 2-col split card but `py-2.5` instead of `py-4`. Numbers at `text-game-2xl` (was `text-game-3xl`). Section label icons: `Shield` for your losses, `Skull` for enemy losses.

**Power**: Added `compact` prop to `PowerSide`. All rows use `text-game-xs` for both label and value (was `text-game-xs`/`text-game-sm`). Padding `p-2`, gap `space-y-0.5`. Still shows full breakdown: PP → hero → race → clan → Base ECP → tribe → Final ECP. Formulas unchanged.

### No combat logic changed

- Zero formula changes
- Zero combat constant changes
- Zero backend changes

---

## Part 7 — Verification

| Check | Result |
|---|---|
| TypeScript (`npx tsc --noEmit`) | ✅ Clean — 0 errors |
| Tests (`npx vitest run`) | ✅ 170/170 passed (combat.test + attack-integrity.test + mutation-patterns.test) |
| Build (`npx next build`) | ✅ Compiled successfully |

---

## Files Changed

| File | Change |
|---|---|
| `types/game.ts` | +6 fields on `BattleReport.attacker` and `BattleReport.defender` |
| `app/api/attack/route.ts` | Populate 6 new BattleReport fields |
| `app/(game)/attack/AttackClient.tsx` | New lucide imports + `PowerSide` sub-component + `BattleReportModal` full rewrite (Phase 2 + 3) |
| `components/game/AttackDialog.tsx` | Full redesign — compact turn stepper, correct modal title, `StepBtn` component |
| `messages/en.json` | +15 new i18n keys |
| `messages/he.json` | +15 new i18n keys (Hebrew) |
| `lib/game/mutation-patterns.test.ts` | Updated `BattleReport` fixture to include new fields (zero values) |
