/**
 * Game balance loader.
 * Imports from balance.config.ts (the source of truth).
 * Validates schema on first import — throws fast if any required key is missing.
 * In the future, admin overrides from DB will be merged here at server startup.
 */
import { BALANCE } from '@/config/balance.config'
import { validateBalance } from './balance-validate'

validateBalance()

export { BALANCE }
export type { } from '@/config/balance.config'
