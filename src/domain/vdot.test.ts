import { describe, expect, it } from 'vitest'
import {
  equivalentTimeSec,
  isValidVdotInput,
  practicalEasyPace,
  trainingPaces,
  vdotForGoal,
  vdotFromPerformance,
} from './vdot'

describe('Daniels VDOT', () => {
  it('computes the anchors from the plan', () => {
    expect(vdotFromPerformance(2000, 7 * 60 + 28)).toBeCloseTo(49.56, 1)
    expect(vdotFromPerformance(1000, 3 * 60 + 25)).toBeCloseTo(50.76, 1)
    expect(vdotForGoal(5000, 17 * 60)).toBeCloseTo(60.19, 1)
  })

  it('rejects short or non-test efforts as VDOT anchors', () => {
    expect(isValidVdotInput(400, true)).toBe(false)
    expect(isValidVdotInput(2000, false)).toBe(false)
    expect(isValidVdotInput(2000, true)).toBe(true)
    expect(isValidVdotInput(1500, true)).toBe(true)
  })

  it('returns a 5k equivalent around 19:55 for VDOT 50', () => {
    const sec = equivalentTimeSec(50, 5000)
    expect(sec).toBeGreaterThan(19 * 60 + 30)
    expect(sec).toBeLessThan(20 * 60 + 10)
  })

  it('orders the pace bands from slow to fast', () => {
    const paces = trainingPaces(50)
    expect(paces.E.slowSecKm).toBeGreaterThan(paces.M.slowSecKm)
    expect(paces.M.slowSecKm).toBeGreaterThan(paces.T.slowSecKm)
    expect(paces.T.slowSecKm).toBeGreaterThan(paces.I.slowSecKm)
    expect(paces.I.slowSecKm).toBeGreaterThan(paces.R.slowSecKm)
    expect(paces.E.fastSecKm).toBeGreaterThan(paces.M.fastSecKm)
    expect(paces.M.fastSecKm).toBeGreaterThan(paces.T.fastSecKm)
    expect(paces.T.fastSecKm).toBeGreaterThan(paces.I.fastSecKm)
    expect(paces.I.fastSecKm).toBeGreaterThan(paces.R.fastSecKm)
  })

  it('uses a practical easy pace instead of the fast end of the E band', () => {
    const easy = practicalEasyPace(50)
    expect(easy.fastSecKm).toBeGreaterThan(5 * 60)
    expect(easy.slowSecKm).toBeGreaterThan(5 * 60 + 20)
    expect(easy.fastSecKm).toBeLessThan(easy.slowSecKm)
    const goal = practicalEasyPace(60)
    expect(goal.fastSecKm).toBeGreaterThan(4 * 60 + 15)
    expect(goal.slowSecKm).toBeLessThan(4 * 60 + 50)
  })

  it('keeps the current threshold pace near 4:11-4:17', () => {
    const paces = trainingPaces(50)
    expect(paces.T.slowSecKm).toBeGreaterThan(4 * 60 + 10)
    expect(paces.T.fastSecKm).toBeLessThan(4 * 60 + 20)
  })
})
