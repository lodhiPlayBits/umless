import { FREE_TRANSCRIPTIONS, PRICING } from '@/content/business'
import { HOME_PATH, PATHS } from '@/shared/config/paths'
import { useSession } from '@/shared/lib/session'
import { Badge, ButtonLink, cx } from '@/shared/ui'
import './marketing.css'

const INCLUDED = ['Fillers, pauses and pace', 'Summary for every answer', 'Past takes saved', 'Download audio and transcript']

type Plan = { name: string; blurb: string; price: string; per: string; points: string[]; featured?: boolean }

function plans(): Plan[] {
  const best = PRICING.packs.reduce((a, b) => (b.rupees / b.minutes < a.rupees / a.minutes ? b : a))
  return [
    { name: 'Free', blurb: 'To try it out.', price: '₹0', per: 'for every new account', points: [`${FREE_TRANSCRIPTIONS} free transcriptions`, ...INCLUDED] },
    ...PRICING.packs.map((pack) => ({
      name: pack.name.replace(/^\w/, (c) => c.toUpperCase()),
      blurb: pack === best ? 'For regular practice.' : 'For a few answers.',
      price: pack.price,
      per: `${pack.minutes} minutes · never expires`,
      points: [`${pack.time.replace(/^\w/, (c) => c.toUpperCase())}`, 'Answers up to 10 minutes each', ...INCLUDED.slice(0, 2)],
      featured: pack === best,
    })),
  ]
}

/** The free allowance and the packs (content/business.ts: what the backend charges). */
export default function PricingCards() {
  const { status } = useSession()
  const signedIn = status === 'signedIn'
  return (
    <ul className="mk-plans">
      {plans().map((plan) => (
        <li key={plan.name}>
          <article className={cx('mk-plan', plan.featured && 'mk-plan--featured')} aria-label={plan.name}>
            {plan.featured && <Badge className="mk-plan__ribbon">Best value</Badge>}
            <div>
              <h3>{plan.name}</h3>
              <p className="mk-note">{plan.blurb}</p>
            </div>
            <div>
              <p className="mk-plan__price">{plan.price}</p>
              <p className="mk-note">{plan.per}</p>
            </div>
            <ul className="mk-ticks">
              {plan.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {signedIn ? (
              <ButtonLink to={plan.price === '₹0' ? HOME_PATH : PATHS.settingsBilling} variant={plan.featured ? 'primary' : 'secondary'} block>
                {plan.price === '₹0' ? 'Open umless' : 'Buy time'}
              </ButtonLink>
            ) : (
              <ButtonLink to={PATHS.signUp} variant={plan.featured ? 'primary' : 'secondary'} block>
                Start free
              </ButtonLink>
            )}
          </article>
        </li>
      ))}
    </ul>
  )
}
