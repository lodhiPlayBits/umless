import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import AppCrash from '@/app/AppCrash'
import ErrorBoundary from '@/shared/ui/ErrorBoundary'
import { rootErrorOptions } from '@/shared/lib/reportError'

vi.mock('@/features/questions/ui/QuestionsScreen', () => ({ default: () => <h1>Your questions</h1> }))
vi.mock('@/features/practice/ui/PracticeRoute', () => ({
  default: () => {
    throw new Error('render bug')
  },
}))

function Thrower(): never {
  throw new Error('router bug')
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  window.history.pushState(null, '', '/questions')
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('App error boundary', () => {
  it('shows a fallback for a crashed page, keeps the header, and clears it on navigation', async () => {
    window.history.pushState(null, '', '/practice/a')
    const user = userEvent.setup()
    render(<App />)

    // Pages are lazy chunks (docs/adr/0005-frontend-v2-architecture.md decision 2), so wait for it.
    expect(await screen.findByText('Something went wrong on this page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()

    // The top bar's breadcrumb back to the list.
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Questions' }))
    expect(await screen.findByRole('heading', { name: 'Your questions' })).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong on this page')).toBeNull()
  })
})

describe('App layouts and nav', () => {
  it('frames app pages in the shell, with the sidebar marking the current page', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Your questions' })).toBeInTheDocument()
    const [sidebar] = screen.getAllByRole('navigation', { name: 'App' })
    expect(within(sidebar).getByRole('link', { name: 'Questions' })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebar).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
  })

  it('without Clerk the local user is signed in: the landing page goes straight to the dashboard', async () => {
    window.history.pushState(null, '', '/')
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/dashboard'))
    expect(screen.getAllByRole('navigation', { name: 'App' })[0]).toContainElement(screen.getAllByRole('link', { name: 'Dashboard' })[0])
  })

  it('shows public pages in the marketing layout with the legal footer', async () => {
    window.history.pushState(null, '', '/pricing')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Simple pricing. Start free.' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument()
  })

  it('sets the tab title and meta description per page', async () => {
    window.history.pushState(null, '', '/pricing')
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Simple pricing. Start free.' })
    expect(document.title).toBe('Pricing · umless')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', expect.stringMatching(/free minutes/))
  })

  it('shows the not-found page for an unknown URL', async () => {
    window.history.pushState(null, '', '/nope')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: "That page doesn't exist" })).toBeInTheDocument()
    expect(document.title).toBe('Not found · umless')
  })
})

describe('root error boundary', () => {
  it('shows a router-free fallback when the app shell itself throws', () => {
    render(
      <ErrorBoundary fallback={<AppCrash />}>
        <Thrower />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('reports a caught render error through reportError, as main.tsx wires it', async () => {
    // A real root with the same options as main.tsx; Testing Library's render types don't take them.
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container, rootErrorOptions)
    await act(async () =>
      root.render(
        <ErrorBoundary fallback={<AppCrash />}>
          <Thrower />
        </ErrorBoundary>,
      ),
    )
    expect(container).toHaveTextContent('Something went wrong')
    expect(consoleError).toHaveBeenCalledWith('umless error:', expect.objectContaining({ message: 'router bug' }), expect.any(String))
    act(() => root.unmount())
    container.remove()
  })
})
