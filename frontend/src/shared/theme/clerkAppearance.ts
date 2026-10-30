/**
 * Clerk's sign-in, sign-up and profile UI drawn with our tokens. They are CSS variables, so Clerk's
 * components follow the light/dark switch with no re-render.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--color-primary)',
    colorPrimaryForeground: 'var(--color-on-primary)',
    colorDanger: 'var(--color-danger)',
    colorSuccess: 'var(--color-success)',
    colorWarning: 'var(--color-warning)',
    colorForeground: 'var(--color-text)',
    colorMutedForeground: 'var(--color-text-muted)',
    colorMuted: 'var(--color-surface)',
    colorBackground: 'var(--color-bg)',
    colorInput: 'var(--color-bg)',
    colorInputForeground: 'var(--color-text)',
    colorBorder: 'var(--color-border)',
    colorRing: 'var(--color-primary)',
    colorShadow: 'var(--color-shadow)',
    colorModalBackdrop: 'var(--color-backdrop)',
    colorNeutral: 'var(--color-text)',
    fontFamily: 'var(--font-sans)',
    fontFamilyButtons: 'var(--font-sans)',
    fontFamilyMono: 'var(--font-mono)',
    borderRadius: 'var(--radius-md)',
  },
} as const
