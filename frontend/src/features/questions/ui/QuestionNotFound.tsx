import { PATHS } from '@/shared/config/paths'
import { ButtonLink, EmptyState } from '@/shared/ui'

/** E16: /practice/:id for a question that doesn't exist (deleted, maybe in another tab). */
export default function QuestionNotFound() {
  return (
    <EmptyState
      bare
      headingLevel={1}
      icon="list"
      title="That question doesn't exist any more"
      actions={
        <ButtonLink to={PATHS.questions} variant="primary">
          Back to questions
        </ButtonLink>
      }
    >
      It may have been deleted, maybe in another tab. Your other questions are still there.
    </EmptyState>
  )
}
