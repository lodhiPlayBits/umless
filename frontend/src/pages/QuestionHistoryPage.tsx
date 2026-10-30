import { QuestionProgressScreen } from '@/features/history'
import type { PageProps } from '@/pages/types'

export default function QuestionHistoryPage({ params }: PageProps) {
  return <QuestionProgressScreen questionId={params.questionId} />
}
