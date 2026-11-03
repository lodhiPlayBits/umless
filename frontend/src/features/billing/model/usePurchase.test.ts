import { describe, expect, it } from 'vitest'
import { LAUNCH_OFFER, PRICING } from '@/content/business'
import type { Pack } from '../api/billingApi'
import { packPrice, packWasPrice } from './usePurchase'

const pack = (id: Pack['id'], amountPaise: number): Pack => ({ id, label: id, seconds: 3600, amount_paise: amountPaise, currency: 'INR' })

describe('packWasPrice', () => {
  it('names the normal price while the launch offer runs and the server charges the offer price', () => {
    const [one, five] = PRICING.packs
    expect(packWasPrice(pack(one.id, one.rupees * 100))).toBe(LAUNCH_OFFER ? '₹49' : null)
    expect(packWasPrice(pack(five.id, five.rupees * 100))).toBe(LAUNCH_OFFER ? '₹199' : null)
  })

  it("claims no discount the server isn't giving: any other price, or an unknown pack, gets none", () => {
    const [one] = PRICING.packs
    expect(packWasPrice(pack(one.id, 4000))).toBeNull()
    expect(packWasPrice(pack('session_99' as Pack['id'], 2900))).toBeNull()
  })

  it('writes a pack price from paise', () => {
    expect(packPrice(pack('session_1', 2900))).toBe('₹29')
  })
})

describe('the launch offer in content/business.ts', () => {
  it('is 60 free minutes and prices 40% off the normal ones while it runs', () => {
    if (!LAUNCH_OFFER) {
      expect(PRICING.packs.map((p) => p.price)).toEqual(['₹49', '₹199'])
      return
    }
    expect(PRICING.free).toMatch(/^60 minutes/)
    expect(PRICING.packs.map((p) => [p.price, p.wasPrice])).toEqual([
      ['₹29', '₹49'],
      ['₹119', '₹199'],
    ])
    for (const p of PRICING.packs) {
      const was = Number(p.wasPrice!.slice(1))
      expect(1 - p.rupees / was).toBeGreaterThan(0.39)
      expect(1 - p.rupees / was).toBeLessThan(0.41)
    }
  })
})
