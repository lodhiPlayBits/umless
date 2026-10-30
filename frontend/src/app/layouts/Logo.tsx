import { Link } from '@/shared/ui'
import './Logo.css'

export default function Logo({ to, className }: { to: string; className?: string }) {
  return (
    <Link to={to} className={`logo-mark ${className ?? ''}`.trim()} aria-label="umless home">
      um<span>less</span>
    </Link>
  )
}
