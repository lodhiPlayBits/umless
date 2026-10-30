import { Component } from 'react'
import type { ReactNode } from 'react'

interface ErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

/**
 * Shows `fallback` instead of a blank page when something below throws while rendering.
 * Reporting happens once, in createRoot's onCaughtError (main.tsx), not here.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
