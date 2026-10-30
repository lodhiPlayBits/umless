import { PracticeRoute } from '@/features/practice'
import type { PageProps } from '@/pages/types'

export default function PracticePage({ params }: PageProps) {
  // Keyed by question: moving to the next question starts a fresh session.
  return <PracticeRoute key={params.questionId} questionId={params.questionId} />
}
