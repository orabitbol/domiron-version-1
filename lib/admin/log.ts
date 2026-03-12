/**
 * lib/admin/log.ts
 *
 * Utility to write admin actions to the admin_logs table.
 * Uses the service-role client to bypass RLS.
 *
 * NEVER throws — logging failures are reported to console only
 * so they never interrupt the action that triggered them.
 */

import { createAdminClient } from '@/lib/supabase/server'

export async function writeAdminLog(
  adminId: string,
  action: string,
  details?: Record<string, unknown> | null,
  targetId?: string | null,
): Promise<void> {
  try {
    const supabase = createAdminClient()

    const { error } = await supabase.from('admin_logs').insert({
      admin_id:  adminId,
      action,
      target_id: targetId ?? null,
      details:   details ?? null,
    })

    if (error) {
      console.error(`[writeAdminLog] Failed to write log (action=${action}):`, error.message)
    }
  } catch (err) {
    console.error('[writeAdminLog] Unexpected error:', err)
  }
}
