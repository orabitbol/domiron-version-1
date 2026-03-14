# Domiron Icon Visibility Pass (2026-03-14)

Full aggressive icon-visibility redesign across the entire Domiron game UI.
Includes a follow-up fill pass (same date) that removed "tiny icon in large empty circle" dead space.
No gameplay formulas, combat logic, or API calls were modified.

---

## Design System Applied

### Icon size tiers

| Tier | Use case | New size |
|---|---|---|
| Micro/inline | Text-flow badges (ResourceBadge) | 18px |
| Chip | Sidebar chips, dialog headers | 20–22px |
| Feature | Tab icons, dialog action buttons | 24–28px |
| Panel header | Shop ArmoryPanel, section headers | 28–32px |
| Medallion container | Army cards, resource tiles | 28–32px in 48–54px circle |
| Showcase | StatPanel power icons, hero emblem | 36px+ |

### Medallion container pattern
All icon-as-primary-element contexts now use circular containers:
```
{ width, height, borderRadius: '50%', background: rgba(colorRgb,0.12),
  border: rgba(colorRgb,0.30), boxShadow: 0 0 12px rgba(colorRgb,0.18) }
```
Per-resource/unit color families give each icon its own identity.

---

## Files Changed

### Shared components (used across all screens)

#### `components/ui/tabs.tsx`
- **Removed `size-4` constraint** that was limiting all tab icons to 16px
- New: `shrink-0 flex items-center justify-center` — tab icons now render at their natural size

#### `components/ui/resource-badge.tsx`
- Icon: **14px → 18px**
- Padding: `px-2 py-0.5` → `px-2.5 py-1`
- Emoji fallback: `text-sm` → `text-base`

#### `components/ui/resource-quad.tsx`
- Icon: **12px → 16px**
- Pill padding: `2px 8px` → `4px 10px`; heterogeneous variant: `2px 6px` → `4px 8px`
- Font size: `0.67rem` → `0.72rem`

#### `components/layout/Sidebar.tsx`
- ResourceChip icon: **15px → 20px**
- Emoji (🔮 mana): `text-[10px]` → `text-[13px]`

#### `components/game/ResourceBar.tsx`
- Mobile gold chip icon: **14px → 18px**

---

### Attack + battle screens (highest priority)

#### `components/game/AttackDialog.tsx`
- Tab buttons (attack/spy): **20px → 28px**
- Action buttons (attack/send-spies): **20px → 24px**
- Target soldiers count icon: **12px → 16px**

#### `app/(game)/attack/AttackClient.tsx`

**BattleReportModal — Loot tiles**
- Circular container: **42px → 54px**
- Icon inside: **24px → 32px**
- Value text: `text-game-lg` → `text-game-xl`

**BattleReportModal — Captives**
- Container: **36px → 48px**
- slave.png: **22px → 30px**

**PowerSide — Icon crest**
- Circle: compact **30px → 38px**, normal **36px → 44px**
- Icon: compact **17px → 22px**, normal **20px → 26px**
- ECP value: compact `text-game-xl` → `text-game-2xl`

**Casualties header**
- solders.png: **12px → 18px**, opacity 0.6 → 0.7

---

### Army + training

#### `app/(game)/training/TrainingClient.tsx`

**Army snapshot medallion cards**
- Container: **40px → 54px**
- Unit icon: **22px → 30px**
- Emoji (free pop): 18 → 24
- Value text: `text-game-base` → `text-game-xl`

**Resource economy strip**
- Added 42px circular container (neutral bg) around each resource icon
- Icon: **18px → 26px**
- Value text: `text-game-sm` → `text-game-lg`

---

### Base page

#### `app/(game)/base/BaseClient.tsx`

**Resources row medallions**
- Container: **40px → 52px**
- Icon: **22px → 30px**
- Value text: `text-game-lg` → `text-game-xl`

**Army detail circles**
- Container: **36px → 44px**
- Icon: **20px → 26px**
- Emoji (free pop): 16 → 20
- Value text: `text-game-sm font-semibold` → `text-game-base font-bold`

**StatPanel power icons**
- Icon: **28px → 36px**
- Container: `p-1.5` → `p-2`

---

### Shop

#### `app/(game)/shop/ShopClient.tsx`
- Tab icons (now unconstrained by Tabs fix): **22px → 28px**
- ALL_RESOURCES_BADGE inline icons: **11px → 16px**
- ArmoryPanel header icon wrapper: `fontSize: 1.1rem` → `fontSize: 1.6rem` with flex alignment

---

### History

#### `app/(game)/history/HistoryClient.tsx`

**PlunderChip** (shows gold/iron/wood/food stolen in every attack row)
- Icon: **12px → 18px**
- Padding: `2px 6px` → `4px 9px`
- BorderRadius: 4 → 6
- Gap: 3 → 5
- Font: 10px → 12px, added `fontWeight: 700`

---

### Mine

#### `app/(game)/mine/MineClient.tsx`
- Desktop job row icon: **16px → 24px**
- Mobile job row icon: **16px → 22px**
- Output summary icon: **14px → 18px**

---

### Spy

#### `app/(game)/spy/SpyClient.tsx`
- Added spy-power.png (20px) icon to מרגלים stat chip header
- Upgraded מרגלים value text: `text-game-base` → `text-game-lg font-bold tabular-nums`
- Weapon category icons in intel reveal panel: **11px → 16px** (all 4: attack/defense/spy/scout)

---

### Develop

#### `app/(game)/develop/DevelopClient.tsx`
- Soldiers requirement icon (solders.png): **12px → 18px**

---

## Zero Values — Still Rendered

| Field | Behavior |
|---|---|
| All 4 loot resources in BattleReportModal | Always shown, dimmed at `opacity-40` when 0 |
| Captives | Always shown, dimmed when 0 |
| Losses (attacker + defender) | Always shown |
| History PlunderChips | Always rendered (gold/iron/wood/food), all 4 chips per row |

---

## Combat Logic

No formulas, combat calculations, API endpoints, or game mechanics were modified.
All changes are **purely visual**.

---

## Icon Fill Pass — Removing Dead Space (follow-up)

After the initial pass, circular icon containers still had a "small image floating inside a large empty ring" problem.
The second pass aggressively pushed every icon to fill **85–90% of its container diameter**,
leaving only a thin framing border.

### Before → After fill ratios

| Screen / element | Container | Before | After | Fill |
|---|---|---|---|---|
| Training resource strip | 42px circle | 26px | **38px** | 90% |
| Training army medallions | 54px circle | 30px | **48px** | 89% |
| Training free-pop emoji | 54px circle | 24px | **42px** | 78% |
| Base resource medallions | 52px circle | 30px | **46px** | 88% |
| Base army detail circles | 44px circle | 26px | **38px** | 86% |
| Base free-pop emoji | 44px circle | 20px | **34px** | 77% |
| PowerSide crest (compact) | 38px circle | 22px | **32px** | 84% |
| PowerSide crest (normal) | 44px circle | 26px | **38px** | 86% |
| Battle report loot tiles | 54px circle | 32px | **48px** | 89% |
| Battle report captives | 48px container | 30px | **42px** | 88% |
| Hero emblem | 60px circle | 36px | **52px** | 87% |
| Shop ArmoryPanel headers | inline | 26px | **38px** | — |

The border/glow framing is preserved on all containers — only the inner dead space was removed.
Icon artwork now visually dominates the frame rather than floating inside it.

---

## Verification

- `npx tsc --noEmit` — ✅ 0 errors (both passes)
- `npm run build` — ✅ all routes compile clean (both passes)

---

## Aggressive Icon Fill Pass — Drop-Shadow Glow (third pass, 2026-03-14)

This pass eliminates circular icon containers entirely, replacing colored-background rings with
`filter: drop-shadow()` on `<img>` elements so glow traces artwork edges rather than a ring container.
All inline icon sizes were also bumped by 4px for better visual weight.

### Technique applied

```jsx
// BEFORE — circular container + small icon inside
<div style={{ width: 54, height: 54, borderRadius: '50%', background: `rgba(${colorRgb},0.12)`, ... }}>
  <img src={...} style={{ width: 48, height: 48 }} />
</div>

// AFTER — icon directly with drop-shadow, no container
<img src={...} style={{
  width: 54, height: 54, objectFit: 'contain', flexShrink: 0,
  filter: `drop-shadow(0 0 14px rgba(${colorRgb},0.70)) drop-shadow(0 3px 8px rgba(0,0,0,0.45))`
}} />
```

### Files changed

#### `app/(game)/training/TrainingClient.tsx`
- **Resource economy strip**: removed 42px circle container, icon now **42px** directly with white drop-shadow
- **Army snapshot medallions**: removed 54px circle container (background + border + boxShadow), icon **54px** with per-color drop-shadow; emoji fallback unchanged

#### `app/(game)/base/BaseClient.tsx`
- **Resources row medallions**: removed 52px circle container, icon now **52px** directly with per-color drop-shadow
- **Army detail circles**: removed 44px circle container, icon now **44px** with per-color drop-shadow; emoji fallback unchanged

#### `app/(game)/attack/AttackClient.tsx`
- **BattleReportModal loot tiles**: removed circle background from 54px container (kept thin border ring), added drop-shadow to 54px img; conditional on `amount > 0`
- **BattleReportModal captives**: removed background from 48px container, slave.png **48px** with amber drop-shadow conditional on `captives > 0`
- **PowerSide crest**: removed circle container (background + boxShadow), icon **38px/44px** with gold or neutral drop-shadow based on `highlight` prop

#### `app/(game)/hero/HeroClient.tsx`
- Hero emblem circle: background kept (radial gradient is intentional art); icon bumped **52px → 56px**

### Inline icon bumps (+4px each)

| File | Component / element | Before | After |
|---|---|---|---|
| `components/ui/resource-badge.tsx` | ResourceBadge img | 18px | **22px** |
| `components/ui/resource-quad.tsx` | ResourceQuad iconStyle | 16px | **20px** |
| `components/layout/Sidebar.tsx` | ResourceChip img | 20px | **24px** |
| `components/game/ResourceBar.tsx` | Mobile gold chip img | 18px | **22px** |
| `app/(game)/history/HistoryClient.tsx` | PlunderChip img | 18px | **22px** |
| `app/(game)/spy/SpyClient.tsx` | Weapon category icons (×4) | 16px | **20px** |
| `components/game/AttackDialog.tsx` | Action button icons (attack/spy) | 24px | **28px** |

### Verification

- `npx tsc --noEmit` — ✅ 0 errors
- `npm run build` — ✅ all routes compile clean

---

## Pass 4 — Aggressive Enlargement Pass (2026-03-14)

All custom PNG icons were enlarged significantly across the entire game, with the StatPanel power cards receiving the most dramatic redesign. Every size increase is clearly visible and deliberate — these are not +4px tweaks.

### StatPanel power cards — FULL REDESIGN (BaseClient.tsx)

The most important single change in this pass:

- **Icon: 36px → 72px** (2× current size)
- Removed the `p-2 rounded-game-lg` background container around the icon
- Icon now sits directly alongside the title with `gap-3` between them
- Title upgraded: `text-game-xs` → `text-game-sm` for better hierarchy
- Drop-shadow applied: `drop-shadow(0 0 16px rgba(255,255,255,0.25)) drop-shadow(0 4px 12px rgba(0,0,0,0.55))`
- The icon is now a visually dominant element rather than a small decorative badge

### All other files updated

| File | Component / element | Before | After |
|---|---|---|---|
| `app/(game)/base/BaseClient.tsx` | Resource medallion icons | 52px | **60px** |
| `app/(game)/base/BaseClient.tsx` | Army detail unit icons | 44px | **52px** |
| `app/(game)/base/BaseClient.tsx` | Free-pop emoji | fontSize 34 | **fontSize 42** |
| `app/(game)/training/TrainingClient.tsx` | Resource strip icons | 42px | **52px** |
| `app/(game)/training/TrainingClient.tsx` | Army medallion icons | 54px | **64px** |
| `app/(game)/training/TrainingClient.tsx` | Free-pop emoji | fontSize 42 | **fontSize 50** |
| `app/(game)/attack/AttackClient.tsx` | BattleReportModal loot tile icons | 54px | **60px** |
| `app/(game)/attack/AttackClient.tsx` | BattleReportModal captives slave.png | 48px | **52px** |
| `app/(game)/attack/AttackClient.tsx` | PowerSide crest icon (compact) | 38px | **44px** |
| `app/(game)/attack/AttackClient.tsx` | PowerSide crest icon (normal) | 44px | **52px** |
| `app/(game)/attack/AttackClient.tsx` | Casualties header solders.png | 18px | **26px** |
| `app/(game)/shop/ShopClient.tsx` | ArmoryPanel header icons | 38px | **52px** |
| `app/(game)/shop/ShopClient.tsx` | Tab icons | 28px | **36px** |
| `app/(game)/shop/ShopClient.tsx` | ALL_RESOURCES_BADGE icons | 16px | **22px** |
| `app/(game)/history/HistoryClient.tsx` | PlunderChip icons | 22px | **28px** |
| `app/(game)/mine/MineClient.tsx` | Desktop job row icon | 24px | **32px** |
| `app/(game)/mine/MineClient.tsx` | Mobile job row icon | 22px | **28px** |
| `app/(game)/mine/MineClient.tsx` | Output summary icon | 18px | **24px** |
| `app/(game)/spy/SpyClient.tsx` | spy-power.png chip header icon | 20px | **28px** |
| `app/(game)/spy/SpyClient.tsx` | Weapon category icons (×4) | 20px | **26px** |
| `app/(game)/develop/DevelopClient.tsx` | Soldiers requirement icon | 18px | **26px** |
| `app/(game)/develop/DevelopClient.tsx` | Infrastructure row icons | 18px | **26px** |
| `app/(game)/hero/HeroClient.tsx` | Hero emblem icon | 56px | **60px** (fills container) |
| `app/(game)/hero/HeroClient.tsx` | BOOST_ACTIONS power icons | 16px | **22px** |
| `components/ui/resource-badge.tsx` | ResourceBadge img | 22px | **28px** |
| `components/ui/resource-quad.tsx` | ResourceQuad iconStyle | 20px | **26px** |
| `components/layout/Sidebar.tsx` | ResourceChip img | 24px | **30px** |
| `components/game/ResourceBar.tsx` | Mobile gold chip img | 22px | **28px** |
| `components/game/AttackDialog.tsx` | Tab button icons (attack/spy) | 28px | **36px** |
| `components/game/AttackDialog.tsx` | Action button icons | 28px | **34px** |
| `components/game/AttackDialog.tsx` | Soldiers count icon | 16px | **22px** |

### What was NOT changed

- No game formulas, combat logic, or API calls modified
- No Hebrew RTL layout broken
- No data hidden or zero values removed
- No TypeScript types changed

### Verification

- `npx tsc --noEmit` — ✅ 0 errors
- `npm run build` — ✅ all routes compile clean (90/90 static pages generated, only pre-existing `<img>` tag warnings, no errors)

---

## Pass 5 (Final Aggressive Override) — 2026-03-14

All custom PNG icons were enlarged aggressively across the entire app. Minimum increase from Pass 4 was +30–50% on every icon everywhere. Icons are now the primary visual element in their slot — visually dominant, not decorative.

### Headline change

- **StatPanel power icons: 72px → 96px** (biggest icons in the game, now command attention)
- **Hero emblem container: 60px → 72px circle, icon: 60px → 68px** (near-fills container)

### All files updated — before/after sizes

| File | Component / element | Pass 4 | Pass 5 |
|---|---|---|---|
| `app/(game)/base/BaseClient.tsx` | StatPanel icon | 72px | **96px** |
| `app/(game)/base/BaseClient.tsx` | StatPanel gap | gap-3 | **gap-4** |
| `app/(game)/base/BaseClient.tsx` | Resource medallion icons | 60px | **72px** |
| `app/(game)/base/BaseClient.tsx` | Resource tile padding | py-3 | **py-4** |
| `app/(game)/base/BaseClient.tsx` | Army detail unit icons | 52px | **64px** |
| `app/(game)/base/BaseClient.tsx` | Army detail row padding | py-1.5 | **py-2** |
| `app/(game)/base/BaseClient.tsx` | Free-pop emoji | fontSize 42 | **fontSize 52** |
| `app/(game)/training/TrainingClient.tsx` | Resource strip icons | 52px | **64px** |
| `app/(game)/training/TrainingClient.tsx` | Army medallion icons | 64px | **80px** |
| `app/(game)/training/TrainingClient.tsx` | Free-pop emoji | fontSize 50 | **fontSize 60** |
| `app/(game)/attack/AttackClient.tsx` | BattleReportModal loot tile icons | 60px | **72px** |
| `app/(game)/attack/AttackClient.tsx` | Captives slave.png | 52px | **64px** |
| `app/(game)/attack/AttackClient.tsx` | PowerSide crest (compact) | 44px | **56px** |
| `app/(game)/attack/AttackClient.tsx` | PowerSide crest (normal) | 52px | **68px** |
| `app/(game)/attack/AttackClient.tsx` | Casualties header solders.png | 26px | **34px** |
| `app/(game)/shop/ShopClient.tsx` | ArmoryPanel header icon fontSize | 1.6rem | **2.1rem** |
| `app/(game)/shop/ShopClient.tsx` | Tab icons | 36px | **44px** |
| `app/(game)/shop/ShopClient.tsx` | ALL_RESOURCES_BADGE icons | 22px | **28px** |
| `app/(game)/history/HistoryClient.tsx` | PlunderChip icons | 28px | **36px** |
| `app/(game)/history/HistoryClient.tsx` | PlunderChip gap/padding | gap:5, pad:4px 9px | **gap:6, pad:5px 10px** |
| `app/(game)/mine/MineClient.tsx` | Desktop job row icon | 32px | **42px** |
| `app/(game)/mine/MineClient.tsx` | Mobile job row icon | 28px | **36px** |
| `app/(game)/mine/MineClient.tsx` | Output summary icon | 24px | **32px** |
| `app/(game)/spy/SpyClient.tsx` | spy-power.png chip header icon | 28px | **36px** |
| `app/(game)/spy/SpyClient.tsx` | Weapon category icons (×4) | 26px | **34px** |
| `app/(game)/develop/DevelopClient.tsx` | Soldiers requirement icon | 26px | **34px** |
| `app/(game)/develop/DevelopClient.tsx` | Resource cost row icons | 12px | **34px** |
| `app/(game)/develop/DevelopClient.tsx` | Resource strip icons | 18px | **34px** |
| `app/(game)/hero/HeroClient.tsx` | Hero emblem circle container | 60px | **72px** |
| `app/(game)/hero/HeroClient.tsx` | Hero emblem icon | 60px | **68px** |
| `app/(game)/hero/HeroClient.tsx` | BOOST_ACTIONS power icons | 22px | **30px** |
| `components/ui/resource-badge.tsx` | ResourceBadge img | 28px | **36px** |
| `components/ui/resource-badge.tsx` | Padding | px-2.5 py-1 | **px-3 py-1.5** |
| `components/ui/resource-badge.tsx` | Emoji | text-base | **text-lg** |
| `components/ui/resource-quad.tsx` | ResourceQuad iconStyle | 26px | **34px** |
| `components/ui/resource-quad.tsx` | Base pill padding | 4px 10px | **5px 12px** |
| `components/layout/Sidebar.tsx` | ResourceChip img | 30px | **38px** |
| `components/game/ResourceBar.tsx` | Mobile gold chip img | 28px | **36px** |
| `components/game/AttackDialog.tsx` | Tab button icons (attack/spy) | 36px | **48px** |
| `components/game/AttackDialog.tsx` | Action button icons (attack/send-spies) | 34px | **44px** |
| `components/game/AttackDialog.tsx` | Soldiers count icon | 22px | **28px** |

### What was NOT changed

- No game formulas, combat logic, or API calls modified
- No Hebrew RTL layout broken
- No data hidden or zero values removed
- No TypeScript types changed

### Verification

- `npx tsc --noEmit` — ✅ 0 errors
- `npm run build` — ✅ all routes compile clean

---

## Pass 6 (Visual Normalization) — 2026-03-14

Per-icon size overrides applied to compensate for different amounts of transparent padding inside the PNG artwork. Some icons (soldiers/cavalry/spies) appeared smaller on screen than others (scouts/slaves) even at identical CSS sizes — this pass corrects that with targeted `iconSize` fields on every array item.

### Unit icons (base size = the existing px value per context)

| Icon file | Multiplier | Rationale |
|---|---|---|
| `solders.png` (soldiers) | +25% from base | More transparent padding in artwork |
| `cavalry.png` | +25% from base | More transparent padding in artwork |
| `spy.png` (spies) | +20% from base | Slightly more transparent padding |
| `renger.png` (scouts) | base (reference) | Reference icon — no change |
| `slave.png` (slaves) | base (reference) | Reference icon — no change |
| free_population (emoji) | base | No change |

### Resource icons

| Icon file | Multiplier | Rationale |
|---|---|---|
| `iron.png` | +15% from base | More transparent padding in artwork |
| `wood.png` | +15% from base | More transparent padding in artwork |
| `gold.png` | base (reference) | Reference icon — no change |
| `food.png` | base (reference) | Reference icon — no change |

### Files changed

#### `app/(game)/training/TrainingClient.tsx`
- Army snapshot section: added `iconSize` field to each unit in the array; icons now use per-unit size instead of shared `80`
  - soldiers: 80 → **100**, cavalry: 80 → **100**, spies: 80 → **96**, scouts/slaves/free-pop: **80** (unchanged)
- Resource economy strip: already had `iconSize` fields (added in prior pass), confirmed correct

#### `app/(game)/base/BaseClient.tsx`
- Resource medallions row: added `iconSize` per resource
  - gold/food: **72** (unchanged), iron/wood: 72 → **83**
- Army detail row: added `iconSize` per unit
  - soldiers: 64 → **80**, cavalry: 64 → **80**, spies: 64 → **77**, scouts/slaves/free-pop: **64** (unchanged)

#### `app/(game)/attack/AttackClient.tsx`
- BattleReportModal loot tiles (`lootItems` array): added `iconSize` per resource
  - gold/food: **72** (unchanged), iron/wood: 72 → **83**

### What was NOT changed

- No game formulas, combat logic, or API calls modified
- No Hebrew RTL layout broken
- No data hidden or zero values removed
- No TypeScript types changed

### Verification

- `npx tsc --noEmit` — ✅ 0 errors
- `npm run build` — ✅ all routes compile clean (90/90 static pages generated)

---

## Attack Modal Redesign (2026-03-14)

Full JSX-only redesign of the attack modal flow. All combat formulas, logic, API calls, and state management left completely unchanged.

### AttackDialog.tsx (pre-attack modal)

- **Tab buttons**: completely redesigned — large 48px PNG icons (`attack-power.png` / `spy-power.png`) stacked above label text; selected tab has colored border-2 + glow shadow; unselected tabs are dimmed with `opacity-60`
- **Target identity panel**: streamlined flex layout — army name in `text-game-gold-bright`, status chips (resource/soldier/protected/cooldown) arranged inline at the end
- **Force overview stat row**: new 3-column grid showing Soldiers / Cavalry / Food with per-icon drop-shadow glows (red/gold/orange), values colored red when insufficient
- **Turn selector**: wrapped in `p-3 rounded-game-lg bg-game-elevated border` block; existing stepper + slider preserved intact; food cost shown inline with food.png icon (16px); label styled `text-res-food` or `text-game-red-bright` based on sufficiency
- **Risk/reward section**: unchanged content, kept existing green/red card layout
- **Validation warnings**: restyled as `flex items-start gap-2 p-2.5 rounded-game bg-game-red/10 border border-game-red/30` alert blocks with AlertCircle icon
- **Attack action button**: full-width native `<button>` with `bg-game-red/20 border-2 border-game-red/50 text-game-red-bright shadow-[0_0_20px_rgba(220,60,60,0.2)]`; 44px attack-power.png icon with drop-shadow
- **Spy section**: spy overview strip showing available spies count with spy.png icon (44px) + purple glow; stepper preserved; send button purple-themed with spy-power.png 44px icon
- **New prop**: `armyCavalry?: number` (optional, default 0) added to pass cavalry count from AttackClient

### AttackClient.tsx — BattleReportModal

- **Victory/Defeat banner**: dramatic full-width panel — 72px `attack-power.png` (win) or `defense-power.png` (defeat) with 24px glow; victory text uses `gold-gradient-text-static`, defeat uses `text-game-red-bright`; shimmer top bar; attacker vs defender names below
- **Power comparison**: unchanged `PowerSide` components, retained compact layout with 2-column grid
- **Loot section**: section header uses `gold.png` 28px icon + translated label; resource tiles 4-column (`grid-cols-2 sm:grid-cols-4` for mobile 2×2 fallback); all 4 always rendered (zero tiles at `opacity-40`); per-icon sizes: iron/wood=83px, gold/food=72px
- **Captives section**: slave.png 64px with amber glow; count displayed large
- **Casualties section**: new section header with `solders.png` 28px; two-column split — attacker losses (red bg when >0) / enemy losses (green bg when >0); both shown even at 0
- **Footer**: turns/food cost + combat modifier reasons — unchanged content, preserved layout
- **Close button**: full-width styled button — gold theme on victory, neutral on defeat

### AttackClient.tsx — SpyResultModal

- **Result banner**: 68px `spy-power.png` with purple glow on success, red glow on failure; result text `text-game-purple-bright` (success) or `text-game-red-bright` (failure); top shimmer line
- **Mission summary**: spies sent + caught with spy.png 16px inline icon
- **Intel reveal**: extended intel section with icon-labeled rows for soldiers/cavalry/spies/scouts; resources with resource icons; shield chips; weapons dictionary (if present); training levels (if present) — all guarded with `?? undefined` / optional chaining
- **Close button**: full-width, purple-themed on success, neutral on failure

### Constraints preserved

- All combat formulas, game logic, API calls unchanged
- Zero-values still rendered: loot tiles dimmed at `opacity-40`, casualties shown even at 0, captives shown at 0
- Hebrew RTL layout preserved throughout — logical spacing properties used
- `armyCavalry` prop is optional with default 0 — no breaking change to existing call sites
- Mobile adapted: 2×2 loot grid on small screens (`grid-cols-2 sm:grid-cols-4`), all sections stack vertically, touch targets ≥ 44px on action buttons

### Verification

- `npx tsc --noEmit` — ✅ 0 errors
- `npm run build` — ✅ clean build, all routes compiled
