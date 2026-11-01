import { useSyncExternalStore } from 'react'

/** What the user picked; 'system' follows the OS setting. */
export type ThemePreference = 'light' | 'dark' | 'system'
/** What is on screen. */
export type ThemeMode = 'light' | 'dark'

/** Also read by public/theme-init.js (loaded first by index.html), which applies the theme before first paint. */
export const THEME_STORAGE_KEY = 'umless-theme'

const listeners = new Set<() => void>()
const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage blocked (private mode): follow the system.
  }
  return 'system'
}

let preference: ThemePreference = readPreference()

function systemMode(): ThemeMode {
  return darkQuery()?.matches ? 'dark' : 'light'
}

function apply() {
  // 'system' removes the attribute so tokens.css's prefers-color-scheme block decides, with no JS on OS changes.
  if (preference === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', preference)
}

function notify() {
  listeners.forEach((listener) => listener())
}

apply()
darkQuery()?.addEventListener?.('change', notify)

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
  apply()
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference)
}

/** The theme on screen now: the preference, or the system's when it's 'system'. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, () => (preference === 'system' ? systemMode() : preference))
}

/** Tests only: re-read storage, as a fresh page load would. */
export function reloadThemeForTests() {
  preference = readPreference()
  apply()
  notify()
}
