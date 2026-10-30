import { useClerk } from '@clerk/react'
import { PracticeTimePanel } from '@/features/billing'
import { useSession } from '@/shared/lib/session'
import { setThemePreference, useThemePreference } from '@/shared/theme'
import type { ThemePreference } from '@/shared/theme'
import { Button, Panel, Segmented } from '@/shared/ui'
import './SettingsPage.css'

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

/** Only rendered with Clerk on: useClerk needs its provider. */
function AccountPanel() {
  const clerk = useClerk()
  return (
    <Panel title="Account">
      <p className="muted">Your name, email, password and sign-in methods, and deleting your account.</p>
      <div>
        <Button icon="user" onClick={() => clerk.openUserProfile()}>
          Manage account
        </Button>
      </div>
    </Panel>
  )
}

// Phase 3: the settings that already exist; Phase 9 adds the profile and billing tabs.
export default function SettingsPage() {
  const theme = useThemePreference()
  const { auth } = useSession()
  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <Panel title="Appearance">
        <p className="muted">System follows your device's light or dark setting.</p>
        <Segmented<ThemePreference> label="Theme" value={theme} onChange={setThemePreference} options={THEMES} />
      </Panel>
      <PracticeTimePanel />
      {auth === 'clerk' && <AccountPanel />}
    </div>
  )
}
