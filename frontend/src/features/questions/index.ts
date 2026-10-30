// Public surface of the questions feature; other code imports only from here (ADR 0005 decision 1).
export { default as QuestionsScreen } from './ui/QuestionsScreen'
export { default as QuestionNotFound } from './ui/QuestionNotFound'
export type { Question } from './model/questionText'
export { useQuestions } from './model/useQuestions'
export { default as QuickAddQuestion } from './ui/QuickAddQuestion'
