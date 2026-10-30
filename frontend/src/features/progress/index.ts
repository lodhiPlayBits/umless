// Public surface of the progress feature: numbers derived from takes (ADR 0005 decision 6).
export {
  HIGH_FILLERS_PER_MINUTE,
  PACE_RANGE,
  bestTakeIds,
  dayGroup,
  daysBetween,
  fillersPerMinute,
  fillersTrend,
  groupByDay,
  questionProgress,
  relativeDay,
  sinceDaysAgo,
  startOfDay,
  takeTime,
  usageByQuestion,
  nextQuestion,
  paceNote,
  practiceStreak,
  weekComparison,
  weeklyTrend,
} from './model/progress'
export type { DayGroup, NextQuestion, QuestionProgress, QuestionUsage, WeekSummary } from './model/progress'
