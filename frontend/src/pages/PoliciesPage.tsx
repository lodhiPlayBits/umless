import { LAST_UPDATED } from '@/content/business'
import { Icon, Link, LinkRow, List } from '@/shared/ui'
import type { IconName } from '@/shared/ui'
import './PoliciesPage.css'

const POLICIES: { to: string; title: string; summary: string; icon: IconName }[] = [
  { to: '/refunds', title: 'Refund & Cancellation Policy', summary: 'Refunds within 3 days if none of the pack has been used.', icon: 'receipt' },
  { to: '/privacy', title: 'Privacy Policy', summary: 'What we keep, who processes it, and how to delete it.', icon: 'lock' },
  { to: '/terms', title: 'Terms & Conditions', summary: 'Using umless, prices and payments.', icon: 'info' },
]

/** The sidebar's Policies tab: one place for every legal page. */
export default function PoliciesPage() {
  return (
    <div className="policies-page">
      <h1>Policies</h1>
      <p className="muted">Last updated {LAST_UPDATED}.</p>
      <List as="ul">
        {POLICIES.map((policy) => (
          <li key={policy.to}>
            <LinkRow to={policy.to} title={policy.title} meta={policy.summary} lead={<Icon name={policy.icon} />} end={<Icon name="right" />} />
          </li>
        ))}
      </List>
      <p className="muted">
        A complaint, a suggestion or a question? <Link to="/contact">Contact us</Link>.
      </p>
    </div>
  )
}
