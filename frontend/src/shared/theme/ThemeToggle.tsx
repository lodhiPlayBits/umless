import { IconButton } from '@/shared/ui'
import { setThemePreference, useThemeMode } from './theme'

/** The sun/moon button: shows the mode you'd switch to, and saves the choice for next time. */
export default function ThemeToggle({ className }: { className?: string }) {
  const mode = useThemeMode()
  const next = mode === 'dark' ? 'light' : 'dark'
  return <IconButton icon={next === 'dark' ? 'moon' : 'sun'} label={`Switch to ${next} mode`} className={className} onClick={() => setThemePreference(next)} />
}
