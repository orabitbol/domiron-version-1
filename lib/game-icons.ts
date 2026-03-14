// Central icon registry for all game concepts
export const GAME_ICONS = {
  // Resources
  gold:        '/icons/gold.png',
  iron:        '/icons/iron.png',
  wood:        '/icons/wood.png',
  food:        '/icons/food.png',
  // Power categories
  attackPower:  '/icons/attack-power.png',
  defensePower: '/icons/defense-power.png',
  rangerPower:  '/icons/renger-power.png',
  spyPower:     '/icons/spy-power.png',
  // Units
  soldiers:    '/icons/solders.png',
  slaves:      '/icons/slave.png',
  cavalry:     '/icons/cavalry.png',
  spies:       '/icons/spy.png',
  rangers:     '/icons/renger.png',
} as const

export type GameIconKey = keyof typeof GAME_ICONS

// Convenience helpers
export const RESOURCE_ICONS: Record<'gold' | 'iron' | 'wood' | 'food', string> = {
  gold: GAME_ICONS.gold,
  iron: GAME_ICONS.iron,
  wood: GAME_ICONS.wood,
  food: GAME_ICONS.food,
}

export const UNIT_ICONS: Record<'soldiers' | 'slaves' | 'cavalry' | 'spies' | 'rangers', string> = {
  soldiers: GAME_ICONS.soldiers,
  slaves:   GAME_ICONS.slaves,
  cavalry:  GAME_ICONS.cavalry,
  spies:    GAME_ICONS.spies,
  rangers:  GAME_ICONS.rangers,
}

export const POWER_ICONS: Record<'attack' | 'defense' | 'spy' | 'ranger', string> = {
  attack:  GAME_ICONS.attackPower,
  defense: GAME_ICONS.defensePower,
  spy:     GAME_ICONS.spyPower,
  ranger:  GAME_ICONS.rangerPower,
}
