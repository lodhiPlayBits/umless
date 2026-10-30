import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuestionNotFound } from '@/features/questions'
import { SessionContext } from '@/shared/lib/session'
import NotFoundPage from './NotFoundPage'

describe('NotFoundPage', () => {
  it('signed in: says the page is missing and goes back to the questions', () => {
    render(<NotFoundPage />)
    expect(screen.getByRole('heading', { level: 1, name: "That page doesn't exist" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to questions' })).toHaveAttribute('href', '/questions')
  })

  it('signed out: offers home and pricing instead', () => {
    render(
      <SessionContext.Provider value={{ auth: 'clerk', status: 'signedOut' }}>
        <NotFoundPage />
      </SessionContext.Provider>,
    )
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('link', { name: 'Back to questions' })).toBeNull()
  })
})

describe('QuestionNotFound (E16)', () => {
  it('says the question is gone, with a way back', () => {
    render(<QuestionNotFound />)
    expect(screen.getByRole('heading', { level: 1, name: "That question doesn't exist any more" })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to questions' })).toHaveAttribute('href', '/questions')
  })
})
