import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { niceMax } from './chartScale'
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  LineChart,
  LinkRow,
  List,
  ListRow,
  Panel,
  Segmented,
  Select,
  Stat,
  Switch,
  Tabs,
  Textarea,
} from '.'

describe('Button', () => {
  it('is a secondary type="button" by default, so it never submits a form by accident', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('ui-button', 'ui-button--secondary')
  })

  it('maps variant, size and block to classes and keeps the caller’s className', () => {
    render(
      <Button variant="primary" size="lg" block className="extra">
        Go
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveClass('ui-button--primary', 'ui-button--lg', 'ui-button--block', 'extra')
  })

  it('passes native props and the ref through (stands in for a <button>)', async () => {
    const ref = createRef<HTMLButtonElement>()
    const onClick = vi.fn()
    render(
      <Button ref={ref} type="submit" disabled aria-describedby="x" onClick={onClick}>
        Send
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(ref.current).toBe(button)
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-describedby', 'x')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders a leading icon hidden from screen readers', () => {
    render(<Button icon="trash">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('ButtonLink is a real link with the button look', () => {
    render(
      <ButtonLink to="/practice/a" variant="primary">
        Practise
      </ButtonLink>,
    )
    const link = screen.getByRole('link', { name: 'Practise' })
    expect(link).toHaveAttribute('href', '/practice/a')
    expect(link).toHaveClass('ui-button--primary')
  })

  it('IconButton is named by its label', () => {
    render(<IconButton icon="edit" label="Edit question" />)
    expect(screen.getByRole('button', { name: 'Edit question' })).toHaveClass('ui-button--icon', 'ui-button--ghost')
  })
})

describe('Icon', () => {
  it('is decorative without a label and an image with one', () => {
    const { container } = render(
      <>
        <Icon name="mic" />
        <Icon name="lock" label="Locked" />
      </>,
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('img', { name: 'Locked' })).toBeInTheDocument()
  })
})

describe('Badge, Stat, Panel, EmptyState', () => {
  it('Badge maps tone and dashed', () => {
    render(
      <Badge tone="success" dashed>
        best
      </Badge>,
    )
    expect(screen.getByText('best')).toHaveClass('ui-badge', 'ui-badge--success', 'ui-badge--dashed')
  })

  it('Stat shows value, unit and a trend-coloured note', () => {
    render(<Stat label="Average pace" value="141" unit="wpm" note="↓ 3" trend="better" />)
    expect(screen.getByText('141')).toHaveTextContent('141 wpm')
    expect(screen.getByText('↓ 3')).toHaveClass('ui-stat__note--better')
  })

  it('Panel is a section named by its heading', () => {
    render(
      <Panel title="Recent takes" actions={<a href="/history">See all</a>}>
        <p>rows</p>
      </Panel>,
    )
    expect(screen.getByRole('region', { name: 'Recent takes' })).toContainElement(screen.getByRole('link', { name: 'See all' }))
  })

  it('Panel can use an h3', () => {
    render(<Panel title="Invoices" headingLevel={3} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Invoices' })).toBeInTheDocument()
  })

  it('EmptyState shows title, text and actions', () => {
    render(
      <EmptyState icon="list" title="No takes yet" actions={<button type="button">Practise</button>}>
        After you transcribe an answer it shows up here.
      </EmptyState>,
    )
    expect(screen.getByText('No takes yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Practise' })).toBeInTheDocument()
  })
})

describe('Banner', () => {
  it('danger banners are alerts; others are status messages', () => {
    render(
      <>
        <Banner tone="danger" title="Can't reach the server" />
        <Banner tone="success" title="Saved" />
      </>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('a role can be overridden', () => {
    render(<Banner tone="danger" role="status" title="Quiet" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Field', () => {
  it('connects label and hint to the control', () => {
    render(
      <Field label="New question" hint="Up to 500 characters.">
        <Input />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'New question' })
    expect(input).toHaveAccessibleDescription('Up to 500 characters.')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('an error replaces the hint and marks the control invalid', () => {
    render(
      <Field label="New question" hint="Up to 500 characters." error="Too long">
        <Textarea />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'New question' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Too long')
    expect(screen.queryByText('Up to 500 characters.')).toBeNull()
  })

  it('takes an id from the Field and adds the control’s own aria-describedby', () => {
    render(
      <>
        <span id="extra">extra</span>
        <Field label="Q" hint="hint" id="mine">
          <Input aria-describedby="extra" />
        </Field>
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Q' })
    expect(input).toHaveAttribute('id', 'mine')
    expect(input).toHaveAccessibleDescription('hint extra')
  })

  it('hideLabel keeps the name for screen readers', () => {
    render(
      <Field label="Question" hideLabel>
        <Select>
          <option>All</option>
        </Select>
      </Field>,
    )
    expect(screen.getByRole('combobox', { name: 'Question' })).toBeInTheDocument()
  })

  it('controls work outside a Field too', () => {
    render(<Input aria-label="Search" />)
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveClass('ui-input')
  })
})

describe('Switch', () => {
  it('is a switch with a label and description, toggled by click', async () => {
    function Harness() {
      const [on, setOn] = useState(false)
      return <Switch label="Keep audio too" description="Deleted after 30 days." checked={on} onChange={(e) => setOn(e.target.checked)} />
    }
    render(<Harness />)
    const toggle = screen.getByRole('switch', { name: 'Keep audio too' })
    expect(toggle).toHaveAccessibleDescription('Deleted after 30 days.')
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
  })
})

describe('Segmented', () => {
  it('is a labelled group of pressed/unpressed buttons and reports the pick', async () => {
    const onChange = vi.fn()
    render(
      <Segmented
        label="Period"
        value="30"
        onChange={onChange}
        options={[
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
        ]}
      />,
    )
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: '7 days' }))
    expect(onChange).toHaveBeenCalledWith('7')
  })
})

describe('Tabs', () => {
  it('marks the current tab with aria-current="page"', () => {
    render(
      <Tabs
        label="Settings"
        current="/settings/billing"
        tabs={[
          { to: '/settings', label: 'Profile' },
          { to: '/settings/billing', label: 'Billing' },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Billing' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current')
  })
})

describe('List', () => {
  it('renders an ordered list of rows with title, meta and end content', () => {
    render(
      <List>
        <ListRow lead="1" title="Tell me about yourself." meta="Practised 6×" end={<button type="button">Practise</button>} />
      </List>,
    )
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    expect(screen.getByRole('listitem')).toHaveTextContent('Tell me about yourself.Practised 6×')
  })

  it('LinkRow is one link', () => {
    render(
      <List as="div">
        <LinkRow to="/takes/1" title="Tell me about yourself." meta="Today" />
      </List>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/takes/1')
  })
})

describe('Dialog', () => {
  it('renders at the top of the page, above every container', () => {
    // Regression: opened from the sidebar (position: sticky, its own stacking context), the
    // dialog's z-index only ranked it inside the sidebar, and page buttons showed through it.
    render(
      <aside data-testid="sidebar" style={{ position: 'sticky' }}>
        <Dialog title="Buy practice time">Body</Dialog>
      </aside>,
    )
    const overlay = screen.getByRole('dialog', { name: 'Buy practice time' }).parentElement!
    expect(overlay).toHaveClass('ui-overlay')
    expect(overlay.parentElement).toBe(document.body)
    expect(screen.getByTestId('sidebar')).not.toContainElement(overlay)
  })

  function Harness({ onDismiss }: { onDismiss?: () => void }) {
    return (
      <>
        <button type="button">outside</button>
        <Dialog
          role="alertdialog"
          title="Delete this question?"
          onDismiss={onDismiss}
          actions={
            <>
              <button type="button">Cancel</button>
              <button type="button">Delete</button>
            </>
          }
        >
          <p>Its takes go too.</p>
        </Dialog>
      </>
    )
  }

  it('is a named, described modal with focus on its first control', () => {
    render(<Harness />)
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this question?' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Its takes go too.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('keeps Tab inside', async () => {
    render(<Harness />)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus()
  })

  it('Esc dismisses it', async () => {
    const onDismiss = vi.fn()
    render(<Harness onDismiss={onDismiss} />)
    await userEvent.keyboard('{Escape}')
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('returns focus to where it was when it closes', async () => {
    function Toggle() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <Dialog
              title="Hi"
              actions={
                <button type="button" onClick={() => setOpen(false)}>
                  Close
                </button>
              }
            />
          )}
        </>
      )
    }
    render(<Toggle />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })
})

describe('LineChart', () => {
  it('is an image described by its text alternative, with one point per value', () => {
    const { container } = render(
      <LineChart
        description="Fillers per minute fell from 4.2 to 2.1."
        points={[
          { label: 'Sep 7', value: 4.2 },
          { label: 'Sep 14', value: 3.1 },
          { label: 'Now', value: 2.1 },
        ]}
      />,
    )
    expect(screen.getByRole('img', { name: 'Fillers per minute fell from 4.2 to 2.1.' })).toBeInTheDocument()
    expect(container.querySelectorAll('circle')).toHaveLength(3)
    expect(screen.getByText('Now')).toBeInTheDocument()
  })

  it('draws an empty chart without crashing', () => {
    const { container } = render(<LineChart description="No data yet." points={[]} />)
    expect(container.querySelector('polyline')).toBeNull()
  })
})

describe('niceMax', () => {
  it.each([
    [0, 1],
    [0.7, 1],
    [4.2, 5],
    [1.8, 2],
    [23, 25],
    [141, 200],
    [10, 10],
  ])('rounds %s up to %s', (value, expected) => {
    expect(niceMax(value)).toBe(expected)
  })
})
