import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY, reloadThemeForTests, setThemePreference } from './theme'
import ThemeToggle from './ThemeToggle'

const root = document.documentElement

beforeEach(() => {
  localStorage.clear()
  reloadThemeForTests()
})

afterEach(() => {
  localStorage.clear()
  reloadThemeForTests()
})

describe('theme preference', () => {
  it('follows the system by default: no data-theme attribute', () => {
    expect(root).not.toHaveAttribute('data-theme')
  })

  it('a forced theme sets data-theme and is saved', () => {
    act(() => setThemePreference('dark'))
    expect(root).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('going back to system removes the attribute and the saved choice', () => {
    act(() => setThemePreference('light'))
    act(() => setThemePreference('system'))
    expect(root).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('a saved choice is applied on the next load; junk is ignored', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    reloadThemeForTests()
    expect(root).toHaveAttribute('data-theme', 'dark')
    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    reloadThemeForTests()
    expect(root).not.toHaveAttribute('data-theme')
  })
})

describe('ThemeToggle', () => {
  it('offers the other mode and switches to it', async () => {
    render(<ThemeToggle />)
    // jsdom has no matchMedia, so "system" reads as light.
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(root).toHaveAttribute('data-theme', 'dark')
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(root).toHaveAttribute('data-theme', 'light')
  })
})
