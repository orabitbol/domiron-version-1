/**
 * Game balance loader.
 * Imports from balance.config.ts (the source of truth).
 * In the future, admin overrides from DB will be merged here at server startup.
 */
import { BALANCE } from '@/config/balance.config'

export { BALANCE }
export type { } from '@/config/balance.config'
