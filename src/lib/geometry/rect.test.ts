import { describe, expect, it } from 'vitest'

import { denormalizeRect, normalizeRect } from './rect'

describe('rect helpers', () => {
  it('normalizes drag coordinates', () => {
    const rect = normalizeRect(10, 20, 110, 220, 200, 400)
    expect(rect.x).toBeCloseTo(0.05)
    expect(rect.y).toBeCloseTo(0.05)
    expect(rect.width).toBeCloseTo(0.5)
    expect(rect.height).toBeCloseTo(0.5)
  })

  it('denormalizes rectangle', () => {
    const rect = denormalizeRect({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, 1000, 500)
    expect(rect.x).toBeCloseTo(100)
    expect(rect.y).toBeCloseTo(100)
    expect(rect.width).toBeCloseTo(300)
    expect(rect.height).toBeCloseTo(200)
  })
})
