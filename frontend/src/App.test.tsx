import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import AppCrash from './AppCrash'
import ErrorBoundary from './components/ErrorBoundary'
import { rootErrorOptions } from './reportError'

vi.mock('./questions/QuestionsScreen', () => ({ default: () => <h1>Your questions</h1> }))
vi.mock('./practice/PracticeRoute', () => ({
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
  window.history.pushState(null, '', '/')
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('App error boundary', () => {
  it('shows a fallback for a crashed page, keeps the header, and clears it on navigation', async () => {
    window.history.pushState(null, '', '/practice/a')
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('Something went wrong on this page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '← Questions' }))
    expect(screen.getByRole('heading', { name: 'Your questions' })).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong on this page')).toBeNull()
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
