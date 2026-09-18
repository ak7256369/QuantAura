/**
 * notify.js — Bridge to Electron's native OS notification system.
 * Calls window.electronAPI (exposed by preload.js) — safe to call from React.
 *
 * Note: The main notification logic (signal change detection) runs in
 * electron/main.js via the updater callback. This module handles any
 * renderer-initiated notification requests (e.g. manual alerts set by user).
 */

const isElectron = () =>
  typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined'

/**
 * Request a manual data refresh (triggers updater in main process).
 */
export function requestRefresh() {
  if (isElectron()) window.electronAPI.requestRefresh()
}

/**
 * Switch active crypto symbol (triggers updater in main process).
 */
export function setSymbol(symbol) {
  if (isElectron()) window.electronAPI.setSymbol(symbol)
}

/**
 * Toggle the always-on-top pin state.
 */
export function togglePin() {
  if (isElectron()) window.electronAPI.togglePin()
}

/**
 * Minimize the widget to the system tray.
 */
export function minimizeToTray() {
  if (isElectron()) window.electronAPI.minimizeToTray()
}

/**
 * Fully quit the application.
 */
/**
 * Fully quit the application.
 */
export function closeApp() {
  if (isElectron()) window.electronAPI.closeApp()
}

/**
 * Get saved auth credentials from Electron main process.
 */
export async function getAuth() {
  if (isElectron() && window.electronAPI.getAuth) {
    return await window.electronAPI.getAuth()
  }
  // Fallback for browser mode
  try {
    const t = localStorage.getItem('quant_token')
    const u = localStorage.getItem('quant_user')
    if (t) return { token: t, user: u ? JSON.parse(u) : null }
  } catch {}
  return null
}

/**
 * Persist auth credentials to Electron main process and disk.
 */
export async function setAuth(authData) {
  if (isElectron() && window.electronAPI.setAuth) {
    await window.electronAPI.setAuth(authData)
  }
  try {
    if (authData?.token) {
      localStorage.setItem('quant_token', authData.token)
      localStorage.setItem('quant_user', JSON.stringify(authData.user))
    }
  } catch {}
}

/**
 * Log out and clear saved auth credentials.
 */
export async function logout() {
  if (isElectron() && window.electronAPI.logout) {
    await window.electronAPI.logout()
  }
  try {
    localStorage.removeItem('quant_token')
    localStorage.removeItem('quant_user')
  } catch {}
}

/**
 * Get the current always-on-top pin status (synchronous).
 */
export function getPinStatus() {
  if (isElectron()) return window.electronAPI.getPinStatus()
  return true // default pinned
}

/**
 * Subscribe to data updates pushed from the main process (updater).
 * @param {Function} cb - called with fresh signal+price payload
 */
export function onDataUpdate(cb) {
  if (isElectron()) window.electronAPI.onDataUpdate(cb)
}

/**
 * Subscribe to force-refresh events (triggered from tray menu).
 * @param {Function} cb
 */
export function onForceRefresh(cb) {
  if (isElectron()) window.electronAPI.onForceRefresh(cb)
}

/**
 * Subscribe to pin status changes.
 * @param {Function} cb - called with boolean (pinned)
 */
export function onPinStatus(cb) {
  if (isElectron()) window.electronAPI.onPinStatus(cb)
}
