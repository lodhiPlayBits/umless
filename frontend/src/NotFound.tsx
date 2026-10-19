import Link from './Link'

/** E16: an unknown URL, or /practice/:id for a question that no longer exists. */
export default function NotFound() {
  return (
    <div className="empty">
      <h1>That question doesn't exist any more</h1>
      <p className="muted small">It may have been deleted. Your other questions are still there.</p>
      <Link to="/" className="btn btn-primary">
        Back to questions
      </Link>
    </div>
  )
}
