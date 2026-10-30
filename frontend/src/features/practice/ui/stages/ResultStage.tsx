import { Banner } from '@/shared/ui'
import type { Transcript } from '../../api/practiceApi'
import type { ComponentProps } from 'react'
import ResultView from '../ResultView'

type ResultStageProps = Omit<ComponentProps<typeof ResultView>, 'transcript'> & { transcript: Transcript }

/** F4 with whether the take was saved to the user's past takes. */
export default function ResultStage(props: ResultStageProps) {
  const saved = props.transcript.take_id
  return (
    <>
      {saved && <Banner tone="success" title="Saved to your past takes." />}
      {/* null: the server tried to save it and couldn't; missing: no saving on this server. */}
      {saved === null && (
        <Banner tone="warning" role="alert" title="This take couldn't be saved">
          Download the transcript if you want to keep it.
        </Banner>
      )}
      <ResultView {...props} />
    </>
  )
}
