import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as billingApi from '../api/billingApi'
import type { Account } from '../api/billingApi'
import { practiceTimeLabel, refreshAccountIfShown, setAccount, useAccount } from './account'

vi.mock('../api/billingApi', async (importOriginal) => ({ ...(await importOriginal<typeof billingApi>()), getAccount: vi.fn() }))
const getAccount = vi.mocked(billingApi.getAccount)

const account = (free: number, seconds = 0): Account => ({ metered: true, free_transcriptions_left: free, seconds_left: seconds, packs: [] })

function Balance({ name }: { name: string }) {
  const { account } = useAccount()
  return <p>{account ? `${name}: ${practiceTimeLabel(account)}` : `${name}: …`}</p>
}

beforeEach(() => getAccount.mockReset())

describe('useAccount (one balance for every screen)', () => {
  it('loads once for all the places that show it', async () => {
    getAccount.mockResolvedValue(account(3))
    render(
      <>
        <Balance name="card" />
        <Balance name="chip" />
      </>,
    )
    expect(await screen.findByText('card: 3 free left')).toBeInTheDocument()
    expect(screen.getByText('chip: 3 free left')).toBeInTheDocument()
    expect(getAccount).toHaveBeenCalledOnce()
  })

  it('a payment’s new balance shows everywhere without another request', async () => {
    getAccount.mockResolvedValue(account(0))
    render(<Balance name="card" />)
    await screen.findByText('card: Buy practice time')
    act(() => setAccount(account(0, 3600)))
    // The cache tells subscribers on the next tick.
    expect(await screen.findByText('card: 1 h left')).toBeInTheDocument()
    expect(getAccount).toHaveBeenCalledOnce()
  })

  it('after a transcription, refetches while the balance is on screen', async () => {
    getAccount.mockResolvedValueOnce(account(3)).mockResolvedValueOnce(account(2))
    render(<Balance name="card" />)
    await screen.findByText('card: 3 free left')
    act(() => refreshAccountIfShown())
    expect(await screen.findByText('card: 2 free left')).toBeInTheDocument()
  })

  it('does not fetch the balance when nothing shows it', async () => {
    refreshAccountIfShown()
    await waitFor(() => expect(getAccount).not.toHaveBeenCalled())
  })
})
