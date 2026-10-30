import { niceMax } from './chartScale'
import { cx } from './cx'
import './LineChart.css'

export type ChartPoint = { label: string; value: number }

type LineChartProps = {
  points: readonly ChartPoint[]
  /** The chart's text alternative: say what the line shows ("Fillers per minute fell from 4.2 to 2.1"). */
  description: string
  /** How many x labels to show at most; they're spread evenly and always include the last. */
  maxXLabels?: number
  formatValue?: (value: number) => string
  className?: string
}

// Drawing area in viewBox units; the SVG scales to its container's width.
const W = 600
const H = 220
const PAD = { left: 40, right: 20, top: 12, bottom: 40 }

/** A single-series line chart with an area fill, four gridlines and x labels. */
export default function LineChart({ points, description, maxXLabels = 5, formatValue = String, className }: LineChartProps) {
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')
  const area = points.length ? `${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}` : ''
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top)
  const every = Math.max(1, Math.ceil(points.length / maxXLabels))
  const labelled = points.map((_, i) => i).filter((i) => i === points.length - 1 || (i % every === 0 && points.length - 1 - i >= every / 2))

  return (
    <svg className={cx('ui-chart', className)} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={description}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="ui-chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text x={PAD.left - 10} y={y(t) + 4} textAnchor="end">
            {formatValue(Number(t.toFixed(2)))}
          </text>
        </g>
      ))}
      {points.length > 0 && (
        <>
          <polygon className="ui-chart__area" points={area} />
          <polyline className="ui-chart__line" points={line} />
          {points.map((p, i) => (
            <circle key={i} className="ui-chart__point" cx={x(i)} cy={y(p.value)} r={4} />
          ))}
          {labelled.map((i) => (
            <text key={i} x={x(i)} y={H - 14} textAnchor={i === 0 && points.length > 1 ? 'start' : i === points.length - 1 && points.length > 1 ? 'end' : 'middle'}>
              {points[i].label}
            </text>
          ))}
        </>
      )}
    </svg>
  )
}
