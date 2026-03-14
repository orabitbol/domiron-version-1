# Domiron Icon Integration — Visual Redesign Pass (2026-03-14)

Three-pass integration of all 13 game PNG assets from `/public/icons/`.

---

## New Shared Infrastructure

### `/lib/game-icons.ts`
Central registry: `GAME_ICONS`, `RESOURCE_ICONS`, `UNIT_ICONS`, `POWER_ICONS`, `GameIconKey`.

### `/components/ui/game-icon.tsx`
Reusable `<GameIcon icon="gold" size={18} />` backed by `next/image`.

---

## Files Modified

| File | Changes |
|---|---|
| `components/ui/resource-badge.tsx` | RESOURCE_ICON_SRC map; 14px img for gold/iron/wood/food |
| `components/ui/resource-quad.tsx` | Resource emoji → 12px img |
| `components/layout/Sidebar.tsx` | ResourceChip uses imgSrc 15px for resources |
| `components/game/ResourceBar.tsx` | Mobile strip gold → img |
| `components/game/AttackDialog.tsx` | Removed Sword/Eye/Shield lucide; power imgs 20px on all buttons |
| `app/(game)/base/BaseClient.tsx` | Resources → medallion tiles (40px circular containers, glow); army detail → icon circles per unit |
| `app/(game)/training/TrainingClient.tsx` | Army chips → vertical medallion cards (40px icon circles, value+label below) |
| `app/(game)/attack/AttackClient.tsx` | PowerSide crest header (30px circle, final ECP prominent); loot → 4-column medallion tiles (42px circles, per-resource glow) |
| `app/(game)/spy/SpyClient.tsx` | Weapon category labels use power imgs 11px |
| `app/(game)/history/HistoryClient.tsx` | RESOURCE_META uses iconSrc; weapon section headers use power imgs |
| `app/(game)/mine/MineClient.tsx` | Resource job icons → img |
| `app/(game)/shop/ShopClient.tsx` | Tab icons 22px; resource strip 20px imgs; ArmoryPanel resource ReactNode; panel icons 26px |
| `app/(game)/develop/DevelopClient.tsx` | ReqRow soldiers → solders.png 12px |
| `app/(game)/hero/HeroClient.tsx` | Hero emblem 36px; ShieldRow ReactNode icons; BOOST_ACTIONS icon ReactNode; BoostRow updated |

---

## Attack Page Changes

### PowerSide — Icon Crest Header
- New circular crest (30px) at top of each panel: gold-tinted for attacker, neutral for defender
- Final ECP value displayed **prominently** below the icon (large font, color-matched)
- "כוח סופי" label below value
- Breakdown rows (PP, bonuses, tribe multiplier) shown as secondary info beneath

### Loot Section — 4-Column Medallion Tiles
- Layout changed from 2×2 horizontal chips → **4-column vertical medallion grid**
- Each resource: 42px circular container with per-resource colored glow
  - Gold: `rgba(240,192,48,…)`, Iron: `rgba(152,152,192,…)`, Wood: `rgba(100,180,80,…)`, Food: `rgba(240,140,60,…)`
- Bold centered `+value` below icon, resource label below that
- All 4 resources always shown even if zero (dimmed at `opacity-40`)

### Captives
- Always shown even if 0; `slave.png` (22px) in 36px amber container; dimmed when zero

### Casualties
- "Your losses" header: `solders.png` 12px inline

---

## Training Page Changes

### Army Snapshot — Vertical Medallion Cards
- Chips changed from horizontal (icon + label + value) to **vertical medallion card** layout
- Grid: 3 columns mobile / 6 columns desktop
- Each card: 40px circular icon container with per-unit colored glow + bold value + uppercase label
  - Soldiers: `rgba(220,60,60,…)` red
  - Cavalry: `rgba(200,150,30,…)` amber
  - Spies: `rgba(160,80,220,…)` purple
  - Scouts: `rgba(220,130,30,…)` orange
  - Slaves: `rgba(130,130,110,…)` stone
  - Free pop: `rgba(60,180,80,…)` green (👥 emoji, no asset)

---

## Base Page Changes

### Resources Row — Medallion Tiles
- Cards taller with 40px circular icon containers (per-resource glow), large value, label below

### Army Detail — Icon Circles
- Each unit now has a 36px circular icon container (per-unit color, no glow — subtle)
- Grid changed to `grid-cols-3 sm:grid-cols-6`
- Value + label below icon in each cell

---

## Battle Result — Zero Value Policy

All battle result values always render:

| Field | Before | After |
|---|---|---|
| Gold / Iron / Wood / Food loot | Hidden when 0 | Always shown, dimmed |
| Captives | Hidden when 0 | Always shown, dimmed |
| Losses | Already always shown | Unchanged |

---

## Icon Sizes by Context

| Context | Size |
|---|---|
| Inline text chips (ResourceBadge) | 14px |
| Sidebar resource chips | 15px |
| Mobile header strip | 14px |
| Weapon category labels (intel panels) | 10–11px |
| Training army medallion icons | 22px in 40px circle |
| Power crest (PowerSide header) | 17px in 30px circle |
| Loot medallion icons | 24px in 42px circle |
| Dialog buttons | 20px |
| Shop tab icons | 22px |
| Shop ArmoryPanel header icons | 26px |
| Shop resource strip | 20px |
| Base page power panels | 28px |
| Base resources medallion | 22px in 40px circle |
| Base army detail circles | 20px in 36px circle |
| Battle report captives | 22px in 36px container |
| Hero boost icons | 16px |
| Hero shield icons | 18px |
| Hero emblem | 36px |

---

## Intentionally Kept Non-Game Icons

| Location | Icon | Reason |
|---|---|---|
| Sidebar mana | 🔮 | No mana asset |
| Turns / tick displays | ⚡ / ⏱ | No asset |
| Hero boost production | `<Zap>` | No production asset |
| Toast notifications | emoji | Ephemeral UI — emoji scanning is intentional |
| Guide page | emoji | Static docs, not game data |
| Login/landing | ⚔️ | Branding context |
| WEAPON_META individual weapons | emoji | No per-weapon assets; category icons exist |
| Training free population | 👥 | No free-pop asset |
| Base army detail free pop | 👥 | No free-pop asset |

---

## Combat Logic

No formulas, API logic, or game mechanics were modified. All changes are purely visual.

---

## Verification

- `npx tsc --noEmit` — ✅ 0 errors
- `npm run build` — ✅ all routes compile clean
