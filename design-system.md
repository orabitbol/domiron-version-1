# Domiron — Design System

> **Every UI element must use these tokens and components.**
> No custom one-off styles. If something doesn't fit — extend this file first.

---

## 1. Visual Identity

**Game:** Domiron
**Theme:** Dark Fantasy Strategy
**Inspiration:** Warcraft III, IZRA — dark backgrounds, gold accents, blood red highlights
**Platform:** Desktop + Mobile web (responsive)
**Animations:** Subtle only — hover states, fade-ins, no heavy effects

---

## 2. Color Palette

```css
/* === BACKGROUNDS === */
--bg-primary:     #0D0A07;   /* Almost black — main page background */
--bg-surface:     #1A1208;   /* Dark brown — cards, panels */
--bg-elevated:    #241A0E;   /* Slightly lighter — hover, modals */
--bg-overlay:     #2E2010;   /* Tooltip, dropdown backgrounds */

/* === BORDERS === */
--border-default: #3D2E1A;   /* Subtle dark border */
--border-gold:    #8B6914;   /* Gold border for important elements */
--border-active:  #C9901A;   /* Bright gold — focused/active state */

/* === TEXT === */
--text-primary:   #F0D080;   /* Warm gold — primary text */
--text-secondary: #A08040;   /* Muted gold — secondary/labels */
--text-muted:     #5A4020;   /* Very muted — disabled, placeholders */
--text-white:     #F5EDD5;   /* Near-white — headings, values */
--text-error:     #CC2222;   /* Blood red — errors */
--text-success:   #4A8A2A;   /* Forest green — success */

/* === ACCENT COLORS === */
--gold:           #C9901A;   /* Primary action color */
--gold-bright:    #F0C030;   /* Hover on gold elements */
--red-blood:      #8B1A1A;   /* Danger, attacks, losses */
--red-bright:     #CC2222;   /* Error states */
--green-forest:   #2A5A1A;   /* Positive outcomes */
--green-bright:   #4A8A2A;   /* Victory, gains */
--purple-magic:   #5A2A8A;   /* Tribe spells, magic */
--purple-bright:  #8A4ACA;   /* Active magic effects */
--blue-scout:     #1A3A6A;   /* Scout/spy elements */

/* === RESOURCE COLORS === */
--color-gold:     #F0C030;   /* Gold resource */
--color-iron:     #8090A0;   /* Iron resource */
--color-wood:     #8B5A2A;   /* Wood resource */
--color-food:     #7AAA3A;   /* Food resource */
--color-mana:     #3A60C0;   /* Mana */
--color-turns:    #C03030;   /* Turns/energy */
```

---

## 3. Typography

```css
/* Import in globals.css */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cinzel+Decorative:wght@700&family=Source+Sans+3:wght@400;500;600&display=swap');

--font-display:   'Cinzel Decorative', serif;   /* Game title, season headers */
--font-heading:   'Cinzel', serif;               /* Page titles, section headers */
--font-body:      'Source Sans 3', sans-serif;   /* All body text, numbers, UI */
```

### Type Scale
```css
--text-xs:   0.75rem;    /* 12px — tooltips, badges */
--text-sm:   0.875rem;   /* 14px — secondary info, table cells */
--text-base: 1rem;       /* 16px — default body */
--text-lg:   1.125rem;   /* 18px — important values */
--text-xl:   1.25rem;    /* 20px — card titles */
--text-2xl:  1.5rem;     /* 24px — section headers */
--text-3xl:  1.875rem;   /* 30px — page titles */
--text-4xl:  2.25rem;    /* 36px — hero sections */
```

---

## 4. Spacing & Layout

```css
--sidebar-width:    240px;
--header-height:    64px;
--content-max-width: 960px;

/* Spacing scale (Tailwind default, using these values) */
/* 4px = 1 unit */
/* Common: p-2(8px), p-3(12px), p-4(16px), p-6(24px), p-8(32px) */
```

---

## 5. Core Components

All components live in `/components/ui/`. Use these — do not create variants.

### 5.1 Button

```tsx
// Variants
<Button variant="primary">Train Soldiers</Button>    // Gold bg
<Button variant="danger">Attack</Button>             // Blood red
<Button variant="ghost">Cancel</Button>              // Transparent + border
<Button variant="success">Upgrade</Button>           // Green
<Button variant="magic">Cast Spell</Button>          // Purple

// Sizes
<Button size="sm">...</Button>    // compact — inside tables
<Button size="md">...</Button>    // default
<Button size="lg">...</Button>    // CTA buttons

// States
<Button disabled>...</Button>     // grayed out, cursor-not-allowed
<Button loading>...</Button>      // spinner inside, disabled
```

**Styling rules:**
- All buttons: `font-heading`, uppercase, letter-spacing
- Primary: gold gradient `from-[#C9901A] to-[#8B6914]`, glow on hover
- Danger: dark red bg `#8B1A1A`, brighter on hover
- Always `cursor-pointer`, never `cursor-default` unless disabled
- Mobile: minimum touch target `44×44px`

### 5.2 Input

```tsx
<Input
  label="Amount"
  type="number"
  min={0}
  max={100}
  value={amount}
  onChange={setAmount}
  suffix="soldiers"    // optional right-side label
  error="Not enough population"   // optional error
/>
```

**Styling rules:**
- Dark background `#1A1208`, gold border on focus
- Text color `--text-white`, placeholder `--text-muted`
- Error state: red border + error message below
- Number inputs: no arrows (appearance: none), +/- buttons optional

### 5.3 ResourceBadge

```tsx
<ResourceBadge type="gold" amount={15000} />
<ResourceBadge type="iron" amount={5000} />
<ResourceBadge type="wood" amount={8000} />
<ResourceBadge type="food" amount={3000} />
<ResourceBadge type="turns" amount={12} />
<ResourceBadge type="mana" amount={25} />
```

Always: icon + formatted number. Never raw number without icon.
Large numbers formatted: `15,000` or `15K` depending on context.

### 5.4 ResourceBar (Top Header)

Fixed top bar on all game pages:
```
[Gold: 15,000] [Iron: 8,000] [Wood: 6,500] [Food: 3,200] | [Turns: 12 +] | [Timer: 14:32]
```

- Always visible, never hidden
- Animates number changes (count-up/down)
- Timer counts down to next tick

### 5.5 StatBox (Army Panel)

Used for the 4 boxes on base page (Attack / Defense / Spy / Scout):

```tsx
<StatBox
  title="Attack"
  icon={<SwordIcon />}
  color="red"    // 'red' | 'blue' | 'green' | 'purple'
  stats={[
    { label: "Soldiers", value: 1250 },
    { label: "Training", value: "Lvl 3" },
    { label: "Weapon Power", value: 148 },
    { label: "Total Power", value: 42350 },
  ]}
/>
```

### 5.6 Toast

```tsx
// Triggered programmatically via useToast() hook
const { addToast } = useToast()

addToast({
  type: 'attack',     // 'attack' | 'victory' | 'defeat' | 'tick' | 'tribe' | 'info' | 'error'
  title: "⚔️ You're being attacked!",
  message: "PlayerX is attacking you!",
  duration: 8000,
  onClick: () => router.push('/history')
})
```

**Positioning:** Fixed, top-left (RTL) or top-right (LTR), z-index: 9999
**Max simultaneous:** 3 — oldest dismissed when 4th arrives
**Animation:** slide-in from edge, fade-out

### 5.7 Table

```tsx
<GameTable
  headers={['Rank', 'Name', 'Tribe', 'Soldiers', 'Gold', 'Action']}
  rows={players.map(p => [p.rank, p.name, p.tribe, p.soldiers, p.gold,
    <AttackButton key={p.id} playerId={p.id} />
  ])}
  striped   // alternating row colors
  hoverable // row highlight on hover
/>
```

### 5.8 UpgradeCard

Used for all upgrade/development interactions:

```tsx
<UpgradeCard
  title="Gold Mine Development"
  description="Each slave produces 1.0–3.0 gold per tick. Upgrade to 1.5–3.5."
  currentLevel={2}
  cost={{ gold: 12000, iron: 3000 }}
  canAfford={true}
  onUpgrade={handleUpgrade}
/>
```

### 5.9 Modal

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Attack"
  size="sm"   // 'sm' | 'md' | 'lg'
>
  <p>Attack PlayerX with 5 turns?</p>
  <ResourceBadge type="food" amount={50} /> required
  <div className="modal-actions">
    <Button variant="ghost" onClick={onClose}>Cancel</Button>
    <Button variant="danger" onClick={handleAttack}>Attack</Button>
  </div>
</Modal>
```

### 5.10 Tooltip

```tsx
<Tooltip content="Cavalry cannot die in battle but are limited to 1 per 10 soldiers">
  <InfoIcon />
</Tooltip>
```

### 5.11 Badge / Pill

```tsx
<Badge variant="gold">VIP</Badge>
<Badge variant="red">Top 10</Badge>
<Badge variant="green">Online</Badge>
<Badge variant="purple">Tribe Leader</Badge>
```

### 5.12 Tabs

```tsx
<Tabs
  tabs={[
    { key: 'attack', label: 'Attack Weapons', icon: <SwordIcon /> },
    { key: 'defense', label: 'Defense Weapons', icon: <ShieldIcon /> },
    { key: 'spy', label: 'Spy Gear', icon: <EyeIcon /> },
    { key: 'scout', label: 'Scout Gear', icon: <MapIcon /> },
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

---

## 6. Layout System

### Game Layout (authenticated)

```
┌─────────────────────────────────────────┐
│  RESOURCE BAR (fixed top, full width)   │
├────────────┬────────────────────────────┤
│  SIDEBAR   │  MAIN CONTENT              │
│  (240px)   │  (max-width: 960px)        │
│            │                            │
│  nav links │  page content here         │
│            │                            │
│  ─────     │                            │
│  HERO      │                            │
│  PANEL     │                            │
└────────────┴────────────────────────────┘
```

**Mobile (< 768px):**
- Sidebar collapses to bottom navigation bar
- Resource bar compresses to icons only
- Content is full width

### Sidebar Navigation Links
```
Base
Attack
Tribe
Hero
Training
Development
Shop
Mine & Fields
Bank
History
```

---

## 7. Icon System

Use **Lucide Icons** for all UI icons (already in the project via shadcn).
Game-specific icons (sword, shield, etc.) — use SVG files in `/public/icons/`.

**Standard icon sizes:**
- `size-4` (16px) — inline in text
- `size-5` (20px) — buttons, table cells
- `size-6` (24px) — sidebar nav
- `size-8` (32px) — card headers

---

## 8. Animation Guidelines

**DO use:**
- `transition-colors duration-150` — hover color changes
- `transition-opacity duration-200` — show/hide elements
- `fade-in` on page load (opacity 0→1, 200ms)
- Number count-up animation for resource changes in ResourceBar
- Slide-in for Toasts

**DO NOT use:**
- Rotation animations on game elements
- Bounce/elastic effects
- Parallax scrolling
- Any animation > 300ms (feels sluggish in a strategy game)

---

## 9. RTL / LTR Support

```tsx
// In layout.tsx
<html lang={locale} dir={locale === 'he' ? 'rtl' : 'ltr'}>

// In Tailwind — use logical properties:
// Instead of: ml-4 → use: ms-4 (margin-start)
// Instead of: pr-2 → use: pe-2 (padding-end)
// Instead of: text-left → use: text-start
```

The sidebar appears on the right in RTL, left in LTR.
Toasts appear top-right in RTL, top-right in LTR (same — feels natural).

---

## 10. Responsive Breakpoints

```
Mobile:   < 768px    (sm)
Tablet:   768–1024px (md)
Desktop:  > 1024px   (lg)
```

**Mobile-specific rules:**
- Sidebar → bottom nav (5 main items max, rest in hamburger)
- Tables → horizontal scroll or card layout
- Modals → full screen bottom sheet
- Touch targets minimum 44×44px
- No hover-only interactions

---

## 11. Loading States

```tsx
// Page loading
<PageSkeleton />   // dark shimmer blocks

// Button loading
<Button loading>Upgrading...</Button>   // spinner replaces text

// Table loading
<TableSkeleton rows={10} />

// Resource bar
// Shows last known values, subtle pulse animation while fetching
```

---

## 12. Empty States

```tsx
<EmptyState
  icon={<SwordIcon />}
  title="No battles yet"
  description="Attack another player to see your history here"
  action={<Button variant="primary" onClick={() => router.push('/attack')}>Find an Enemy</Button>}
/>
```

---

## 13. Form Validation Patterns

```tsx
// All forms validate on submit, not on every keystroke (less noisy)
// Show errors below the relevant input
// Error color: --red-bright (#CC2222)
// Success color: --green-bright (#4A8A2A)

// Standard error messages (use i18n keys):
// 'not_enough_gold'     → "Not enough gold"
// 'not_enough_food'     → "Not enough food (requires X)"
// 'not_enough_turns'    → "Not enough turns"
// 'invalid_amount'      → "Enter a valid amount"
// 'max_exceeded'        → "Maximum is X"
// 'cooldown_active'     → "Wait X seconds"
```

---

## 14. Tailwind Config Additions

```typescript
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      'game-bg':       '#0D0A07',
      'game-surface':  '#1A1208',
      'game-elevated': '#241A0E',
      'game-gold':     '#C9901A',
      'game-gold-bright': '#F0C030',
      'game-red':      '#8B1A1A',
      'game-green':    '#2A5A1A',
      'game-purple':   '#5A2A8A',
      'game-border':   '#3D2E1A',
      'game-border-gold': '#8B6914',
    },
    fontFamily: {
      display: ['Cinzel Decorative', 'serif'],
      heading: ['Cinzel', 'serif'],
      body:    ['Source Sans 3', 'sans-serif'],
    },
    boxShadow: {
      'gold-glow': '0 0 12px rgba(201, 144, 26, 0.4)',
      'red-glow':  '0 0 12px rgba(139, 26, 26, 0.4)',
    }
  }
}
```
