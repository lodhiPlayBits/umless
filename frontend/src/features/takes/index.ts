// Public surface of the takes feature: saved takes, their transcripts and how they're shown
// (ADR 0005 decision 1). Practice saves takes; History and the Dashboard read them.
export { default as PastTakes } from './ui/PastTakes'
export { default as TranscriptCard } from './ui/TranscriptCard'
export { summaryRows, transcriptFile, transcriptSegments } from './model/summaryText'
export { takeDate, takeStats } from './model/takesText'
export { invalidateTakes, removeCachedTake, useAllTakes, useQuestionTakes, useTake } from './model/useTakes'
export { listAllTakes, takesApi } from './api/takesApi'
export type { Take, TakeFilter, TakeSummary, TakesApi, Transcript } from './api/takesApi'
