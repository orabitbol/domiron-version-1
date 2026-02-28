# Domiron — Architecture Document

> **This file is the single source of truth for all technical decisions.**
> Every architectural change must be documented here first.

---

## 1. Project Overview

**Domiron** is a real-time, browser-based multiplayer strategy game.
- Single server, all players share the same world
- Season-based (90 days), full reset at end of each season
- Languages: Hebrew (RTL) + English (LTR)
- Platforms: Desktop browser + Mobile web (responsive, not a native app)
- Solo developer

---

## 2. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) | SSR + API Routes in one repo |
| Backend | Next.js API Routes | No separate backend needed |
| Database | Supabase (PostgreSQL) | Managed DB + Realtime + Auth built-in |
| Real-time | Supabase Realtime | WebSocket on DB changes, no extra service |
| Cron Jobs | Vercel Cron Jobs | Tick every 30 min, free tier |
| Auth | NextAuth.js + Supabase | Session management |
| Styling | Tailwind CSS | Utility-first, fast iteration |
| Components | shadcn/ui (customized) | Accessible base, fully overridable |
| i18n | next-intl | RTL/LTR switching, translation files |
| Animations | Framer Motion (light use) | Subtle transitions only, no heavy effects |
| Deployment | Vercel | Perfect for Next.js, free tier |
| Redis | NOT used initially | Add only if DB becomes bottleneck post-launch |

---

## 3. Repository Structure

```
domiron/
├── app/                          # Next.js App Router
│   ├── (game)/                   # Authenticated game routes
│   │   ├── base/page.tsx
│   │   ├── attack/page.tsx
│   │   ├── tribe/page.tsx
│   │   ├── hero/page.tsx
│   │   ├── training/page.tsx
│   │   ├── develop/page.tsx
│   │   ├── shop/page.tsx
│   │   ├── mine/page.tsx
│   │   ├── bank/page.tsx
│   │   └── history/page.tsx
│   ├── (public)/                 # Public routes
│   │   ├── page.tsx              # Landing page
│   │   ├── register/page.tsx
│   │   ├── login/page.tsx
│   │   ├── top20/page.tsx
│   │   ├── clanslist/page.tsx
│   │   └── halloffame/page.tsx
│   ├── api/                      # API Routes (Backend)
│   │   ├── tick/route.ts         # Called by Vercel Cron every 30 min
│   │   ├── attack/route.ts
│   │   ├── train/route.ts
│   │   ├── develop/route.ts
│   │   ├── shop/route.ts
│   │   ├── mine/route.ts
│   │   ├── bank/route.ts
│   │   ├── tribe/route.ts
│   │   ├── hero/route.ts
│   │   └── admin/route.ts
│   └── layout.tsx
├── components/
│   ├── ui/                       # Design System (see design-system.md)
│   ├── game/                     # Game-specific components
│   │   ├── ResourceBar.tsx       # Top bar: gold, iron, wood, food
│   │   ├── ToastSystem.tsx       # Real-time toast notifications
│   │   ├── ArmyPanel.tsx         # Attack/Defense/Spy/Scout boxes
│   │   └── HeroSidebar.tsx
│   └── layout/
│       ├── GameLayout.tsx        # Authenticated layout wrapper
│       └── Sidebar.tsx           # Navigation sidebar
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   └── server.ts             # Server Supabase client
│   ├── game/
│   │   ├── combat.ts             # Combat formula logic
│   │   ├── tick.ts               # Tick processing logic
│   │   ├── balance.ts            # All game numbers (imported from balance.config.ts)
│   │   └── realtime.ts           # Supabase Realtime event handlers
│   └── utils.ts
├── config/
│   └── balance.config.ts         # SINGLE SOURCE OF TRUTH for all game numbers
├── messages/
│   ├── he.json                   # Hebrew translations
│   └── en.json                   # English translations
├── docs/                         # This folder
│   ├── architecture.md
│   ├── database-schema.md
│   ├── api-routes.md
│   ├── design-system.md
│   └── game-logic.md
└── types/
    └── game.ts                   # All TypeScript types
```

---

## 4. Data Flow

### 4.1 Normal API Request (e.g., buy weapon)
```
User clicks "Buy" 
  → POST /api/shop 
  → Validate session (NextAuth)
  → Validate resources (check DB)
  → Update DB (deduct resources, add weapon)
  → Supabase Realtime detects DB change
  → Broadcasts to connected player
  → UI updates instantly (no page reload)
```

### 4.2 Attack Flow
```
Player A clicks "Attack Player B" with 5 turns
  → POST /api/attack { targetId, turns }
  → Server validates: session, food, cooldown (5s)
  → Server runs combat formula (see game-logic.md)
  → DB updates: both players' soldiers, resources, history
  → Supabase Realtime fires event to Player B (if online)
  → Player B sees Toast: "⚔️ [PlayerA] is attacking you!"
  → After combat resolves: Player B sees result Toast
  → Both players' UIs update resource bars automatically
```

### 4.3 Tick Flow (every 30 minutes)
```
Vercel Cron triggers GET /api/tick
  → Verify cron secret (CRON_SECRET env var)
  → For every active player:
      - Add 3 turns (max 30)
      - Add untrained population (by development level)
      - Calculate slave production (gold/iron/wood/food)
      - Add tribe mana (+1 + size bonus)
  → Update all rankings
  → Broadcast tick event to all connected players
  → Log tick completion + duration
```

### 4.4 Real-time Toast Flow
```
Supabase Realtime listens to:
  - attacks table (INSERT) → fire attack toast to defender
  - resources table (UPDATE) → update resource bar
  - tribe_events table (INSERT) → tribe spell toasts
  - rankings table (UPDATE) → rank change toasts

Client (ToastSystem.tsx):
  - Subscribes on login
  - Unsubscribes on logout/disconnect
  - Max 3 simultaneous toasts
  - Auto-reconnect on disconnect
```

---

## 5. Authentication

- **NextAuth.js** handles sessions (JWT)
- **Supabase RLS (Row Level Security)** protects all DB queries
- Every API route starts with:
```typescript
const session = await getServerSession(authOptions)
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
```
- Admin routes additionally check: `session.user.role === 'admin'`

---

## 6. Season Management

| Event | Trigger | Action |
|-------|---------|--------|
| Season start | Manual (Admin Panel) | Reset all game data, keep accounts |
| Season end (day 90) | Vercel Cron (daily check) | Save Hall of Fame, trigger reset |
| Mid-season join | On register | Apply catch-up bonus (see game-logic.md) |
| Inactive account | Never auto-deleted | Stays until season reset |
| Account deletion | After 3 consecutive inactive seasons | Permanent delete from DB |

---

## 7. Environments

| Env | URL | DB |
|-----|-----|-----|
| Development | localhost:3000 | Supabase local / dev project |
| Production | domiron.vercel.app (or custom domain) | Supabase production project |

### Required Environment Variables
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Cron security
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_DEFAULT_LOCALE=he
```

---

## 8. Performance Notes

- **No Redis initially** — Supabase PostgreSQL handles all reads
- Ranking table updated every tick (not on every action)
- Balance config loaded once at server startup, not per request
- Images: all game assets served via Vercel CDN (put in `/public`)
- Mobile: responsive CSS only, no separate mobile codebase

---

## 9. Admin Panel

Route: `/admin` (role-based, not linked publicly)

Capabilities:
- Edit any balance parameter (reads from `balance_overrides` DB table, overrides `balance.config.ts`)
- Ban/unban players
- Reset player password
- Grant/revoke VIP
- View all player data
- Force-open/close season
- Add to Hall of Fame manually
- View real-time monitoring: active players, attacks/hour, errors
- Full audit log: every admin action logged with timestamp + admin name
