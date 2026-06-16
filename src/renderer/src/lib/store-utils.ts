/**
 * store-utils.ts — Shared helpers for Zustand stores
 *
 * Provides reusable error handling for store catch blocks.
 *
 * @module store-utils
 */

/**
 * Standard error handler for Zustand store catch blocks.
 * Logs the error in DEV mode and sets the error/loading state.
 *
 * @param error - The caught error (unknown)
 * @param set - Zustand's set function
 * @param context - Optional context string for the log message
 */
export function handleStoreError(
  error: unknown,
  set: (state: Record<string, unknown>) => void,
  context?: string
): void {
  if (import.meta.env.DEV) console.error(`${context || 'Operation'} failed:`, error)
  set({
    error: error instanceof Error ? error.message : String(error),
    loading: false
  })
}
