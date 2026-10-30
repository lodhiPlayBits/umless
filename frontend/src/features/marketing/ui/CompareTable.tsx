import { PRICING } from '@/content/business'
import { pricingRows } from '@/content/marketing'
import type { CompareCell } from '@/content/marketing'
import { Icon } from '@/shared/ui'
import './marketing.css'

function Cell({ value }: { value: CompareCell }) {
  return value === true ? (
    <td className="mk-compare__yes">
      <Icon name="check" label="Included" />
    </td>
  ) : (
    <td>{value}</td>
  )
}

/** What the free allowance and each pack include, side by side; scrolls sideways on phones. */
export default function CompareTable() {
  return (
    <div className="mk-table-wrap" tabIndex={0} role="region" aria-label="Compare free and paid practice time">
      <table className="mk-compare">
        <thead>
          <tr>
            <th scope="col">What you get</th>
            <th scope="col">Free</th>
            {PRICING.packs.map((pack) => (
              <th key={pack.name} scope="col">
                {pack.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pricingRows().map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <Cell value={row.free} />
              {row.packs.map((value, i) => (
                <Cell key={i} value={value} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
