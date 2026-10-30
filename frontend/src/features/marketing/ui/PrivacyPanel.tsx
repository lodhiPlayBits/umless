import { PRIVACY } from '@/content/marketing'
import { PATHS } from '@/shared/config/paths'
import { Badge, Card, IconTile, Link } from '@/shared/ui'
import './marketing.css'

/** "Your voice stays yours": what is kept, where, with a link to the full policy. */
export default function PrivacyPanel() {
  return (
    <section className="mk-band" aria-labelledby="privacy-title">
      <div className="mk-container mk-split">
        <div className="mk-split__copy">
          <span className="mk-eyebrow">Privacy</span>
          <h2 id="privacy-title" className="mk-h2">
            Your voice stays yours
          </h2>
          <p className="mk-lead">{PRIVACY.lead}</p>
          <ul className="mk-ticks">
            {PRIVACY.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <Link to={`/privacy`}>Read the Privacy Policy</Link>
        </div>
        <Card surface className="mk-privacy-card">
          <IconTile icon="shield" />
          <dl>
            {PRIVACY.table.map((row) => (
              <div key={row.what}>
                <dt>{row.what}</dt>
                <dd>
                  <Badge tone={row.what === 'Recording' ? 'success' : 'neutral'}>{row.where}</Badge>
                </dd>
              </div>
            ))}
          </dl>
          <span className="mk-note">
            Ready? <Link to={PATHS.signUp}>Start free</Link>
          </span>
        </Card>
      </div>
    </section>
  )
}
