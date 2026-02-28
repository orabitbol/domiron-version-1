# Domiron — Game Logic

> All formulas and numbers are implemented in `/lib/game/` and `/config/balance.config.ts`.
> Admin can override any value via Admin Panel → stored in `balance_overrides` table.

---

## 1. Tick System

**Frequency:** Every 30 minutes (Vercel Cron)
**Turns per tick:** +3 (capped at 30)

### What happens per tick (in order):
1. Add 3 turns to every player (cap: 30)
2. Add untrained population
3. Process slave/farmer production
4. Add tribe mana
5. Apply bank interest (daily, on day change)
6. Recalculate all power scores + rankings
7. Fire Supabase Realtime event to all connected players

---

## 2. Races & Bonuses

| Race | Bonus 1 | Bonus 2 |
|------|---------|---------|
| Orc | +10% attack power | +3% defense power |
| Human | +15% gold production per tick | +3% attack power |
| Elf | +20% spy power | +20% scout power |
| Dwarf | +15% defense power | +3% gold production |

Applied as multipliers at calculation time — not stored in DB.

---

## 3. Combat System

### 3.1 Attack Power Formula
```
ATK = (soldiers + cavalry × 1.2 + weapon_bonus)
    × training_multiplier(attack_level)
    × (1 + turns × turn_bonus_rate)
    × race_bonus
    × random(0.92, 1.08)
```

### 3.2 Defense Power Formula
```
DEF = (soldiers + cavalry × 1.2 + weapon_bonus)
    × training_multiplier(defense_level)
    × fortification_multiplier
    × race_bonus
    + tribe_defense_contribution
```

### 3.3 Turn Bonus Rate
```
Turns 1–5:  +15% per turn
Turns 6–10: +12% per turn (diminishing returns)

Examples:
1 turn:  ×1.15
3 turns: ×1.45
5 turns: ×1.75
10 turns: ×2.35
```

### 3.4 Training Multiplier
```
multiplier = 1 + (level × 0.08)

Level 0: ×1.00 (default)
Level 5: ×1.40
Level 10: ×1.80
Level 20: ×2.60
```
Cost per level: 300 gold + 300 food. No cap.

### 3.5 Tribe Defense Contribution
```
tribe_defense = sum of (each member's defense_power × 0.05)
```
Cannot be purchased. Scales automatically with tribe size.

### 3.6 Battle Outcomes

| Outcome | ATK/DEF Ratio | Attacker Losses | Defender Losses | Theft |
|---------|--------------|-----------------|-----------------|-------|
| Crushing Victory | ≥ 2.0 | 5% | 40% | 30% resources + 20% soldiers as slaves |
| Victory | 1.1 – 1.99 | 15% | 25% | 20% resources + 10% soldiers as slaves |
| Draw | 0.9 – 1.09 | 10% | 10% | 5% resources only |
| Defeat | 0.5 – 0.89 | 30% | 5% | Nothing |
| Crushing Defeat | < 0.5 | 60% | 2% | Nothing |

**Hard cap:** Max 50% of any resource stolen per single attack.

### 3.7 Attack Limits
- 5 attacks on same target per day → deal full damage
- Attack 6+ on same target: resources only, no soldier damage/capture
- Cooldown between attacks: 5 seconds
- Food cost: turns × 10

### 3.8 Weapon Bonus Calculation
```
total_weapon_power = sum of (weapon_quantity × weapon_power_value)
weapon_bonus_per_soldier = total_weapon_power / total_soldiers

ATK/DEF formula uses total_weapon_power added to base unit count
```

---

## 4. Weapons Catalog

### Attack Weapons
| Key | Name | Power | Max | Cost (iron) |
|-----|------|-------|-----|-------------|
| slingshot | Slingshot | 2 | 25 | 200 |
| boomerang | Boomerang | 5 | 12 | 400 |
| pirate_knife | Pirate Knife | 12 | 6 | 800 |
| axe | Axe | 28 | 3 | 1,600 |
| master_knife | Master Knife | 64 | 1 | 3,200 |
| knight_axe | Knight's Axe | 148 | 1 | 6,400 |
| iron_ball | Iron Ball | 340 | 1 | 12,800 |

### Defense Weapons
| Key | Name | Power | Cost |
|-----|------|-------|------|
| wood_shield | Wood Shield | ×1.10 | 1,500g |
| iron_shield | Iron Shield | ×1.25 | 8,000g |
| leather_armor | Leather Armor | ×1.40 | 25,000g |
| chain_armor | Chain Armor | ×1.55 | 80,000g |
| plate_armor | Plate Armor | ×1.70 | 250,000g |
| mithril_armor | Mithril Armor | ×1.90 | 700,000g |
| gods_armor | Gods' Armor | ×2.20 | 1,000,000g + 500,000 iron + 300,000 wood |

Sell refund: 20% of original cost (iron/wood only, no gold).

---

## 5. Training Costs

### Basic Training
| Unit | Gold | Capacity Used |
|------|------|--------------|
| Soldier | 60 | 83 |
| Slave | 10 | 150 |
| Spy | 80 | 62 |
| Scout | 80 | 62 |
| Cavalry | 1,000 | 0 (needs 10 soldiers) |
| Farmer | 150 | 0 (separate pool) |

### Capacity (max trained units)
- Base capacity: 2,500
- Each development upgrade: +500
- Farmers and slaves do NOT count toward capacity
- Cavalry does NOT count toward capacity

---

## 6. Resource Production

### Per Tick Formula
```
production = units_allocated × base_rate × city_multiplier × vip_multiplier × race_bonus

base_rate = random(1.0, 3.0) per unit  (at development level 1)
city_multiplier: city 1=×1, city 2=×2, city 3=×3, city 4=×4, city 5=×5
vip_multiplier: 1.10 if VIP active, else 1.0
```

### Development Levels (production multiplier)
| Level | Rate per unit | Upgrade Cost |
|-------|--------------|--------------|
| 1 | 1.0–3.0 | — |
| 2 | 1.5–3.5 | 3 gold + 3 [resource] |
| 3 | 2.0–4.0 | 9 gold + 9 [resource] |
| 5 | 3.0–5.0 | ~50 gold + 50 [resource] |
| 10 | 5.5–7.5 | ~500 gold + 500 [resource] |

### Population per Tick
```
population = base_population(population_level) × vip_multiplier

population_level 1: +1 per tick
population_level 5: +8 per tick
population_level 10: +23 per tick
```

---

## 7. Bank System

```
interest_rate = interest_level × 0.125%
interest_applied = daily (on tick when date changes)
deposit_limit = 50% of current gold on hand
deposits_per_day = 2 (resets at midnight)
upgrade_cost = 2,000 × (current_level + 1) gold
bank_is_theft_proof = true (100% protection)
```

---

## 8. Ranking Formula

```
power_total = (attack_power × 0.30)
            + (defense_power × 0.30)
            + (spy_power × 0.20)
            + (scout_power × 0.20)
```

Updated every tick. Used for:
- City ranking (per city)
- Global ranking (all players)
- Tribe ranking (average of all members' power_total)

Only top 100 ranked players in a city can create a tribe.

---

## 9. Hero System

### XP Sources
| Action | XP Gained |
|--------|-----------|
| Winning a battle (weak opponent) | +10 |
| Winning a battle (equal opponent) | +25 |
| Winning a battle (stronger opponent) | +50 |
| Tribe contribution per tick | +5 |
| Achievement unlock | +100–500 |

### Level Thresholds
```
Level N requires: level × 100 XP from previous level
Level 1→2: 100 XP
Level 9→10: 1,000 XP
Level 49→50: 5,000 XP
Level 99→100: 10,000 XP
```

### Spell Tree Structure
```
Categories: gold | attack | defense | spy | scout | resource

Each category has 3 columns × 5 rows = 15 spells
Column 1 (right): small bonus  (5%/10%/15%/20%/25%)
Column 2 (center): medium bonus (9%/20%/25%/30%/35%)
Column 3 (left): large bonus  (15%/30%/35%/45%/45%)

Row 1 unlocked by default
Row N requires at least 1 spell purchased in row N-1
Each spell costs 1 spell point
Spells are permanent — cannot be refunded
```

### Hero Active Spells (manual activation)
```
soldier_shield:
  cost: 25 mana
  effect: soldiers cannot die or be enslaved this battle
  duration: 1 hour

resource_shield:
  cost: 25 mana
  effect: resources cannot be stolen
  duration: 1 hour
```

### Personal Mana
```
mana_per_tick = 1 (base)
+ 1 if hero level ≥ 10
+ 1 if hero level ≥ 50
+ VIP: +1 per tick
```

---

## 10. Tribe System

### Defense Contribution
```
per_battle_defense_bonus = sum(member.defense_power × 0.05)
```

### Mana per Tick
```
base: +1 per tick (scaled by tribe level)
10–19 members: +1 extra
20–29 members: +2 extra
30–39 members: +3 extra
40–49 members: +4 extra
50 members: +5 extra
```

### Tribe Spells
| Key | Mana Cost | Effect | Duration |
|-----|-----------|--------|----------|
| combat_boost | 5 | +20% attack for all members | 3 hours |
| tribe_shield | 8 | +40% defense for all members | 2 hours |
| production_blessing | 4 | +50% production for all members | 6 hours |
| mass_spy | 6 | Reveals all enemy armies in city | One-time |
| war_cry | 15 | +50% attack + removes defender tribe bonus | 1 hour |

### Tax Limits by City
| City 1 | City 2 | City 3 | City 4 | City 5 |
|--------|--------|--------|--------|--------|
| 25,000 | 100,000 | 1,000,000 | 10,000,000 | 100,000,000 |

Leader and deputy are always tax-exempt.

---

## 11. City System

| City | Multiplier | Required Soldiers | Required Resources |
|------|-----------|------------------|-------------------|
| 1 | ×1 | — | — |
| 2 | ×2 | 200 | 120,000 each |
| 3 | ×3 | 500 | 500,000 each |
| 4 | ×4 | 1,500 | 2,000,000 each |
| 5 | ×5 | 5,000 | 10,000,000 each |

Moving city: player leaves tribe. Resources, soldiers, weapons, hero all transfer.

---

## 12. Season System

```
Season duration: 90 days
New player catch-up bonus (resources only, not soldiers):
  Day 1–7:   ×1  (normal start)
  Day 8–30:  ×2
  Day 31–60: ×5
  Day 61–80: ×10
  Day 81–90: ×20

At season end:
  - Save TOP 20 players + TOP 5 tribes to hall_of_fame
  - Reset: resources, army, weapons, training, development, hero, bank, tribes
  - Keep: player accounts, usernames, hall_of_fame entries

Inactive accounts: no special treatment. Game continues for them offline.
Account deletion: after 3 consecutive seasons with 0 logins.
```

---

## 13. Shields & Vacation

### Auto Shields (no cost)
| Trigger | Effect | Duration |
|---------|--------|----------|
| New player registered | Full attack immunity | 7 days |

### Manual Shields (from Hero page)
| Shield | Cost | Duration |
|--------|------|----------|
| Soldier shield | 25 mana | 1 hour |
| Resource shield | 25 mana | 1 hour |

### Vacation Mode (manual toggle)
```
- Player cannot be attacked
- Player cannot attack
- Turns per tick: 1 (instead of 3)
- Production: 33% of normal
- Max vacation days per season: 14
- Cannot activate if attacked someone in last 2 hours
```

---

## 14. Real-Time Events (Supabase Realtime)

| DB Change | Table | Event fired to |
|-----------|-------|---------------|
| New attack | attacks INSERT | defender (if online) |
| Resources updated | resources UPDATE | owner |
| Tribe spell activated | tribe_spells INSERT | all tribe members |
| Tribe kick | tribe_members DELETE | kicked player |
| Rank change (significant) | players UPDATE (rank) | player |
| Tick completed | — (broadcast) | all connected players |
| Season ending in 24h | — (scheduled) | all connected players |

### Toast mapping (see design-system.md for UI details)
```typescript
const TOAST_MAP = {
  'attack_incoming':    { type: 'attack',  duration: 8000, navigateTo: '/history' },
  'battle_result_win':  { type: 'victory', duration: 5000 },
  'battle_result_loss': { type: 'defeat',  duration: 10000 },
  'tick_completed':     { type: 'info',    duration: 4000 },
  'tribe_spell_cast':   { type: 'magic',   duration: 5000 },
  'tribe_kicked':       { type: 'error',   duration: 8000 },
  'rank_improved':      { type: 'success', duration: 5000 },
  'season_ending':      { type: 'warning', duration: 15000 },
  'spy_caught':         { type: 'warning', duration: 6000 },
  'enemy_spy_caught':   { type: 'success', duration: 5000 },
}
```

---

## 15. Freemium / Crystals (Premium Currency)

### Packages (ILS)
| Package | Crystals | Price |
|---------|----------|-------|
| Spark | 100 | ₪9.90 |
| Flame | 300 | ₪24.90 |
| Fire | 700 | ₪49.90 |
| Blaze | 1,500 | ₪89.90 |
| Inferno | 3,500 | ₪179.90 |
| Apocalypse | 8,000 | ₪349.90 |

### Purchasable Items (crystals only)
| Item | Cost | Effect | Rule |
|------|------|--------|------|
| Turn booster ×2 / 6h | 50 | Double turn accumulation | Convenience only |
| Production booster ×2 / 24h | 80 | Double resources | Convenience only |
| Shield 12h | 150 | No-attack protection | Cannot attack while active |
| Shield 24h | 300 | No-attack protection | Cannot attack while active |
| Season VIP | 500 | ×1.10 all production, +XP bonus, extra mana, weekly turns | Best value |
| Name change | 100 | Cosmetic | One-time use |

**HARD RULE: Never sell soldiers, gold, weapons, or direct combat power.**
Crystals buy time and convenience — never victory.
