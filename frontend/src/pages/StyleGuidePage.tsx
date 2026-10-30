import { useState } from 'react'
import { ThemeToggle, setThemePreference, useThemePreference } from '@/shared/theme'
import type { ThemePreference } from '@/shared/theme'
import {
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  ICON_NAMES,
  Icon,
  IconButton,
  IconTile,
  Input,
  Kbd,
  LineChart,
  LinkRow,
  List,
  ListGroupLabel,
  ListRow,
  Panel,
  Segmented,
  Select,
  Skeleton,
  Spinner,
  Stat,
  Switch,
  Tabs,
  Textarea,
} from '@/shared/ui'
import './StyleGuidePage.css'

const TREND = [4.2, 3.8, 3.9, 3.1, 2.9, 2.6, 2.4, 2.1].map((value, i) => ({ label: i === 7 ? 'Now' : `W${i + 1}`, value }))

/**
 * Dev-only living style guide (/_ui, not in production builds): every primitive in shared/ui,
 * to compare with docs/design/v2/components.html in both themes.
 */
export default function StyleGuidePage() {
  const theme = useThemePreference()
  const [period, setPeriod] = useState<'7' | '30' | 'all'>('30')
  const [dialog, setDialog] = useState(false)
  const [keep, setKeep] = useState(true)
  const [text, setText] = useState('Tell me about yourself')

  return (
    <div className="style-guide">
      <header className="style-guide__head">
        <h1>Design system</h1>
        <Segmented<ThemePreference>
          label="Theme"
          value={theme}
          onChange={setThemePreference}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]}
        />
        <ThemeToggle />
      </header>

      <Panel title="Buttons">
        <div className="style-guide__row">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon="trash">
            Delete
          </Button>
          <Button variant="record" icon="mic">
            Record
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
        <div className="style-guide__row">
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="lg" icon="arrow">
            Large
          </Button>
          <IconButton icon="edit" label="Edit question" />
          <IconButton icon="trash" label="Delete question" />
          <IconButton icon="play" label="Play" variant="secondary" />
        </div>
      </Panel>

      <Panel title="Badges and keys" actions={<Badge>Last 8 weeks</Badge>}>
        <div className="style-guide__row">
          <Badge>1:42</Badge>
          <Badge tone="primary">Most popular</Badge>
          <Badge tone="success">1.2 / min · best</Badge>
          <Badge tone="warning">Last minute</Badge>
          <Badge tone="danger">Failed</Badge>
          <Badge dashed>Design note</Badge>
          <span>
            Press <Kbd>Space</Kbd> to record
          </span>
        </div>
      </Panel>

      <Panel title="Banners">
        <Banner tone="info" title="Allow microphone access">
          Your browser is asking, near the address bar. We only listen while you record.
        </Banner>
        <Banner tone="success" title="Fewer fillers than last time.">
          1.8 per minute, down from 2.4.
        </Banner>
        <Banner tone="warning" title="You already have “Tell me about yourself.”" actions={<Button size="sm">Add anyway</Button>} />
        <Banner
          tone="danger"
          title="Can't reach the umless server"
          actions={
            <Button size="sm" icon="refresh">
              Retry
            </Button>
          }
        >
          Your questions are safe. Check your connection and try again.
        </Banner>
      </Panel>

      <Panel title="Forms">
        <Field label="New question" hint="Press Enter to add. Up to 500 characters.">
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Tell me about a time you…" />
        </Field>
        <Field label="With an error" error="Keep questions under 500 characters. 512 now.">
          <Input defaultValue="A very long question…" />
        </Field>
        <Field label="Notes">
          <Textarea placeholder="Anything to remember" />
        </Field>
        <Field label="Question">
          <Select defaultValue="all">
            <option value="all">All questions</option>
            <option>Tell me about yourself.</option>
          </Select>
        </Field>
        <Switch label="Keep my takes in History" description="Saved transcripts show up in History." checked={keep} onChange={(event) => setKeep(event.target.checked)} />
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Tabs
          label="Settings"
          current="/_ui"
          tabs={[
            { to: '/_ui', label: 'Profile' },
            { to: '/_ui#billing', label: 'Billing' },
          ]}
        />
      </Panel>

      <div className="style-guide__stats">
        <Stat label="Takes this week" value="9" note="↑ 3 vs last week" trend="better" />
        <Stat label="Fillers per minute" value="2.1" note="↓ 0.3 vs last week" trend="better" />
        <Stat label="Average pace" value="141" unit="wpm" note="In the 130–160 range" />
        <Stat label="Longest pause" value="2.4" unit="s" note="↑ 0.6 s vs last week" trend="worse" />
      </div>

      <Panel title="Fillers per minute" actions={<Badge>Last 8 weeks</Badge>}>
        <LineChart points={TREND} description="Fillers per minute fell from 4.2 eight weeks ago to 2.1 this week." />
      </Panel>

      <Panel title="Lists">
        <List>
          <ListRow lead="1" title="Tell me about yourself." meta="Practised 6× · last today · 1.4 fillers/min" end={<Button size="sm">Practise</Button>} />
          <ListRow lead="2" title="Tell me about a time you failed." meta={<Badge tone="primary">New</Badge>} end={<Button size="sm" variant="primary">Practise</Button>} />
        </List>
        <List as="div">
          <ListGroupLabel>Today</ListGroupLabel>
          <LinkRow to="/_ui" title="Tell me about yourself." meta="18:20 · 1:12 · 146 wpm" end={<Badge>1.4 / min</Badge>} />
          <LinkRow to="/_ui" title="What's your biggest weakness?" meta="Wed, Oct 21 · 0:58 · 152 wpm" end={<Badge tone="warning">3.1 / min</Badge>} />
        </List>
      </Panel>

      <div className="style-guide__stats">
        <Card>
          <IconTile icon="highlight" />
          <h3>Filler words, flagged</h3>
          <p>um, uh and mhmm highlighted in your transcript.</p>
        </Card>
        <Card surface>
          <Spinner />
          <p>Transcribing…</p>
        </Card>
        <Card>
          <Skeleton width="60%" />
          <Skeleton width="30%" height={12} />
        </Card>
      </div>

      <EmptyState icon="list" title="No questions yet" actions={<Button variant="primary">Add a question</Button>}>
        Add the first question you expect to be asked.
      </EmptyState>

      <Panel title="Dialog">
        <div className="style-guide__row">
          <Button variant="danger" onClick={() => setDialog(true)}>
            Open delete dialog
          </Button>
        </div>
      </Panel>
      {dialog && (
        <Dialog
          role="alertdialog"
          title="Delete “What's your biggest weakness?”"
          onDismiss={() => setDialog(false)}
          actions={
            <>
              <Button onClick={() => setDialog(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                Delete
              </Button>
            </>
          }
        >
          <p>Its 2 takes and their stats go too. You can undo for 5 seconds.</p>
        </Dialog>
      )}

      <Panel title={`Icons (${ICON_NAMES.length})`}>
        <div className="style-guide__icons">
          {ICON_NAMES.map((name) => (
            <span key={name}>
              <Icon name={name} />
              <small>{name}</small>
            </span>
          ))}
        </div>
      </Panel>
    </div>
  )
}
