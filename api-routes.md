# Domiron — API Routes

> All routes are under `/app/api/`.
> All routes require authentication unless marked `[PUBLIC]`.
> All responses follow: `{ data?, error?, message? }`.

---

## Authentication

Every protected route starts with:
```typescript
const session = await getServerSession(authOptions)
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const playerId = session.user.id
```

---

## 1. Auth Routes

### POST `/api/auth/register`
**[PUBLIC]**
```typescript
Body: {
  username: string      // 3–20 chars, alphanumeric
  email: string
  password: string      // min 8 chars
  army_name: string     // 3–20 chars
  race: 'orc' | 'human' | 'elf' | 'dwarf'
}
Response: { data: { player_id, session } }
```
- Creates player row + resources + army + training + development + hero + bank rows
- Applies catch-up bonus based on days since season start
- Season day 1–7: ×1 | 8–30: ×2 | 31–60: ×5 | 61–80: ×10 | 81–90: ×20

### POST `/api/auth/login`
**[PUBLIC]** — Handled by NextAuth

---

## 2. Tick Route

### GET `/api/tick`
**[CRON ONLY]** — Verified via `CRON_SECRET` header

```typescript
Headers: { 'x-cron-secret': process.env.CRON_SECRET }
```

**Processing order (per player):**
1. Add 3 turns (cap at `max_turns = 30`)
2. Add untrained population (by `population_level`)
3. Calculate + add slave production (gold/iron/wood/food by dev level + city multiplier)
4. Add 1 tribe mana (+1 per 10-19 members, +2 per 20-29, etc.)
5. Apply VIP production bonus (×1.10 if active)
6. Reset `deposits_today` if new day
7. Recalculate all rankings
8. Broadcast tick event via Supabase Realtime

**Max execution time: 25 seconds (Vercel limit)**
**Expected: < 5 seconds for up to 10,000 players**

---

## 3. Base / Player Data

### GET `/api/player`
```typescript
Response: {
  data: {
    player: Player,
    resources: Resources,
    army: Army,
    weapons: Weapons,
    training: Training,
    development: Development,
    hero: Hero,
    bank: Bank,
    tribe: Tribe | null
  }
}
```
Returns all data needed for the base page in one call.

---

## 4. Attack

### GET `/api/attack?page=1&search=`
```typescript
Query: { page: number, search?: string }
Response: {
  data: {
    players: Array<{
      id, army_name, tribe_name, soldiers, gold, rank_city,
      attack_count_today: number   // how many times this player was attacked today
    }>,
    total_pages: number
  }
}
```
- Returns only players in same city
- 15 players per page

### POST `/api/attack`
```typescript
Body: { target_id: string, turns: number }  // turns: 1–10
Response: {
  data: {
    outcome: 'crushing_win' | 'win' | 'draw' | 'loss' | 'crushing_loss',
    attacker_losses: number,
    defender_losses: number,
    slaves_taken: number,
    gold_stolen: number,
    iron_stolen: number,
    wood_stolen: number,
    food_stolen: number,
    atk_power: number,
    def_power: number
  }
}
```
**Validations:**
- Session valid
- Target exists + same city
- Player has enough turns
- Player has enough food (turns × 10)
- Cooldown: 5 seconds since last attack
- If attacked same target >5 times today: resources only, no soldier damage

---

## 5. Training

### GET `/api/training`
```typescript
Response: {
  data: {
    army: Army,
    training: Training,
    free_population: number,
    population_per_tick: number
  }
}
```

### POST `/api/training/basic`
```typescript
Body: {
  type: 'soldier' | 'slave' | 'spy' | 'scout' | 'cavalry' | 'farmer',
  amount: number
}
Response: { data: { trained: number, cost: { gold: number } } }
```
**Validations:**
- Enough gold
- Enough free population (capacity check)
- Cavalry: max 1 per 10 existing soldiers

### POST `/api/training/advanced`
```typescript
Body: {
  type: 'attack' | 'defense' | 'spy' | 'scout'
}
Response: { data: { new_level: number, multiplier: number } }
```
Cost: 300 gold + 300 food per level (no cap on levels)

---

## 6. Development

### GET `/api/develop`
```typescript
Response: {
  data: {
    development: Development,
    city_info: { current: number, next?: { name, cost, requirements } }
  }
}
```

### POST `/api/develop/upgrade`
```typescript
Body: {
  type: 'gold' | 'food' | 'wood' | 'iron' | 'population' | 'fortification'
}
Response: { data: { new_level: number, new_production: string } }
```

### POST `/api/develop/move-city`
```typescript
// No body — moves to next city
Response: { data: { new_city: number } }
```
**Validations:**
- Has enough resources (gold, iron, wood, food)
- Has minimum soldiers required
- Player leaves tribe automatically

---

## 7. Shop

### GET `/api/shop`
```typescript
Response: {
  data: {
    weapons: Weapons,   // current inventory
    catalog: WeaponCatalog   // all available weapons with prices + player max
  }
}
```

### POST `/api/shop/buy`
```typescript
Body: { weapon_key: string, amount: number }
Response: { data: { bought: number, cost: { iron: number, wood?: number } } }
```

### POST `/api/shop/sell`
```typescript
Body: { weapon_key: string, amount: number }
Response: { data: { sold: number, refund: { iron: number, wood?: number } } }
```
Refund = 20% of original cost (iron/wood only, no gold refunded)

---

## 8. Mine & Fields

### GET `/api/mine`
```typescript
Response: {
  data: {
    army: { slaves, farmers },
    allocation: {
      gold_mine: number,
      iron_mine: number,
      woodcutters: number,
      farmers: number,
      free: number
    },
    stats: {   // what they produced last tick
      gold_per_slave: string,   // e.g. "1.0 – 3.0"
      iron_per_slave: string,
      wood_per_slave: string,
      food_per_farmer: string
    }
  }
}
```

### POST `/api/mine/allocate`
```typescript
Body: {
  gold_mine: number,
  iron_mine: number,
  woodcutters: number,
  farmers: number
}
Response: { data: { allocation: Allocation } }
```
**Validation:** Total allocated ≤ total slaves + farmers

---

## 9. Bank

### GET `/api/bank`
```typescript
Response: {
  data: {
    bank: Bank,
    current_interest_pct: number,   // level × 0.125
    next_upgrade_cost: number
  }
}
```

### POST `/api/bank/deposit`
```typescript
Body: { amount: number }
Response: { data: { deposited: number, new_balance: number } }
```
**Validations:**
- Max 2 deposits per day
- Max deposit = 50% of current gold on hand

### POST `/api/bank/withdraw`
```typescript
Body: { amount: number }
Response: { data: { withdrawn: number } }
```

### POST `/api/bank/upgrade-interest`
```typescript
// No body
Response: { data: { new_level: number, new_rate: number } }
```
Cost: `2000 × (current_level + 1)` gold

---

## 10. Hero

### GET `/api/hero`
```typescript
Response: {
  data: {
    hero: Hero,
    spells: HeroSpell[],   // purchased spells
    available_spells: SpellTree   // full tree with purchased/available/locked status
  }
}
```

### POST `/api/hero/buy-spell`
```typescript
Body: { spell_key: string }
Response: { data: { spell: HeroSpell, remaining_points: number } }
```
**Validations:**
- Has unspent spell points
- Spell not already purchased
- Prerequisites met (row must be unlocked)

### POST `/api/hero/activate-shield`
```typescript
Body: { type: 'soldiers' | 'resources' }
Response: { data: { expires_at: string } }
```
Cost: 25 personal mana. Duration: 1 hour.

---

## 11. Tribe

### GET `/api/tribe`
```typescript
Response: {
  data: {
    tribe: Tribe | null,
    members: TribeMember[],
    available_spells: TribeSpell[],
    active_spells: ActiveSpell[]
  }
}
```

### POST `/api/tribe/create`
```typescript
Body: { name: string, anthem?: string }
// Only top 100 ranked players in their city can create a tribe
Response: { data: { tribe: Tribe } }
```

### POST `/api/tribe/join-request`
```typescript
Body: { tribe_id: string }
Response: { data: { status: 'pending' } }
```

### POST `/api/tribe/accept-member`  *(leader/deputy only)*
```typescript
Body: { player_id: string }
Response: { data: { member: TribeMember } }
```

### POST `/api/tribe/kick-member`  *(leader/deputy only)*
```typescript
Body: { player_id: string }
Response: { data: { success: true } }
```

### POST `/api/tribe/leave`
```typescript
// No body
Response: { data: { success: true } }
```

### POST `/api/tribe/set-tax`  *(leader only)*
```typescript
Body: { amount: number }   // max by city: 25K/100K/1M/10M/100M
Response: { data: { tax_amount: number } }
```

### POST `/api/tribe/pay-tax`
```typescript
// No body — pays current day's tax
Response: { data: { paid: number } }
```

### POST `/api/tribe/activate-spell`  *(leader/deputy only)*
```typescript
Body: { spell_key: string }
Response: { data: { spell: ActiveSpell, mana_remaining: number } }
```

---

## 12. Rankings

### GET `/api/rankings?city=1&page=1`
**[PUBLIC]**
```typescript
Query: { city?: 1|2|3|4|5, page?: number }
Response: {
  data: {
    players: RankedPlayer[],
    total_pages: number
  }
}
```

### GET `/api/rankings/tribes`
**[PUBLIC]**
```typescript
Response: { data: { tribes: RankedTribe[] } }
```

---

## 13. History

### GET `/api/history?type=attacks&page=1`
```typescript
Query: { type: 'attacks' | 'spy' | 'incoming', page?: number }
Response: {
  data: {
    records: AttackRecord[] | SpyRecord[],
    total_pages: number
  }
}
```

---

## 14. Hall of Fame

### GET `/api/halloffame`
**[PUBLIC]**
```typescript
Response: {
  data: {
    seasons: Array<{
      season: Season,
      top_players: HallOfFameEntry[],   // top 20
      top_tribes: HallOfFameEntry[]      // top 5
    }>
  }
}
```

---

## 15. Admin Routes

All routes require `session.user.role === 'admin'`

### GET `/api/admin/players?search=&page=1`
### GET `/api/admin/player/:id`
### POST `/api/admin/player/:id/ban`
### POST `/api/admin/player/:id/unban`
### POST `/api/admin/player/:id/grant-vip` `{ days: number }`
### POST `/api/admin/player/:id/revoke-vip`
### POST `/api/admin/balance` `{ key: string, value: any }`
### GET `/api/admin/balance` — returns all overrides
### POST `/api/admin/season/open`
### POST `/api/admin/season/close`
### GET `/api/admin/logs?page=1`
### GET `/api/admin/stats` — active players, attacks/hour, errors

---

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized (e.g. not admin) |
| 404 | Resource not found |
| 409 | Conflict (e.g. username taken) |
| 429 | Rate limited (cooldown not expired) |
| 500 | Server error |

All errors return: `{ error: string, code?: string }`
