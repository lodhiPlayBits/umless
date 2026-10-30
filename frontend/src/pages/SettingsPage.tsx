import { UserProfile } from '@clerk/react'
import { BillingPanel } from '@/features/billing'
import type { PageProps } from '@/pages/types'
import { PATHS } from '@/shared/config/paths'
import { useSession } from '@/shared/lib/session'
import { setThemePreference, useThemePreference } from '@/shared/theme'
import type { ThemePreference } from '@/shared/theme'
import { Panel, Segmented, Tabs } from '@/shared/ui'
import './SettingsPage.css'

const TABS = [
  { to: PATHS.settings, label: 'Profile' },
  { to: PATHS.settingsBilling, label: 'Billing' },
] as const

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

/** Settings (docs/design/v2/app-settings.html): Profile and Billing tabs, each its own URL. */
export default function SettingsPage({ params }: PageProps) {
  const billing = params.tab === 'billing'
  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <Tabs label="Settings" current={billing ? PATHS.settingsBilling : PATHS.settings} tabs={TABS} />
      {billing ? <BillingPanel /> : <Profile />}
    </div>
  )
}

function Profile() {
  const theme = useThemePreference()
  const { auth } = useSession()
  return (
    <>
      <Panel title="Appearance">
        <p className="muted">System follows your device's light or dark setting.</p>
        <Segmented<ThemePreference> label="Theme" value={theme} onChange={setThemePreference} options={THEMES} />
      </Panel>
      <Panel title="Account">
        {auth === 'clerk' ? (
          // Clerk's own profile: name, email, password, sign-in methods, devices and deleting the account.
          <UserProfile
            routing="hash"
            appearance={{ elements: { rootBox: 'settings-clerk', cardBox: 'settings-clerk__card', navbar: 'settings-clerk__nav' } }}
          />
        ) : (
          <p className="muted">Sign-in is off on this server, so there is no account to manage.</p>
        )}
      </Panel>
    </>
  )
}
