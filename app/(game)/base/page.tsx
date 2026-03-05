import { BaseClient } from './BaseClient'

// Always render fresh — no router-cache of this page.
export const dynamic = 'force-dynamic'

export default function BasePage() {
  return <BaseClient />
}
