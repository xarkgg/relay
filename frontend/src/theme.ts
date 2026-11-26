import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

const storageKey = 'relay-theme'
const changeEvent = 'relay-theme-change'

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#1a1a1a' : '#ffffff')
  window.dispatchEvent(new Event(changeEvent))
}

export function restoreTheme() {
  document.documentElement.classList.remove('theme-changing')
  try {
    const savedTheme = localStorage.getItem(storageKey)
    if (savedTheme === 'light' || savedTheme === 'dark') applyTheme(savedTheme)
  } catch {
    // Keep the current theme if browser storage is unavailable.
  }
}

export function toggleTheme() {
  const theme = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.classList.add('theme-changing')
  applyTheme(theme)
  try {
    localStorage.setItem(storageKey, theme)
  } catch {
    // The toggle still works for this page without storage.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(changeEvent, onChange)
  return () => window.removeEventListener(changeEvent, onChange)
}

export function useTheme() {
  return useSyncExternalStore(subscribe, currentTheme, (): Theme => 'light')
}
